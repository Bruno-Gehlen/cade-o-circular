import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const SPTRANS_BASE_URL = 'http://api.olhovivo.sptrans.com.br/v2.1';

// Configuração CORS
app.use(cors({
  origin: '*',
  credentials: true
}));

app.use(express.json());
app.use(express.static(__dirname));

// Variáveis de autenticação
let isAuthenticated = false;
let authCookies = '';

// Função de autenticação
async function authenticate() {
  try {
    console.log('🔐 Tentando autenticar na API SPTrans...');
    
    const response = await fetch(`${SPTRANS_BASE_URL}/Login/Autenticar?token=${process.env.SPTRANS_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (response.ok && response.headers.get('set-cookie')) {
      authCookies = response.headers.get('set-cookie');
      isAuthenticated = true;
      console.log('✅ Autenticado na API SPTrans');
      return true;
    } else {
      console.error('❌ Falha na autenticação SPTrans');
      isAuthenticated = false;
      return false;
    }
  } catch (error) {
    console.error('❌ Erro na autenticação:', error.message);
    isAuthenticated = false;
    return false;
  }
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

// ENDPOINT CORRIGIDO: Status da API
app.get('/api/status', ensureAuthenticated, async (req, res) => {
  try {
    const response = await fetch(`${SPTRANS_BASE_URL}/status`, {
      headers: {
        'Cookie': authCookies
      }
    });
    
    const data = await response.text();
    res.json({ 
      status: 'ok',
      authenticated: isAuthenticated,
      sptransStatus: data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ENDPOINT CORRIGIDO: Posições dos ônibus por linha
app.get('/api/lines/:code/positions', ensureAuthenticated, async (req, res) => {
  try {
    const { code } = req.params;
    console.log(`🚌 Buscando posições para linha: ${code}`);

    // Primeiro busca o código da linha
    const lineResponse = await fetch(`${SPTRANS_BASE_URL}/Linha/Buscar?termosBusca=${code}`, {
      headers: {
        'Cookie': authCookies
      }
    });

    if (!lineResponse.ok) {
      throw new Error(`Erro ao buscar linha: ${lineResponse.status}`);
    }

    const lines = await lineResponse.json();
    console.log(`📋 Linhas encontradas: ${Array.isArray(lines) ? lines.length : 0}`);

    if (!lines || lines.length === 0) {
      return res.json({ 
        error: `Linha ${code} não encontrada`,
        buses: [],
        lineInfo: null
      });
    }

    // Pega a primeira linha que corresponde (tenta diferentes nomes retornados pela API)
    const targetLine = lines.find(line => {
      const display = (line.letreiro || line.lt || line.Letreiro || line.tp || line.c || '').toString();
      return display.includes(code);
    }) || lines[0];

    const lineId = targetLine.cl || targetLine.CodigoLinha || targetLine.cl || targetLine.cl;
    const lineName = targetLine.letreiro || targetLine.lt || targetLine.Letreiro || targetLine.tp || targetLine.c || '';
    const lineDirection = targetLine.sentido || targetLine.Sentido || targetLine.sl || null;

    console.log(`🎯 Linha selecionada: ${lineName} (ID: ${lineId})`);

    // Busca as posições dos ônibus desta linha
    const positionResponse = await fetch(`${SPTRANS_BASE_URL}/Posicao/Linha?codigoLinha=${lineId}`, {
      headers: {
        'Cookie': authCookies
      }
    });

    if (!positionResponse.ok) {
      throw new Error(`Erro ao buscar posições: ${positionResponse.status}`);
    }

    const positionData = await positionResponse.json();

    // A API pode retornar vs no root (Posicao/Linha) ou um objeto l[] com vs (em outros endpoints)
    let vehicles = [];
    if (Array.isArray(positionData.vs)) {
      vehicles = positionData.vs;
    } else if (Array.isArray(positionData.l) && positionData.l.length > 0 && Array.isArray(positionData.l[0].vs)) {
      vehicles = positionData.l[0].vs;
    }

    // Normaliza os veículos para manter as chaves usadas pela API original (p, py, px, a, ta)
    const buses = vehicles.map(bus => ({
      p: bus.p || bus.Prefixo || bus.prefixo,
      py: bus.py || bus.py || bus.py === 0 ? bus.py : (bus.py || bus.py),
      px: bus.px || bus.px || bus.px === 0 ? bus.px : (bus.px || bus.px),
      a: typeof bus.a !== 'undefined' ? bus.a : (bus.a || false),
      ta: bus.ta || bus.Ta || bus.ta || null,
      raw: bus
    }));

    console.log(`🚌 Ônibus encontrados: ${buses.length}`);

    res.json({
      success: true,
      lineCode: code,
      lineInfo: {
        id: lineId,
        name: lineName,
        direction: lineDirection
      },
      buses: buses,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`❌ Erro ao buscar posições da linha ${req.params.code}:`, error.message);
    res.status(400).json({ 
      error: error.message,
      lineCode: req.params.code,
      buses: [],
      timestamp: new Date().toISOString()
    });
  }
});

// ENDPOINT ADICIONAL: Buscar linhas
app.get('/api/lines/search', ensureAuthenticated, async (req, res) => {
  try {
    const { term } = req.query;
    
    const response = await fetch(`${SPTRANS_BASE_URL}/Linha/Buscar?termosBusca=${term}`, {
      headers: {
        'Cookie': authCookies
      }
    });

    const lines = await response.json();
    res.json(lines);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Servir arquivos estáticos
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Re-autenticação automática a cada 15 minutos
setInterval(async () => {
  console.log('🔄 Re-autenticando automaticamente...');
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
      console.log(`🚌 Exemplo: http://localhost:${PORT}/api/lines/8082/positions`);
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();
