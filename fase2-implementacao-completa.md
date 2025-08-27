# Monitor Ônibus USP Butantã - FASE 2 (Produção)

Sistema avançado de monitoramento de ônibus em tempo real com integração completa da API SPTrans, notificações push e geolocalização.

## 🚀 Funcionalidades da Fase 2

### ✅ Implementadas
- **Integração real com API SPTrans** (com fallback simulado)
- **Notificações Push** nativas do navegador
- **Geolocalização do usuário** com permissões
- **PWA completo** - instalável no celular
- **Service Worker** para cache offline
- **Interface avançada** com configurações detalhadas
- **Sistema de favoritos** para linhas preferidas
- **Toast notifications** para feedback
- **Tema claro/escuro** persistente
- **Responsivo** para todos os dispositivos

### 🔧 Para Implementar na Produção
- Proxy CORS via Vercel Functions
- Chave API real da SPTrans
- Certificado SSL/HTTPS

## 📋 Checklist de Implementação

### 1. Preparação do Ambiente

**Estrutura de Arquivos:**
```
sptrans-monitor-v2/
├── api/
│   └── sptrans-proxy.js     # Proxy CORS para Vercel
├── public/
│   ├── index.html           # Interface principal
│   ├── app.js              # Lógica principal
│   ├── style.css           # Estilos
│   ├── service-worker.js   # PWA e Push
│   └── manifest.json       # Configuração PWA
├── vercel.json             # Configuração Vercel
└── package.json            # Dependências Node.js
```

### 2. Configurar Proxy CORS (Vercel Functions)

**Criar `api/sptrans-proxy.js`:**
```javascript
// api/sptrans-proxy.js
import fetch from 'node-fetch';

export default async function handler(request, response) {
    // Configurar CORS
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }
    
    try {
        const { path, token } = request.query;
        const apiUrl = `http://api.olhovivo.sptrans.com.br/v2.1${path}`;
        
        // Headers para SPTrans
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Se for autenticação, usar POST
        if (path === '/Login/Autenticar') {
            const authResponse = await fetch(`${apiUrl}?token=${token}`, {
                method: 'POST',
                headers
            });
            
            if (authResponse.ok) {
                const cookies = authResponse.headers.get('set-cookie');
                return response.status(200).json({ 
                    success: true, 
                    cookies: cookies 
                });
            } else {
                throw new Error('Falha na autenticação');
            }
        }
        
        // Outras requisições GET
        const apiResponse = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                ...headers,
                'Cookie': request.headers.cookie || ''
            }
        });
        
        const data = await apiResponse.json();
        return response.status(200).json(data);
        
    } catch (error) {
        console.error('Proxy error:', error);
        return response.status(500).json({ 
            error: 'Falha na comunicação com API SPTrans',
            message: error.message 
        });
    }
}
```

**Configurar `vercel.json`:**
```json
{
  "functions": {
    "api/sptrans-proxy.js": {
      "maxDuration": 30
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET, POST, OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "Content-Type, Authorization" }
      ]
    }
  ]
}
```

### 3. Service Worker Completo

**Criar `service-worker.js`:**
```javascript
const CACHE_NAME = 'sptrans-monitor-v2.1.0';
const urlsToCache = [
    '/',
    '/index.html',
    '/app.js',
    '/style.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Install - Cache recursos
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
    );
});

// Activate - Limpar cache antigo
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch - Estratégia cache-first para recursos estáticos
self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('/api/')) {
        // Network-first para API
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match(event.request))
        );
    } else {
        // Cache-first para recursos estáticos
        event.respondWith(
            caches.match(event.request)
                .then((response) => response || fetch(event.request))
        );
    }
});

