export default async function handler(req, res) {
  // Enable CORS for all origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Get API key from environment variables
  const apiKey = process.env.SPTRANS_API_KEY;
  if (!apiKey) {
    console.error('chave SPTRANS_API_KEY não configurada');
    return res.status(500).json({
      success: false,
      error: 'API key não configurada no servidor. Verifique as variáveis de ambiente.'
    });
  }

  const { endpoint, lineCode, searchTerm } = req.query;
  const SPT_BASE_URL = 'http://api.olhovivo.sptrans.com.br/v2.1';

  try {
    if (endpoint === 'authenticate') {
      console.log('Tentando autenticar com SPTrans...');
      
      // Authenticate with SPTrans API
      const authResponse = await fetch(
        `${SPT_BASE_URL}/Login/Autenticar?token=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Accept': '*/*',
            'User-Agent': 'USP-Bus-Monitor/1.0'
          }
        }
      );

      const authResult = await authResponse.text();
      const cookieHeader = authResponse.headers.get('set-cookie');
      
      console.log('Auth response:', authResult);
      console.log('Cookie header:', cookieHeader ? 'Present' : 'Missing');

      if (authResult.trim() === 'true' && cookieHeader) {
        console.log('Authentication successful');
        return res.status(200).json({
          success: true,
          authenticated: true,
          sessionCookie: cookieHeader
        });
      } else {
        console.error('Authentication failed - Response:', authResult);
        return res.status(401).json({
          success: false,
          error: 'Falha na autenticação com SPTrans API. Verifique a chave da API.'
        });
      }

    } else if (endpoint === 'busPositions' && lineCode) {
      console.log(`Fetching bus positions for line: ${lineCode}`);
      
      // Get session cookie from request body
      let sessionCookie;
      if (req.method === 'POST' && req.body) {
        sessionCookie = req.body.sessionCookie;
      } else {
        // Try to get from query params as fallback
        sessionCookie = req.query.sessionCookie;
      }

      if (!sessionCookie) {
        return res.status(401).json({
          success: false,
          error: 'Cookie de sessão não fornecido. Faça login primeiro.'
        });
      }

      // Extract just the session ID from cookie header
      const sessionId = sessionCookie.split(';')[0];

      const positionResponse = await fetch(
        `${SPT_BASE_URL}/Posicao?codigoLinha=${encodeURIComponent(lineCode)}`,
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
        
        return res.status(200).json({
          success: true,
          data: positionData,
          lineCode: lineCode,
          timestamp: new Date().toISOString()
        });
      } else {
        console.error(`Failed to fetch positions for line ${lineCode}:`, positionResponse.status);
        return res.status(positionResponse.status).json({
          success: false,
          error: `Falha ao obter posições dos ônibus: ${positionResponse.statusText}`
        });
      }

    } else if (endpoint === 'searchLine' && searchTerm) {
      console.log(`Searching for bus line: ${searchTerm}`);
      
      // Get session cookie
      let sessionCookie;
      if (req.method === 'POST' && req.body) {
        sessionCookie = req.body.sessionCookie;
      } else {
        sessionCookie = req.query.sessionCookie;
      }

      if (!sessionCookie) {
        return res.status(401).json({
          success: false,
          error: 'Cookie de sessão não fornecido. Faça login primeiro.'
        });
      }

      const sessionId = sessionCookie.split(';')[0];

      const searchResponse = await fetch(
        `${SPT_BASE_URL}/Linha/Buscar?termosBusca=${encodeURIComponent(searchTerm)}`,
        {
          method: 'GET',
          headers: {
            'Cookie': sessionId,
            'Accept': 'application/json',
            'User-Agent': 'USP-Bus-Monitor/1.0'
          }
        }
      );

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        console.log(`Found ${searchData.length || 0} lines for search term: ${searchTerm}`);
        
        return res.status(200).json({
          success: true,
          data: searchData,
          searchTerm: searchTerm,
          timestamp: new Date().toISOString()
        });
      } else {
        console.error(`Failed to search lines for term ${searchTerm}:`, searchResponse.status);
        return res.status(searchResponse.status).json({
          success: false,
          error: `Falha ao buscar linhas: ${searchResponse.statusText}`
        });
      }

    } else if (endpoint === 'lineDetails' && lineCode) {
      console.log(`Fetching details for line: ${lineCode}`);
      
      let sessionCookie;
      if (req.method === 'POST' && req.body) {
        sessionCookie = req.body.sessionCookie;
      } else {
        sessionCookie = req.query.sessionCookie;
      }

      if (!sessionCookie) {
        return res.status(401).json({
          success: false,
          error: 'Cookie de sessão não fornecido.'
        });
      }

      const sessionId = sessionCookie.split(';')[0];

      const detailsResponse = await fetch(
        `${SPT_BASE_URL}/Linha/CarregarDetalhes?codigoLinha=${encodeURIComponent(lineCode)}`,
        {
          method: 'GET',
          headers: {
            'Cookie': sessionId,
            'Accept': 'application/json',
            'User-Agent': 'USP-Bus-Monitor/1.0'
          }
        }
      );

      if (detailsResponse.ok) {
        const detailsData = await detailsResponse.json();
        return res.status(200).json({
          success: true,
          data: detailsData,
          lineCode: lineCode,
          timestamp: new Date().toISOString()
        });
      } else {
        return res.status(detailsResponse.status).json({
          success: false,
          error: `Falha ao obter detalhes da linha: ${detailsResponse.statusText}`
        });
      }

    } else {
      return res.status(400).json({
        success: false,
        error: 'Endpoint inválido ou parâmetros em falta.',
        validEndpoints: ['authenticate', 'busPositions', 'searchLine', 'lineDetails'],
        receivedEndpoint: endpoint,
        availableParams: { lineCode, searchTerm }
      });
    }

  } catch (error) {
    console.error('SPTrans API Error:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Erro interno do servidor';
    if (error.code === 'ENOTFOUND') {
      errorMessage = 'Falha na conexão com SPTrans API';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Timeout na conexão com SPTrans API';
    } else if (error.name === 'FetchError') {
      errorMessage = 'Erro de rede ao conectar com SPTrans API';
    }

    return res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}