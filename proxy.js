
// proxy.js - Servidor proxy para resolver CORS da API SPTrans (ES Modules)
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3010; // Usar porta diferente do servidor principal

// Configuração CORS para permitir o frontend
app.use(cors({
  origin: [
    'http://127.0.0.1:5500', 
    'http://localhost:5500', 
    'http://localhost:3000'
  ],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json());

// Variáveis para gerenciar a sessão da API SPTrans
let sessionCookie = null;
const SPTRANS_API_KEY = process.env.SPTRANS_API_KEY;
const SPTRANS_BASE_URL = 'http://api.olhovivo.sptrans.com.br/v2.1';

// Função para autenticar na API SPTrans
async function authenticate() {
  if (!SPTRANS_API_KEY) {
    console.error('SPTRANS_API_KEY não definida no arquivo .env');
    return false;
  }

  try {
    console.log('Tentando autenticar na API SPTrans...');
    const response = await fetch(`${SPTRANS_BASE_URL}/Login/Autenticar?token=${SPTRANS_API_KEY}`, {
      method: 'POST',
    });

    if (response.ok && response.headers.get('set-cookie')) {
      sessionCookie = response.headers.get('set-cookie');
      console.log('✅ Autenticado com sucesso na API SPTrans');
      return true;
    } else {
      console.error('❌ Falha na autenticação com a API SPTrans:', response.status);
      sessionCookie = null;
      return false;
    }
  } catch (error) {
    console.error('❌ Erro na autenticação:', error.message);
    sessionCookie = null;
    return false;
  }
}

// Middleware para garantir autenticação
async function ensureAuthenticated(req, res, next) {
  if (!sessionCookie) {
    const success = await authenticate();
    if (!success) {
      return res.status(500).json({ 
        error: 'Falha na autenticação com a API SPTrans',
        authenticated: false
      });
    }
  }
  next();
}

// Middleware para logs de debug
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Rota de health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    authenticated: !!sessionCookie,
    timestamp: new Date().toISOString()
  });
});

// Rota proxy para verificar status
app.get('/api/status', (req, res) => {
  res.json({ 
    authenticated: !!sessionCookie,
    message: sessionCookie ? 'Conectado à API SPTrans' : 'Desconectado da API SPTrans',
    timestamp: new Date().toISOString()
  });
});

// Rota proxy para buscar posições dos ônibus por linha
app.get('/api/Posicao/Linha', ensureAuthenticated, async (req, res) => {
  try {
    const { codigoLinha } = req.query;

    if (!codigoLinha) {
      return res.status(400).json({ error: 'Parâmetro codigoLinha é obrigatório' });
    }

    console.log(`Buscando posições para linha: ${codigoLinha}`);

    const response = await fetch(`${SPTRANS_BASE_URL}/Posicao/Linha?codigoLinha=${codigoLinha}`, {
      headers: {
        Cookie: sessionCookie,
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Encontrados ${data.vs?.length || 0} veículos para linha ${codigoLinha}`);
      res.json(data);
    } else {
      console.error(`❌ Erro na API SPTrans: ${response.status}`);

      // Se não autorizado, tentar reautenticar
      if (response.status === 401) {
        sessionCookie = null;
        return res.status(401).json({ error: 'Sessão expirada, necessário reautenticar' });
      }

      res.status(response.status).json({ error: 'Erro na API SPTrans' });
    }
  } catch (error) {
    console.error('❌ Erro ao buscar posições:', error.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota proxy para buscar informações de linhas
app.get('/api/Linha/Buscar', ensureAuthenticated, async (req, res) => {
  try {
    const { termosBusca } = req.query;

    if (!termosBusca) {
      return res.status(400).json({ error: 'Parâmetro termosBusca é obrigatório' });
    }

    console.log(`Buscando linhas com termo: ${termosBusca}`);

    const response = await fetch(`${SPTRANS_BASE_URL}/Linha/Buscar?termosBusca=${termosBusca}`, {
      headers: {
        Cookie: sessionCookie,
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Encontradas ${data.length || 0} linhas`);
      res.json(data);
    } else {
      console.error(`❌ Erro na API SPTrans: ${response.status}`);

      if (response.status === 401) {
        sessionCookie = null;
        return res.status(401).json({ error: 'Sessão expirada, necessário reautenticar' });
      }

      res.status(response.status).json({ error: 'Erro na API SPTrans' });
    }
  } catch (error) {
    console.error('❌ Erro ao buscar linhas:', error.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota proxy para buscar paradas
app.get('/api/Parada/Buscar', ensureAuthenticated, async (req, res) => {
  try {
    const { termosBusca } = req.query;

    if (!termosBusca) {
      return res.status(400).json({ error: 'Parâmetro termosBusca é obrigatório' });
    }

    console.log(`Buscando paradas com termo: ${termosBusca}`);

    const response = await fetch(`${SPTRANS_BASE_URL}/Parada/Buscar?termosBusca=${termosBusca}`, {
      headers: {
        Cookie: sessionCookie,
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Encontradas ${data.length || 0} paradas`);
      res.json(data);
    } else {
      console.error(`❌ Erro na API SPTrans: ${response.status}`);

      if (response.status === 401) {
        sessionCookie = null;
        return res.status(401).json({ error: 'Sessão expirada, necessário reautenticar' });
      }

      res.status(response.status).json({ error: 'Erro na API SPTrans' });
    }
  } catch (error) {
    console.error('❌ Erro ao buscar paradas:', error.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para forçar reautenticação
app.post('/api/reauth', async (req, res) => {
  console.log('Forçando reautenticação...');
  sessionCookie = null;
  const success = await authenticate();

  res.json({
    success,
    message: success ? 'Reautenticação bem-sucedida' : 'Falha na reautenticação',
    authenticated: !!sessionCookie
  });
});

// Tratamento de erros global
app.use((error, req, res, next) => {
  console.error('❌ Erro não tratado:', error);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Autenticar imediatamente ao iniciar
console.log('🚀 Iniciando servidor proxy...');
authenticate().then(() => {
  app.listen(port, () => {
    console.log(`🌐 Servidor proxy rodando na porta ${port}`);
    console.log(`📍 Health check: http://localhost:${port}/health`);
    console.log(`🔗 Status API: http://localhost:${port}/api/status`);
  });
});

// Re-autenticar a cada 15 minutos para manter a sessão ativa
setInterval(() => {
  console.log('🔄 Reautenticando automaticamente...');
  authenticate();
}, 15 * 60 * 1000);

// Tratamento graceful de shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down servidor proxy...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Servidor proxy terminado');
  process.exit(0);
});
