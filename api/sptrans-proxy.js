// api/sptrans-proxy.js - VERSÃO CORRIGIDA
// Usa automaticamente chave da Vercel, zero configuração do usuário

// Gerenciamento de sessão/cookie
let sptransSessionCookie = null;
let lastAuthTime = 0;

async function authenticateSPTrans(API_TOKEN) {
    const baseUrl = 'http://api.olhovivo.sptrans.com.br/v2.1';
    const apiUrl = `${baseUrl}/Login/Autenticar?token=${API_TOKEN}`;
    const fetchOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Monitor-Onibus-USP-Butanta/2.0'
        }
    };
    const authResponse = await fetch(apiUrl, fetchOptions);
    const responseText = await authResponse.text();
    if (authResponse.ok && responseText === 'true') {
        const setCookie = authResponse.headers.get('set-cookie');
        if (setCookie) {
            const match = setCookie.match(/ASP.NET_SessionId=([^;]+);/);
            if (match) {
                sptransSessionCookie = `ASP.NET_SessionId=${match[1]}`;
                lastAuthTime = Date.now();
                return true;
            }
        }
    }
    return false;
}

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

        // Autentica se necessário (cookie ausente ou expirado)
        if (!sptransSessionCookie || (Date.now() - lastAuthTime > 20 * 60 * 1000)) {
            const authenticated = await authenticateSPTrans(API_TOKEN);
            if (!authenticated) {
                console.log('[Proxy] Falha na autenticação, usando dados simulados');
                return response.status(503).json({
                    error: 'API temporariamente indisponível',
                    message: 'Sistema funcionando com dados simulados',
                    simulation_mode: true,
                    timestamp: new Date().toISOString()
                });
            }
        }

        const baseUrl = 'http://api.olhovivo.sptrans.com.br/v2.1';
        let apiUrl = `${baseUrl}${path}`;

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

        // Monta headers com cookie de sessão
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Monitor-Onibus-USP-Butanta/2.0',
            'Cookie': sptransSessionCookie
        };

        let fetchOptions = {
            method: 'GET',
            headers,
            timeout: 8000
        };

        // Se for autenticação, retorna status
        if (path === '/Login/Autenticar') {
            return response.status(200).json({
                success: true,
                authenticated: true,
                cookies: sptransSessionCookie,
                message: 'Conectado aos dados em tempo real da SPTrans',
                timestamp: new Date().toISOString(),
                token_source: 'vercel_environment'
            });
        }

        console.log(`[Proxy] Fazendo requisição: ${apiUrl}`);
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