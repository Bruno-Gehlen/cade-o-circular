// api/sptrans-proxy.js
// Proxy para resolver CORS da API SPTrans na Vercel

export default async function handler(request, response) {
    // Configurar CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }
    
    try {
        const { path, token, ...params } = request.query;
        
        if (!path) {
            return response.status(400).json({ 
                error: 'Parâmetro path é obrigatório' 
            });
        }
        
        // Base URL da API SPTrans
        const baseUrl = 'http://api.olhovivo.sptrans.com.br/v2.1';
        let apiUrl = `${baseUrl}${path}`;
        
        // Headers para SPTrans
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Monitor-Onibus-USP/2.0'
        };
        
        // Configuração da requisição
        let fetchOptions = {
            method: 'GET',
            headers,
            timeout: 10000 // 10s timeout
        };
        
        // Endpoint de autenticação
        if (path === '/Login/Autenticar') {
            if (!token) {
                return response.status(400).json({ 
                    error: 'Token é obrigatório para autenticação' 
                });
            }
            
            apiUrl = `${baseUrl}/Login/Autenticar?token=${token}`;
            fetchOptions.method = 'POST';
            
            try {
                const authResponse = await fetch(apiUrl, fetchOptions);
                
                if (authResponse.ok) {
                    // Capturar cookies de sessão
                    const cookies = authResponse.headers.get('set-cookie');
                    const responseText = await authResponse.text();
                    
                    return response.status(200).json({ 
                        success: true,
                        authenticated: responseText === 'true',
                        cookies: cookies,
                        message: 'Autenticação realizada com sucesso'
                    });
                } else {
                    throw new Error(`HTTP ${authResponse.status}: ${authResponse.statusText}`);
                }
            } catch (error) {
                return response.status(401).json({
                    error: 'Falha na autenticação SPTrans',
                    details: error.message,
                    suggestion: 'Verifique se o token está correto'
                });
            }
        }
        
        // Outros endpoints - requerem cookies de sessão
        const sessionCookie = request.headers.cookie;
        if (sessionCookie) {
            headers['Cookie'] = sessionCookie;
        }
        
        // Adicionar parâmetros da query string
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value) queryParams.append(key, value);
        });
        
        if (queryParams.toString()) {
            apiUrl += `?${queryParams.toString()}`;
        }
        
        // Fazer requisição à API SPTrans
        const apiResponse = await fetch(apiUrl, fetchOptions);
        
        if (!apiResponse.ok) {
            throw new Error(`API SPTrans retornou erro: ${apiResponse.status}`);
        }
        
        const data = await apiResponse.json();
        
        // Adicionar metadata útil
        const responseData = {
            data: data,
            timestamp: new Date().toISOString(),
            source: 'sptrans-api',
            cached: false
        };
        
        return response.status(200).json(responseData);
        
    } catch (error) {
        console.error('Proxy error:', error);
        
        // Response de erro padronizado
        return response.status(500).json({
            error: 'Falha na comunicação com API SPTrans',
            message: error.message,
            timestamp: new Date().toISOString(),
            suggestion: 'Tente novamente em alguns segundos ou verifique sua conexão'
        });
    }
}