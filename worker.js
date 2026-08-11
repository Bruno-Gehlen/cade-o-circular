import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import {
  SPTRANS_BASE_URL,
  LINE_CODES,
  POSITIONS_TTL_MS,
  SPTRANS_COMMON_HEADERS,
  REAUTH_INTERVAL_MS
} from './sharedConfig.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

if (!process.env.SPTRANS_API_KEY) {
  console.error('❌ SPTRANS_API_KEY não definida no worker.');
  process.exit(1);
}

if (!process.env.WORKER_API_KEY) {
  console.error('❌ WORKER_API_KEY não definida. O web service precisa desta chave para falar com o worker.');
  process.exit(1);
}

app.use(express.json());

// Protege todos os endpoints do worker: apenas o web service autorizado pode acessar.
app.use((req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (token !== process.env.WORKER_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// ---------------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------------

let isAuthenticated = false;
let authCookies = '';
let authPromise = null;

let authFailureCount = 0;
let lastAuthFailureAt = 0;
const AUTH_BACKOFF_INITIAL_MS = 30000;
const AUTH_BACKOFF_MAX_MS = 5 * 60 * 1000;

function getAuthBackoffMs() {
  return Math.min(AUTH_BACKOFF_INITIAL_MS * Math.pow(2, authFailureCount), AUTH_BACKOFF_MAX_MS);
}

function isInAuthBackoff() {
  if (authFailureCount === 0) return false;
  return Date.now() - lastAuthFailureAt < getAuthBackoffMs();
}

function recordAuthSuccess() {
  authFailureCount = 0;
  lastAuthFailureAt = 0;
}

function recordAuthFailure() {
  authFailureCount++;
  lastAuthFailureAt = Date.now();
}

function looksLikeCloudflareIpBan(body) {
  return typeof body === 'string' && body.includes('"error_code":1006') && body.includes('ip_banned');
}

async function doAuthenticate() {
  if (isInAuthBackoff()) {
    const waitSec = Math.ceil((lastAuthFailureAt + getAuthBackoffMs() - Date.now()) / 1000);
    console.warn(`⏳ Autenticação SPTrans em backoff. Próxima tentativa em ${waitSec}s.`);
    isAuthenticated = false;
    return false;
  }

  try {
    console.log('🔐 [worker] Tentando autenticar na API SPTrans...');

    const response = await fetch(`${SPTRANS_BASE_URL}/Login/Autenticar?token=${process.env.SPTRANS_API_KEY}`, {
      method: 'POST',
      headers: {
        ...SPTRANS_COMMON_HEADERS,
        'Content-Type': 'application/json',
        // O Cloudflare na frente da API Olho Vivo responde 411 (Length Required)
        // para POST sem Content-Length.
        'Content-Length': '0'
      }
    });

    const body = (await response.text()).trim();
    const cookie = response.headers.get('set-cookie');

    if (response.ok && body === 'true' && cookie) {
      authCookies = cookie;
      isAuthenticated = true;
      recordAuthSuccess();
      console.log('✅ [worker] Autenticado na API SPTrans');
      return true;
    }

    console.error(`❌ [worker] Falha na autenticação SPTrans (HTTP ${response.status} ${response.statusText})`);
    console.error(`   → Corpo: ${body.slice(0, 500)}`);
    if (looksLikeCloudflareIpBan(body)) {
      console.error('   → Cloudflare Error 1006: o IP deste worker foi banido pela SPTrans.');
      console.error('   → Solução: mude o IP de saída deste worker (outra região/provedor).');
    } else if (response.ok && body === 'false') {
      console.error('   → A API recusou o token. Verifique SPTRANS_API_KEY.');
    }
    isAuthenticated = false;
    recordAuthFailure();
    return false;
  } catch (error) {
    console.error('❌ [worker] Erro na autenticação:', error.message);
    isAuthenticated = false;
    recordAuthFailure();
    return false;
  }
}

function authenticate() {
  if (!authPromise) {
    authPromise = doAuthenticate().finally(() => { authPromise = null; });
  }
  return authPromise;
}

async function fetchWithAuth(url, options = {}) {
  const withCookies = (opts) => ({
    ...opts,
    headers: {
      ...SPTRANS_COMMON_HEADERS,
      ...(opts.headers || {}),
      'Cookie': authCookies
    }
  });

  let response = await fetch(url, withCookies(options));

  if (response.status === 401 || response.status === 403) {
    console.warn('🔁 [worker] Sessão SPTrans expirada, re-autenticando...');
    isAuthenticated = false;
    const success = await authenticate();
    if (success) {
      response = await fetch(url, withCookies(options));
    }
  }

  return response;
}

// ---------------------------------------------------------------------------
// Cache de posições
// ---------------------------------------------------------------------------

let positionsCache = { at: 0, hr: null, lines: null };
let positionsPromise = null;

async function getPositions() {
  const isFresh = Date.now() - positionsCache.at < POSITIONS_TTL_MS;
  if (isFresh && positionsCache.lines) {
    return positionsCache;
  }

  if (!positionsPromise) {
    positionsPromise = (async () => {
      try {
        console.log('🚌 [worker] Atualizando cache de posições...');
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
        console.log(`✅ [worker] Cache atualizado: ${lines.length} linhas (hr: ${positionsCache.hr})`);
      } catch (error) {
        if (positionsCache.lines) {
          console.warn(`⚠️ [worker] Falha ao atualizar posições, servindo cache anterior: ${error.message}`);
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
// Cache letreiro → códigos cl (por sentido)
// ---------------------------------------------------------------------------

const lineCodeCache = new Map();

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

// ---------------------------------------------------------------------------
// Endpoints internos (consumidos apenas pelo web service)
// ---------------------------------------------------------------------------

app.get('/health', async (req, res) => {
  res.json({
    status: 'ok',
    authenticated: isAuthenticated,
    cacheAgeMs: positionsCache.lines ? Date.now() - positionsCache.at : null,
    timestamp: new Date().toISOString()
  });
});

app.get('/positions', async (req, res) => {
  try {
    if (!isAuthenticated) {
      const success = await authenticate();
      if (!success) {
        return res.status(503).json({ error: 'Falha na autenticação com API SPTrans' });
      }
    }
    const cache = await getPositions();
    res.json({
      success: true,
      hr: cache.hr,
      lines: cache.lines || [],
      cachedAt: new Date(cache.at).toISOString(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[worker] Erro ao buscar posições:', error.message);
    res.status(502).json({ error: error.message, lines: [], timestamp: new Date().toISOString() });
  }
});

const arrivalsCache = new Map();
const ARRIVALS_TTL_MS = 20000;

app.get('/stops/:stopId/arrivals', async (req, res) => {
  if (!/^\d+$/.test(req.params.stopId)) {
    return res.status(400).json({ error: 'codigoParada inválido', stopId: req.params.stopId });
  }

  const { stopId } = req.params;
  const requestedLines = (req.query.lines || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[0-9A-Za-z]{4}$/.test(s));

  try {
    if (!isAuthenticated) {
      const success = await authenticate();
      if (!success) {
        return res.status(503).json({ error: 'Falha na autenticação com API SPTrans' });
      }
    }

    const cacheKey = `${stopId}:${requestedLines.slice().sort().join(',')}`;
    const cached = arrivalsCache.get(cacheKey);
    if (cached && Date.now() - cached.at < ARRIVALS_TTL_MS) {
      return res.json(cached.payload);
    }

    let payload;

    if (requestedLines.length > 0) {
      const perLine = await Promise.all(requestedLines.map(async (letreiro) => {
        const codes = await getLineCodes(letreiro);
        const results = await Promise.all(codes.map(async ({ cl, sl, c }) => {
          const r = await fetchWithAuth(`${SPTRANS_BASE_URL}/Previsao?codigoParada=${stopId}&codigoLinha=${cl}`);
          if (!r.ok) {
            console.warn(`⚠️ [worker] /Previsao parada=${stopId} linha=${cl} → HTTP ${r.status}`);
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
      const response = await fetchWithAuth(`${SPTRANS_BASE_URL}/Previsao/Parada?codigoParada=${stopId}`);
      if (!response.ok) {
        throw new Error(`SPTrans /Previsao/Parada retornou HTTP ${response.status}`);
      }
      const data = await response.json();
      payload = {
        success: true,
        hr: data.hr || null,
        stop: data.p
          ? { cp: data.p.cp, np: data.p.np, py: data.p.py, px: data.p.px }
          : null,
        lines: data.p && Array.isArray(data.p.l)
          ? data.p.l.map((line) => ({
              c: line.c,
              cl: line.cl,
              sl: line.sl,
              destino: line.lt0,
              origem: line.lt1,
              veiculos: (Array.isArray(line.vs) ? line.vs : []).map((v) => ({
                p: v.p,
                t: v.t,
                a: !!v.a
              }))
            }))
          : [],
        timestamp: new Date().toISOString()
      };
    }

    arrivalsCache.set(cacheKey, { at: Date.now(), payload });
    if (arrivalsCache.size > 100) {
      arrivalsCache.delete(arrivalsCache.keys().next().value);
    }

    res.json(payload);
  } catch (error) {
    console.error(`[worker] Erro ao buscar previsão da parada ${stopId}:`, error.message);
    res.status(502).json({ error: error.message, stopId, timestamp: new Date().toISOString() });
  }
});

app.get('/lines/search', async (req, res) => {
  try {
    if (!isAuthenticated) {
      const success = await authenticate();
      if (!success) {
        return res.status(503).json({ error: 'Falha na autenticação com API SPTrans' });
      }
    }
    const { term } = req.query;
    const response = await fetchWithAuth(`${SPTRANS_BASE_URL}/Linha/Buscar?termosBusca=${encodeURIComponent(term || '')}`);
    const lines = await response.json();
    res.json(lines);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------

async function startWorker() {
  await authenticate();

  // Loop de atualização de posições a cada POSITIONS_TTL_MS
  setInterval(async () => {
    if (isInAuthBackoff()) return;
    if (isAuthenticated) {
      try {
        await getPositions();
      } catch (error) {
        console.error('[worker] Falha no fetch periódico de posições:', error.message);
      }
    } else {
      await authenticate();
    }
  }, POSITIONS_TTL_MS);

  // Re-autenticação periódica
  setInterval(async () => {
    if (isInAuthBackoff()) {
      const waitSec = Math.ceil((lastAuthFailureAt + getAuthBackoffMs() - Date.now()) / 1000);
      console.log(`🔄 [worker] Re-autenticação automática adiada (backoff ativo, tentativa em ${waitSec}s)`);
      return;
    }
    console.log('🔄 [worker] Re-autenticando automaticamente...');
    isAuthenticated = false;
    await authenticate();
  }, REAUTH_INTERVAL_MS);

  app.listen(PORT, () => {
    console.log(`🚀 [worker] Servidor worker iniciado na porta ${PORT}`);
  });
}

startWorker().catch((error) => {
  console.error('❌ [worker] Erro fatal ao iniciar:', error);
  process.exit(1);
});
