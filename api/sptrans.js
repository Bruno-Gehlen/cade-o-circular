// /api/sptrans.js
// Proxy API for SPTrans authentication and requests

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const apiKey = process.env.SPTRANS_API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ 
            success: false, 
            error: 'API key não configurada no servidor' 
        });
    }

    const { endpoint, lineCode } = req.query;

    try {
        if (endpoint === 'authenticate') {
            // Authenticate with SPTrans API
            const authResponse = await fetch(
                `http://api.olhovivo.sptrans.com.br/v0/Login/Autenticar?token=${apiKey}`,
                {
                    method: 'POST'
                    // Não enviar headers extras, conforme documentação
                }
            );

            const authResult = await authResponse.text();
            const cookieHeader = authResponse.headers.get('set-cookie');

            if (authResult === 'true' && cookieHeader) {
                // Store session cookie for subsequent requests
                return res.status(200).json({
                    success: true,
                    authenticated: true,
                    sessionCookie: cookieHeader
                });
            } else {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication failed'
                });
            }

        } else if (endpoint === 'busPositions' && lineCode) {
            // Get bus positions for specific line
            const { sessionCookie } = req.body || {};
            
            if (!sessionCookie) {
                return res.status(401).json({
                    success: false,
                    error: 'No session cookie provided'
                });
            }

            const positionResponse = await fetch(
                `http://api.olhovivo.sptrans.com.br/v0/Posicao?codigoLinha=${lineCode}`,
                {
                    method: 'GET',
                    headers: {
                        'Cookie': sessionCookie.split(';')[0], // Use only the session cookie part
                        'Content-Type': 'application/json',
                    }
                }
            );

            if (positionResponse.ok) {
                const positionData = await positionResponse.json();
                return res.status(200).json({
                    success: true,
                    data: positionData
                });
            } else {
                return res.status(positionResponse.status).json({
                    success: false,
                    error: 'Failed to fetch bus positions'
                });
            }

        } else if (endpoint === 'searchLine' && req.query.searchTerm) {
            // Search for bus lines
            const { sessionCookie } = req.body || {};
            const { searchTerm } = req.query;
            
            if (!sessionCookie) {
                return res.status(401).json({
                    success: false,
                    error: 'No session cookie provided'
                });
            }

            const searchResponse = await fetch(
                `http://api.olhovivo.sptrans.com.br/v0/Linha/Buscar?termosBusca=${encodeURIComponent(searchTerm)}`,
                {
                    method: 'GET',
                    headers: {
                        'Cookie': sessionCookie.split(';')[0],
                        'Content-Type': 'application/json',
                    }
                }
            );

            if (searchResponse.ok) {
                const searchData = await searchResponse.json();
                return res.status(200).json({
                    success: true,
                    data: searchData
                });
            } else {
                return res.status(searchResponse.status).json({
                    success: false,
                    error: 'Failed to search bus lines'
                });
            }

        } else {
            return res.status(400).json({
                success: false,
                error: 'Invalid endpoint or missing parameters'
            });
        }

    } catch (error) {
        console.error('SPTrans API Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error: ' + error.message
        });
    }
}