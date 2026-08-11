import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { POSITIONS_TTL_MS } from './sharedConfig.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const WORKER_URL = process.env.WORKER_URL?.replace(/\/$/, '');
const WORKER_API_KEY = process.env.WORKER_API_KEY;

if (!WORKER_URL || !WORKER_API_KEY) {
  console.error('❌ WORKER_URL e WORKER_API_KEY devem estar definidos no ambiente.');
  console.error('   → O web service precisa saber como falar com o worker.');
  process.exit(1);
}

function workerHeaders() {
  return {
    'Authorization': `Bearer ${WORKER_API_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function fetchFromWorker(path, options = {}) {
  const url = `${WORKER_URL}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      ...workerHeaders(),
      ...(options.headers || {})
    }
  });
}

// O frontend é servido por este mesmo servidor (mesma origem), portanto
// não é necessário habilitar CORS.
app.use(express.json());
app.use(express.static(__dirname));

// ---------------------------------------------------------------------------
// Endpoints do frontend (encaminham para o worker)
// ---------------------------------------------------------------------------

app.get('/api/status', async (req, res) => {
  try {
    const response = await fetchFromWorker('/health');
    const data = await response.json();
    res.json({
      status: 'ok',
      authenticated: data.authenticated,
      cacheAgeMs: data.cacheAgeMs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao consultar worker /health:', error.message);
    res.status(503).json({
      status: 'error',
      authenticated: false,
      error: 'Worker indisponível',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/positions', async (req, res) => {
  try {
    const response = await fetchFromWorker('/positions');
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('❌ Erro ao consultar worker /positions:', error.message);
    res.status(502).json({
      error: error.message,
      lines: [],
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/lines/:code/positions', async (req, res) => {
  try {
    const { code } = req.params;
    const response = await fetchFromWorker('/positions');
    const data = await response.json();

    const matchingLines = (data.lines || []).filter(line =>
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
          sl: line.sl,
          lineId: line.cl
        });
      }
      lineInfos.push({ id: line.cl, name: line.c, direction: line.sl });
    }

    res.json({
      success: true,
      lineCode: code,
      lineInfo: lineInfos,
      buses,
      hr: data.hr,
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

app.get('/api/stops/:stopId/arrivals', async (req, res) => {
  if (!/^\d+$/.test(req.params.stopId)) {
    return res.status(400).json({ error: 'codigoParada inválido', stopId: req.params.stopId });
  }

  try {
    const { stopId } = req.params;
    const lines = req.query.lines || '';
    const path = `/stops/${stopId}/arrivals${lines ? `?lines=${encodeURIComponent(lines)}` : ''}`;
    const response = await fetchFromWorker(path);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error(`❌ Erro ao buscar previsão da parada ${req.params.stopId}:`, error.message);
    res.status(502).json({
      error: error.message,
      stopId: req.params.stopId,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/lines/search', async (req, res) => {
  try {
    const term = encodeURIComponent(req.query.term || '');
    const response = await fetchFromWorker(`/lines/search?term=${term}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('❌ Erro ao buscar linhas:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Servir a aplicação
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Web service iniciado na porta ${PORT}`);
  console.log(`🌐 Acesse: http://localhost:${PORT}`);
  console.log(`📊 Status: http://localhost:${PORT}/api/status`);
  console.log(`🔗 Worker: ${WORKER_URL}`);
});
