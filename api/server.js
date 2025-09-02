const fetch = require('node-fetch');

const SPTRANS_BASE_URL = 'http://api.olhovivo.sptrans.com.br/v2.1';
const API_KEY = process.env.SPTRANS_API_KEY;

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { endpoint, lineCode } = req.query;

    if (!API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'SPTRANS_API_KEY não configurada'
      });
    }

    // Handle authentication
    if (endpoint === 'authenticate') {
      console.log('Authenticating with SPTrans API...');
      
      const authResponse = await fetch(
        `${SPTRANS_BASE_URL}/Login/Autenticar?token=${API_KEY}`,
        { 
          method: 'POST',
          headers: {
            'User-Agent': 'USP-Bus-Monitor/1.0'
          }
        }
      );

      const authResult = await authResponse.text();
      const cookieHeader = authResponse.headers.get('set-cookie');

      console.log('Auth response:', authResult);
      console.log('Cookie header present:', !!cookieHeader);

      if (authResult.trim() === 'true' && cookieHeader) {
        return res.json({
          success: true,
          authenticated: true,
          sessionCookie: cookieHeader
        });
      } else {
        return res.status(401).json({
          success: false,
          error: 'Falha na autenticação com SPTrans'
        });
      }
    }

    // Handle bus positions
    if (endpoint === 'busPositions' && lineCode) {
      const { sessionCookie } = req.body;

      if (!sessionCookie) {
        return res.status(401).json({
          success: false,
          error: 'Cookie de sessão não fornecido'
        });
      }

      const sessionId = sessionCookie.split(';')[0];
      console.log(`Fetching positions for line: ${lineCode}`);

      const positionResponse = await fetch(
        `${SPTRANS_BASE_URL}/Posicao?codigoLinha=${encodeURIComponent(lineCode)}`,
        {
          method: 'GET',
          headers: {
            'Cookie': sessionId,
            'Accept': 'application/json',
            'User-Agent': 'USP-Bus-Monitor/1.0'
          }
        }
      );

      if (positionResponse.ok) {
        const positionData = await positionResponse.json();
        console.log(`Found ${positionData.vs?.length || 0} buses for line ${lineCode}`);
        
        return res.json({
          success: true,
          data: positionData,
          lineCode: lineCode,
          timestamp: new Date().toISOString()
        });
      } else {
        console.error(`Failed to fetch positions for line ${lineCode}:`, positionResponse.status);
        return res.status(positionResponse.status).json({
          success: false,
          error: `Erro ao obter posições: ${positionResponse.statusText}`
        });
      }
    }

    // Invalid endpoint
    return res.status(400).json({
      success: false,
      error: 'Endpoint inválido',
      validEndpoints: ['authenticate', 'busPositions']
    });

  } catch (error) {
    console.error('SPTrans API Error:', error);
    
    let errorMessage = 'Erro interno do servidor';
    if (error.code === 'ENOTFOUND') {
      errorMessage = 'Falha na conexão com SPTrans API';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Timeout na conexão com SPTrans API';
    }

    return res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.message
    });
  }
};