import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// HTTPS é obrigatório: a SPTrans desativou o acesso via HTTP em 02/01/2024
// (ver https://www.sptrans.com.br/desenvolvedores/api-do-olho-vivo-guia-de-referencia/documentacao-api/)
const SPTRANS_BASE_URL = 'https://api.olhovivo.sptrans.com.br/v2.1';

// Letreiros monitorados (sem o sufixo de tipo, ex.: "8082" de "8082-10")
const LINE_CODES = ['8012', '8022', '8082', '8083', '8084', '8085'];

// TTL do cache de posições. Alinhado com o intervalo de atualização do
// frontend (10s): N usuários simultânicos continuam gerando no máximo
// 1 chamada upstream /Posicao por janela de cache (~6/min no total).
const POSITIONS_TTL_MS = 10000;

// O frontend é servido por este mesmo servidor (mesma origem), portanto
// não é necessário habilitar CORS.
app.use(express.json());
app.use(express.static(__dirname));

// ---------------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------------

let isAuthenticated = false;
let authCookies = '';
// Promise compartilhada para evitar autenticações concorrentes quando várias
// requisições chegam ao mesmo tempo com a sessão ainda não estabelecida.
let authPromise = null;

async function doAuthenticate() {
  if (!process.env.SPTRANS_API_KEY) {
    console.error('❌ SPTRANS_API_KEY não definida.');
    console.error('   → Crie um arquivo .env na raiz do projeto com: SPTRANS_API_KEY=<seu-token>');
    console.error('   → Use o .env.example como referência.');
    isAuthenticated = false;
    return false;
  }

  try {
    console.log('🔐 Tentando autenticar na API SPTrans...');

    const response = await fetch(`${SPTRANS_BASE_URL}/Login/Autenticar?token=${process.env.SPTRANS_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // O Cloudflare na frente da API Olho Vivo responde 411 (Length Required)
        // para POST sem Content-Length — sem este header a autenticação sempre falha
        'Content-Length': '0'
      }
    });

    // A API retorna o JSON literal true/false indicando se o token foi aceito
    const body = (await response.text()).trim();
    const cookie = response.headers.get('set-cookie');

    if (response.ok && body === 'true' && cookie) {
      authCookies = cookie;
      isAuthenticated = true;
      console.log('✅ Autenticado na API SPTrans');
      return true;
    }

    console.error(`❌ Falha na autenticação SPTrans (HTTP ${response.status}, resposta: ${body.slice(0, 200)})`);
    if (response.ok && body === 'false') {
      console.error('   → A API recusou o token. Verifique se SPTRANS_API_KEY no .env está correta (sem aspas ou espaços extras).');
    }
    isAuthenticated = false;
    return false;
  } catch (error) {
    console.error('❌ Erro na autenticação:', error.message);
    isAuthenticated = false;
    return false;
  }
}

function authenticate() {
  if (!authPromise) {
    authPromise = doAuthenticate().finally(() => { authPromise = null; });
  }
  return authPromise;
}

// Realiza uma chamada autenticada à API Olho Vivo. Se a sessão tiver expirado
// (401/403), re-autentica uma única vez e tenta novamente.
async function fetchWithAuth(url, options = {}) {
  const withCookies = (opts) => ({
    ...opts,
    headers: { ...(opts.headers || {}), 'Cookie': authCookies }
  });

  let response = await fetch(url, withCookies(options));

  if (response.status === 401 || response.status === 403) {
    console.warn('🔁 Sessão SPTrans expirada, re-autenticando...');
    isAuthenticated = false;
    const success = await authenticate();
    if (success) {
      response = await fetch(url, withCookies(options));
    }
  }

  return response;
}

// Middleware para garantir autenticação
async function ensureAuthenticated(req, res, next) {
  if (!isAuthenticated) {
    const success = await authenticate();
    if (!success) {
      return res.status(503).json({
        error: 'Falha na autenticação com API SPTrans',
        details: 'Verifique se o token está correto no arquivo .env'
      });
    }
  }
  next();
}

// ---------------------------------------------------------------------------
// Cache de posições (1 chamada upstream /Posicao cobre todas as linhas)
// ---------------------------------------------------------------------------

let positionsCache = { at: 0, hr: null, lines: null };
let positionsPromise = null;

// Busca as posições de TODOS os veículos da cidade em uma única chamada
// (GET /Posicao) e filtra apenas as linhas monitoradas. O resultado fica
// em cache por POSITIONS_TTL_MS, então N usuários simultânicos continuam
// gerando no máximo 1 chamada upstream por janela de cache.
async function getPositions() {
  const isFresh = Date.now() - positionsCache.at < POSITIONS_TTL_MS;
  if (isFresh && positionsCache.lines) {
    return positionsCache;
  }

  // Deduplica atualizações concorrentes do cache
  if (!positionsPromise) {
    positionsPromise = (async () => {
      try {
        console.log('🚌 Atualizando cache de posições (GET /Posicao)...');
        const response = await fetchWithAuth(`${SPTRANS_BASE_URL}/Posicao`);

        if (!response.ok) {
          throw new Error(`SPTrans /Posicao retornou HTTP ${response.status}`);
        }

        const data = await response.json();
        const allLines = Array.isArray(data.l) ? data.l : [];
        const lines = allLines.filter(line =>
          LINE_CODES.includes((line.c || '').split('-')[0])
        );

        positionsCache = { at: Date.now(), hr: data.hr || null, lines };
        console.log(`✅ Cache atualizado: ${lines.length} linhas monitoradas localizadas (hr: ${positionsCache.hr})`);
      } catch (error) {
        // Em caso de falha no upstream, serve o cache antigo se existir
        if (positionsCache.lines) {
          console.warn(`⚠️ Falha ao atualizar posições, servindo cache anterior: ${error.message}`);
        } else {
          throw error;
        }
      }
      return positionsCache;
    })().finally(() => { positionsPromise = null; });
  }

  return positionsPromise;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

// Status local do proxy — não consulta a SPTrans (a API Olho Vivo não possui
// endpoint /status documentado).
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    authenticated: isAuthenticated,
    cacheAgeMs: positionsCache.lines ? Date.now() - positionsCache.at : null,
    timestamp: new Date().toISOString()
  });
});

// Posições de todas as linhas monitoradas em um único response.
// Formato segue o retorno oficial de GET /Posicao (categoria "Posição dos
// veículos"), já filtrado para as linhas de interesse.
app.get('/api/positions', ensureAuthenticated, async (req, res) => {
  try {
    const cache = await getPositions();
    res.json({
      success: true,
      hr: cache.hr,
      lines: cache.lines || [],
      cachedAt: new Date(cache.at).toISOString(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao buscar posições:', error.message);
    res.status(502).json({
      error: error.message,
      lines: [],
      timestamp: new Date().toISOString()
    });
  }
});

// Posições de uma linha específica (letreiro, ex.: 8082). Servido a partir do
// mesmo cache compartilhado — não gera chamadas upstream adicionais.
app.get('/api/lines/:code/positions', ensureAuthenticated, async (req, res) => {
  try {
    const { code } = req.params;
    const cache = await getPositions();

    const matchingLines = (cache.lines || []).filter(line =>
      (line.c || '').split('-')[0] === code
    );

    const buses = [];
    const lineInfos = [];

    for (const line of matchingLines) {
      const vehicles = Array.isArray(line.vs) ? line.vs : [];
      for (const v of vehicles) {
        buses.push({
          p: v.p,
          py: v.py,
          px: v.px,
          a: !!v.a,
          ta: v.ta || null,
          sl: line.sl,     // sentido de operação (1 = TP->TS, 2 = TS->TP)
          lineId: line.cl  // código identificador da linha
        });
      }
      lineInfos.push({ id: line.cl, name: line.c, direction: line.sl });
    }

    res.json({
      success: true,
      lineCode: code,
      lineInfo: lineInfos,
      buses,
      hr: cache.hr,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`❌ Erro ao buscar posições da linha ${req.params.code}:`, error.message);
    res.status(502).json({
      error: error.message,
      lineCode: req.params.code,
      buses: [],
      timestamp: new Date().toISOString()
    });
  }
});

// Cache letreiro → códigos cl (por sentido). Os códigos são estáveis,
// então o cache é válido pelo tempo de vida do processo.
const lineCodeCache = new Map(); // "8085" -> [{ cl, sl, c }]

async function getLineCodes(letreiro) {
  if (!lineCodeCache.has(letreiro)) {
    const response = await fetchWithAuth(`${SPTRANS_BASE_URL}/Linha/Buscar?termosBusca=${letreiro}`);
    if (!response.ok) {
      throw new Error(`SPTrans /Linha/Buscar retornou HTTP ${response.status}`);
    }
    const lines = await response.json();
    const codes = (Array.isArray(lines) ? lines : [])
      .filter((l) => String(l.lt) === letreiro)
      .map((l) => ({ cl: l.cl, sl: l.sl, c: `${l.lt}-${l.tl}` }));
    lineCodeCache.set(letreiro, codes);
  }
  return lineCodeCache.get(letreiro);
}

// Previsão de chegada por parada. Dois modos:
// - ?lines=8012,8085 → usa GET /Previsao?codigoParada&codigoLinha (documentado)
//   para cada linha informada e mescla o resultado. É o modo usado pelo
//   frontend: o endpoint agregado /Previsao/Parada nem sempre inclui as
//   linhas circulares na cadeia de previsão.
// - sem ?lines → GET /Previsao/Parada (todas as linhas da parada).
// Cache curto por parada+linhas: N usuários iguais = 1 rodada upstream.
const arrivalsCache = new Map(); // "stopId:lines" -> { at, payload }
const ARRIVALS_TTL_MS = 20000;

app.get('/api/stops/:stopId/arrivals', (req, res, next) => {
  if (!/^\d+$/.test(req.params.stopId)) {
    return res.status(400).json({ error: 'codigoParada inválido', stopId: req.params.stopId });
  }
  next();
}, ensureAuthenticated, async (req, res) => {
  const { stopId } = req.params;
  const requestedLines = (req.query.lines || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{4}$/.test(s));

  try {
    const cacheKey = `${stopId}:${requestedLines.slice().sort().join(',')}`;
    const cached = arrivalsCache.get(cacheKey);
    if (cached && Date.now() - cached.at < ARRIVALS_TTL_MS) {
      return res.json(cached.payload);
    }

    let payload;

    if (requestedLines.length > 0) {
      // Modo linha-específica: uma chamada /Previsao por cl (sentido) de cada linha
      const perLine = await Promise.all(requestedLines.map(async (letreiro) => {
        const codes = await getLineCodes(letreiro);
        const results = await Promise.all(codes.map(async ({ cl, sl, c }) => {
          const r = await fetchWithAuth(`${SPTRANS_BASE_URL}/Previsao?codigoParada=${stopId}&codigoLinha=${cl}`);
          if (!r.ok) {
            console.warn(`⚠️ /Previsao parada=${stopId} linha=${cl} → HTTP ${r.status}`);
            return { hr: null, stop: null, line: null };
          }
          const d = await r.json();
          const lineData = d.p && Array.isArray(d.p.l) && d.p.l.length > 0 ? d.p.l[0] : null;
          return {
            hr: d.hr || null,
            stop: d.p ? { cp: d.p.cp, np: d.p.np, py: d.p.py, px: d.p.px } : null,
            line: lineData
              ? {
                  c: lineData.c || c,
                  cl: lineData.cl || cl,
                  sl: lineData.sl ?? sl,
                  destino: lineData.lt0,
                  origem: lineData.lt1,
                  veiculos: (Array.isArray(lineData.vs) ? lineData.vs : []).map((v) => ({
                    p: v.p,
                    t: v.t,
                    a: !!v.a
                  }))
                }
              : { c, cl, sl, destino: null, origem: null, veiculos: [] }
          };
        }));
        return results;
      }));

      const flat = perLine.flat();
      payload = {
        success: true,
        hr: flat.find((r) => r.hr)?.hr || null,
        stop: flat.find((r) => r.stop)?.stop || null,
        lines: flat.map((r) => r.line).filter(Boolean),
        timestamp: new Date().toISOString()
      };
    } else {
      // Modo agregado: GET /Previsao/Parada (todas as linhas da parada)
      const response = await fetchWithAuth(`${SPTRANS_BASE_URL}/Previsao/Parada?codigoParada=${stopId}`);

      if (!response.ok) {
        throw new Error(`SPTrans /Previsao/Parada retornou HTTP ${response.status}`);
      }

      const data = await response.json();

      // p é null quando a parada não é encontrada na API
      payload = {
        success: true,
        hr: data.hr || null, // horário de referência das previsões
        stop: data.p
          ? { cp: data.p.cp, np: data.p.np, py: data.p.py, px: data.p.px }
          : null,
        lines: data.p && Array.isArray(data.p.l)
          ? data.p.l.map((line) => ({
              c: line.c,           // letreiro completo (ex.: "8082-10")
              cl: line.cl,         // código identificador da linha
              sl: line.sl,         // sentido
              destino: line.lt0,
              origem: line.lt1,
              veiculos: (Array.isArray(line.vs) ? line.vs : []).map((v) => ({
                p: v.p,            // prefixo do veículo
                t: v.t,            // horário previsto de chegada na parada
                a: !!v.a           // acessível
              }))
            }))
          : [],
        timestamp: new Date().toISOString()
      };
    }

    arrivalsCache.set(cacheKey, { at: Date.now(), payload });
    // Evicção simples: remove a entrada mais antiga quando o cache cresce demais
    if (arrivalsCache.size > 100) {
      arrivalsCache.delete(arrivalsCache.keys().next().value);
    }

    res.json(payload);
  } catch (error) {
    console.error(`❌ Erro ao buscar previsão da parada ${stopId}:`, error.message);
    res.status(502).json({
      error: error.message,
      stopId,
      timestamp: new Date().toISOString()
    });
  }
});

// Busca de linhas por termo (GET /Linha/Buscar da documentação oficial)
app.get('/api/lines/search', ensureAuthenticated, async (req, res) => {
  try {
    const { term } = req.query;

    const response = await fetchWithAuth(`${SPTRANS_BASE_URL}/Linha/Buscar?termosBusca=${encodeURIComponent(term || '')}`);
    const lines = await response.json();
    res.json(lines);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Servir a aplicação
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Re-autenticação periódica para manter a sessão aquecida
setInterval(async () => {
  console.log('🔄 Re-autenticando automaticamente...');
  isAuthenticated = false;
  await authenticate();
}, 15 * 60 * 1000);

// Inicialização
async function startServer() {
  try {
    await authenticate();

    app.listen(PORT, () => {
      console.log(`🚀 Servidor iniciado com sucesso!`);
      console.log(`🌐 Acesse: http://localhost:${PORT}`);
      console.log(`📊 Status: http://localhost:${PORT}/api/status`);
      console.log(`🚌 Posições (todas as linhas): http://localhost:${PORT}/api/positions`);
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();
