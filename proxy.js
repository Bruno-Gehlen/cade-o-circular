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

// TTL do cache de posições. A SPTrans atualiza as posições dos veículos em
// ciclos de ~30s, então consultar o upstream com mais frequência que isso
// só gera carga desnecessária sem retornar dados mais novos.
const POSITIONS_TTL_MS = 20000;

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
