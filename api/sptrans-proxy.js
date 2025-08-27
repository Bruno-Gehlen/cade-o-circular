export default async function handler(request, response) {
    // Configurar CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    
    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }
    
    try {
        const { path, userToken, ...params } = request.query;
        
        // CHAVE API VINDA DA VERCEL (SEGURA)
        const API_TOKEN = process.env.SPTRANS_API_TOKEN;
        
        // Se não há chave configurada na Vercel, usar token do usuário
        const tokenToUse = API_TOKEN || userToken;
        
        if (!tokenToUse && path === '/Login/Autenticar') {
            return response.status(400).json({ 
                error: 'API Token não configurado',
                message: 'Configure SPTRANS_API_TOKEN nas variáveis de ambiente da Vercel'
            });
        }
        
        const baseUrl = 'http://api.olhovivo.sptrans.com.br/v2.1';
        let apiUrl = `${baseUrl}${path}`;
        
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Monitor-Onibus-USP/2.0'
        };
        
        let fetchOptions = {
            method: 'GET',
            headers,
            timeout: 10000
        };
        
        // Endpoint de autenticação
        if (path === '/Login/Autenticar') {
            apiUrl = `${baseUrl}/Login/Autenticar?token=${tokenToUse}`;
            fetchOptions.method = 'POST';
            
            try {
                const authResponse = await fetch(apiUrl, fetchOptions);
                
                if (authResponse.ok) {
                    const cookies = authResponse.headers.get('set-cookie');
                    const responseText = await authResponse.text();
                    
                    return response.status(200).json({ 
                        success: true,
                        authenticated: responseText === 'true',
                        cookies: cookies,
                        message: 'Autenticação realizada com sucesso',
                        source: API_TOKEN ? 'vercel_env' : 'user_provided'
                    });
                } else {
                    throw new Error(`HTTP ${authResponse.status}: ${authResponse.statusText}`);
                }
            } catch (error) {
                return response.status(401).json({
                    error: 'Falha na autenticação SPTrans',
                    details: error.message,
                    suggestion: API_TOKEN ? 
                        'Token da Vercel pode estar inválido' : 
                        'Verifique se o token está correto'
                });
            }
        }
        
        // Outros endpoints - usar cookies de sessão
        const sessionCookie = request.headers.cookie;
        if (sessionCookie) {
            headers['Cookie'] = sessionCookie;
        }
        
        // Adicionar parâmetros da query
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value) queryParams.append(key, value);
        });
        
        if (queryParams.toString()) {
            apiUrl += `?${queryParams.toString()}`;
        }
        
        const apiResponse = await fetch(apiUrl, fetchOptions);
        
        if (!apiResponse.ok) {
            throw new Error(`API SPTrans retornou erro: ${apiResponse.status}`);
        }
        
        const data = await apiResponse.json();
        
        const responseData = {
            data: data,
            timestamp: new Date().toISOString(),
            source: 'sptrans-api',
            cached: false,
            tokenSource: API_TOKEN ? 'vercel_env' : 'user_provided'
        };
        
        return response.status(200).json(responseData);
        
    } catch (error) {
        console.error('Proxy error:', error);
        
        return response.status(500).json({
            error: 'Falha na comunicação com API SPTrans',
            message: error.message,
            timestamp: new Date().toISOString(),
            suggestion: 'Tente novamente em alguns segundos ou verifique a configuração'
        });
    }
}