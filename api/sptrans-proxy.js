// api/sptrans-proxy.js - VERSÃO CORRIGIDA
// Usa automaticamente chave da Vercel, zero configuração do usuário

export default async function handler(request, response) {
    // CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }
    
    try {
        const { path, ...params } = request.query;
        
        // CORREÇÃO: Usar chave API da Vercel automaticamente
        const API_TOKEN = process.env.SPTRANS_API_TOKEN;
        
        if (!API_TOKEN) {
            console.log('[Proxy] Token da Vercel não configurado, funcionando em modo simulado');
            return response.status(503).json({
                error: 'API temporariamente indisponível',
                message: 'Sistema funcionando com dados simulados',
                simulation_mode: true,
                timestamp: new Date().toISOString()
            });
        }
        
        const baseUrl = 'http://api.olhovivo.sptrans.com.br/v2.1';
        let apiUrl = `${baseUrl}${path}`;
        
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Monitor-Onibus-USP-Butanta/2.0'
        };
        
        let fetchOptions = {
            method: 'GET',
            headers,
            timeout: 8000 // 8 segundos timeout
        };
        
        // Endpoint de autenticação - USAR CHAVE AUTOMÁTICA
        if (path === '/Login/Autenticar') {
            apiUrl = `${baseUrl}/Login/Autenticar?token=${API_TOKEN}`;
            fetchOptions.method = 'POST';
            
            try {
                console.log('[Proxy] Autenticando com chave da Vercel...');
                const authResponse = await fetch(apiUrl, fetchOptions);
                
                if (authResponse.ok) {
                    const cookies = authResponse.headers.get('set-cookie');
                    const responseText = await authResponse.text();
                    
                    const authenticated = responseText === 'true';
                    
                    console.log(`[Proxy] Autenticação: ${authenticated ? 'SUCESSO' : 'FALHOU'}`);
                    
                    return response.status(200).json({ 
                        success: true,
                        authenticated: authenticated,
                        cookies: cookies,
                        message: authenticated ? 
                            'Conectado aos dados em tempo real da SPTrans' : 
                            'Falha na autenticação - usando dados simulados',
                        timestamp: new Date().toISOString(),
                        token_source: 'vercel_environment'
                    });
                } else {
                    throw new Error(`HTTP ${authResponse.status}: ${authResponse.statusText}`);
                }
            } catch (error) {
                console.log('[Proxy] Erro na autenticação:', error.message);
                return response.status(503).json({
                    error: 'Erro na conexão com SPTrans',
                    message: 'Sistema funcionando com dados simulados',
                    details: error.message,
                    simulation_mode: true,
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        // Outros endpoints - usar cookies de sessão
        const sessionCookie = request.headers.cookie;
        if (sessionCookie) {
            headers['Cookie'] = sessionCookie;
        }
        
        // Construir query string
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value && key !== 'path') {
                queryParams.append(key, value);
            }
        });
        
        if (queryParams.toString()) {
            apiUrl += `?${queryParams.toString()}`;
        }
        
        console.log(`[Proxy] Fazendo requisição: ${apiUrl}`);
        
        // Fazer requisição à API
        const apiResponse = await fetch(apiUrl, fetchOptions);
        
        if (!apiResponse.ok) {
            throw new Error(`API SPTrans erro: ${apiResponse.status} ${apiResponse.statusText}`);
        }
        
        const contentType = apiResponse.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
            data = await apiResponse.json();
        } else {
            data = await apiResponse.text();
        }
        
        // Resposta com dados reais
        const responseData = {
            success: true,
            data: data,
            timestamp: new Date().toISOString(),
            source: 'sptrans_real_data',
            cached: false
        };
        
        return response.status(200).json(responseData);
        
    } catch (error) {
        console.error('[Proxy] Erro geral:', error);
        
        // RESPOSTA PADRÃO: Dados indisponíveis, usar simulação
        return response.status(503).json({
            error: 'Dados da SPTrans temporariamente indisponíveis',
            message: 'Sistema funcionando com dados simulados atualizados',
            simulation_mode: true,
            retry_after: 30,
            timestamp: new Date().toISOString(),
            suggestion: 'Os dados reais voltarão automaticamente quando disponível'
        });
    }
}