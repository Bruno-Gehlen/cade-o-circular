# 🚌 Monitor Ônibus USP Butantã

Sistema simplificado de monitoramento em tempo real dos ônibus da USP Butantã com integração à API SPTrans.

![USP Bus Monitor](https://img.shields.io/badge/Status-Active-success?style=for-the-badge)
![Version](https://img.shields.io/badge/Version-1.0.0-blue?style=for-the-badge)

## ✨ Funcionalidades

- 🔄 **Integração com API SPTrans** - Dados em tempo real dos ônibus
- 🗺️ **Mapa interativo** com Leaflet.js
- 📍 **Geolocalização** do usuário
- 📱 **PWA** - instalável no celular
- 🌓 **Tema claro/escuro**
- 📱 **Totalmente responsivo**

## 🚍 Linhas Monitoradas

- **8082-10** - Cidade Universitária ↔ Metrô Butantã (04:00-01:13)
- **8083-10** - Cidade Universitária ↔ Metrô Butantã (04:30-01:55)
- **8084-10** - Metrô Butantã → Cidade Universitária Circular (05:00-00:40)
- **8085-10** - P3 Circular USP (04:00-01:30)
- **8012-10** - Metrô Butantã ↔ Cidade Universitária (24h)
- **8022-10** - Metrô Butantã ↔ Cidade Universitária (24h)

## 📦 Estrutura do Projeto

```
usp-bus-monitor/
├── src/
│   ├── public/
│   │   ├── index.html
│   │   ├── style.css
│   │   ├── app.js
│   │   ├── service-worker.js
│   │   ├── manifest.json
│   │   └── favicon.ico
│   └── server/
│       ├── server.js
│       └── api.js
├── package.json
├── vite.config.js
├── .gitignore
└── README.md
```

## 🚀 Como usar

### 1. Instalação

```bash
git clone https://github.com/your-username/usp-bus-monitor.git
cd usp-bus-monitor
npm install
```

### 2. Configuração

Você precisa de uma chave da API SPTrans:

1. Registre-se em: [SPTrans Desenvolvedores](https://www.sptrans.com.br/desenvolvedores/)
2. Crie um arquivo `.env` na raiz do projeto e adicione a seguinte linha:

```
SPTRANS_API_KEY=sua_chave_aqui
```

### 3. Executar

**Desenvolvimento:**
```bash
npm run dev
```

**Produção:**
```bash
npm run build
npm start
```

O servidor de desenvolvimento será iniciado em `http://localhost:5173` e o servidor de produção em `http://localhost:3000`.

## 🔧 Scripts Disponíveis

```bash
npm start       # Inicia o servidor de produção
npm run dev     # Inicia o servidor de desenvolvimento (backend + vite)
npm run server  # Inicia o servidor de backend
npm run vite    # Inicia o servidor de desenvolvimento do vite
npm run build   # Compila o projeto para produção
```

## 🌟 Como Funciona

1. **Backend** (`src/server/`):
   - Servidor Node.js com Express.
   - Gerencia a autenticação com a API da SPTrans, atualizando o token a cada 15 minutos.
   - Fornece endpoints para o frontend (`/api/lines/:lineCode/positions` e `/api/lines/:lineCode/route`).

2. **Frontend** (`src/public/`):
   - Aplicação de página única (SPA) em JavaScript vanilla.
   - Utiliza o Vite para desenvolvimento e build.
   - Consome os dados do backend para exibir os ônibus e rotas no mapa.

3. **API SPTrans**:
   - Autenticação via POST com token.
   - Consulta posições e trajetos em tempo real.

## 🐛 Solução de Problemas

**Erro de autenticação:**
- Verifique se `SPTRANS_API_KEY` está configurada corretamente no arquivo `.env`.
- Confirme se a chave é válida.

**Ônibus não aparecem:**
- Selecione pelo menos uma linha no painel lateral.
- Verifique a conexão com a internet.

**Geolocalização não funciona:**
- O site deve estar em HTTPS para a geolocalização funcionar.
- Permita o acesso à localização no navegador.

## 📝 Tecnologias

- **Backend**: Node.js + Express
- **Frontend**: JavaScript vanilla + Leaflet.js + Vite
- **API**: SPTrans Olho Vivo v2.1

## 📄 Licença

MIT License - veja [LICENSE.md](LICENSE.md)

## 👤 Autor

Bruno Gehlen - [brunogfdsilva@gmail.com](mailto:brunogfdsilva@gmail.com)

---

**🚌 Feito com ❤️ para a comunidade USP 🏫**