// Push notifications
self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : 'Nova atualização disponível!',
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore',
                title: 'Ver no mapa',
                icon: '/icon-map.png'
            },
            {
                action: 'close',
                title: 'Fechar',
                icon: '/icon-close.png'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('Monitor Ônibus USP', options)
    );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    if (event.action === 'explore') {
        event.waitUntil(clients.openWindow('/'));
    } else if (event.action === 'close') {
        // Just close
    } else {
        event.waitUntil(clients.openWindow('/'));
    }
});
```

### 4. Obter Chave API da SPTrans

**Passos para obter a chave:**

1. **Cadastro no Portal SPTrans:**
   - Acesse: http://www.sptrans.com.br/desenvolvedores/
   - Clique em "Cadastre-se"
   - Preencha formulário com dados pessoais/empresa
   - Aguarde aprovação (1-3 dias úteis)

2. **Criar Aplicação:**
   - Faça login no portal
   - Vá em "Minhas Aplicações" 
   - Clique em "Nova Aplicação"
   - Preencha: Nome, Descrição, URL do site
   - Anote o **Token** gerado

3. **Configurar no Site:**
   - Abra o site deployado
   - Clique no ícone de configurações (⚙️)
   - Cole o token no campo "Chave API SPTrans"
   - Clique "Salvar e Testar Conexão"
   - Se der sucesso, dados reais serão carregados

### 5. Deploy na Vercel

**Opção 1 - Via GitHub:**
```bash
# 1. Criar repositório
git init
git add .
git commit -m "Fase 2: Sistema de produção completo"
git remote add origin https://github.com/seuusuario/sptrans-monitor-v2.git
git push -u origin main

# 2. Na Vercel:
# - Conectar repositório GitHub
# - Deploy automático
```

**Opção 2 - Via CLI:**
```bash
# 1. Instalar Vercel CLI
npm i -g vercel

# 2. Deploy
vercel

# 3. Seguir instruções
# - Choose project name: sptrans-monitor-v2
# - Choose framework: Other
# - Public folder: ./public (se aplicável)
```

### 6. Configuração HTTPS (Obrigatório)

**Por que é necessário:**
- Service Workers só funcionam em HTTPS
- Geolocalização requer HTTPS
- Push Notifications requer HTTPS

**Vercel resolve automaticamente:**
- Certificado SSL automático
- HTTPS enforced por padrão
- Domínio personalizado opcional

## 🔧 Endpoints da API SPTrans

### Autenticação
```
POST /Login/Autenticar?token={TOKEN}
```

### Buscar Linhas
```
GET /Linha/Buscar?termosBusca={TERMO}
```

### Posição dos Ônibus
```
GET /Posicao/Linha?codigoLinha={CODIGO}
```

### Previsão de Chegada
```
GET /Previsao/Parada?codigoParada={PARADA}&codigoLinha={LINHA}
```

## 📱 Funcionalidades Avançadas

### Notificações Inteligentes
- **Chegada**: "🚌 Ônibus 8012-10 chegando em 3 minutos"
- **Atraso**: "⚠️ Linha 8082-10 com 15 min de atraso"
- **Proximidade**: "📍 Você está próximo do ponto da linha 8083-10"

### Configurações Avançadas
- Intervalo de atualização: 15s, 30s, 1min, 2min
- Distância para notificações: 100m, 200m, 500m
- Tipos de alerta: chegadas, atrasos, novidades
- Linhas favoritas prioritárias

### PWA Features
- **Instalável** no celular (botão "Instalar App")
- **Ícone na home screen** do dispositivo
- **Funciona offline** com cache inteligente
- **Splash screen** personalizada
- **Atualizações automáticas** do cache

## 🚨 Solução de Problemas

### API SPTrans não conecta
1. Verificar se token está correto
2. Testar autenticação manual: `curl -X POST "http://api.olhovivo.sptrans.com.br/v2.1/Login/Autenticar?token=SEU_TOKEN"`
3. Verificar se proxy está funcionando
4. Checar logs no console do navegador

### Notificações não funcionam
1. Verificar se está em HTTPS
2. Permitir notificações no navegador
3. Registrar Service Worker
4. Testar em navegador compatível (Chrome, Firefox, Safari)

### Geolocalização falha
1. Verificar se está em HTTPS
2. Permitir localização no navegador
3. Testar em dispositivo com GPS
4. Verificar configurações de privacidade

### PWA não instala
1. Verificar manifest.json válido
2. Confirmar Service Worker registrado
3. Usar HTTPS
4. Testar critérios de instalabilidade

## 🏆 Próximos Passos (Fase 3)

- **Analytics**: Tracking de uso das linhas
- **Machine Learning**: Previsões mais precisas
- **Integração Metro/CPTM**: Dados de outros transportes
- **Rotas otimizadas**: Melhores caminhos entre pontos
- **Compartilhamento**: Links para linhas específicas
- **Histórico**: Dados de punctualidade ao longo do tempo

---

**Desenvolvido para produção - Janeiro 2025**
**Sistema completo, escalável e pronto para milhares de usuários**