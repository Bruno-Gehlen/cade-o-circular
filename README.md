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
├── public/
│   ├── index.html          # Interface principal
│   ├── style.css           # Estilos
│   ├── app.js              # Lógica da aplicação
│   ├── service-worker.js   # PWA features
│   ├── manifest.json       # PWA config
│   └── favicon.ico         # Ícone
├── server.js               # Servidor Node.js
├── package.json            # Dependências
├── .gitignore              # Arquivos ignorados
└── README.md               # Documentação
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
2. Configure a variável de ambiente:

**Desenvolvimento local:**
```bash
export SPTRANS_API_KEY=sua_chave_aqui
```

**No Vercel:**
- Acesse o dashboard do Vercel
- Vá em Settings > Environment Variables
- Adicione `SPTRANS_API_KEY` com sua chave

### 3. Executar

**Desenvolvimento:**
```bash
npm run dev
# ou
npm start
```

**Produção:**
```bash
npm start
```

O servidor será iniciado na porta 3000 (ou PORT definida no ambiente).

## 🌐 Deploy no Vercel

1. **Via Dashboard:**
   - Conecte seu repositório GitHub
   - Configure `SPTRANS_API_KEY` em Environment Variables
   - Deploy automático

2. **Via CLI:**
   ```bash
   npm i -g vercel
   vercel login
   vercel env add SPTRANS_API_KEY
   vercel --prod
   ```

## 🔧 Scripts Disponíveis

```bash
npm start       # Inicia o servidor
npm run dev     # Desenvolvimento (mesmo que start)
npm run build   # Não necessário (arquivos estáticos)
```

## 🌟 Como Funciona

1. **Servidor Node.js** (`server.js`):
   - Serve arquivos estáticos da pasta `public/`
   - Faz proxy para API SPTrans (resolve CORS)
   - Gerencia autenticação e cookies

2. **Frontend** (`app.js`):
   - Chama `/api/sptrans` localmente
   - Autentica automaticamente
   - Atualiza posições a cada 30 segundos
   - Interface responsiva e moderna

3. **API SPTrans**:
   - Autenticação via POST com token
   - Consulta posições em tempo real
   - Gerencia sessões com cookies

## 🐛 Solução de Problemas

**Erro de autenticação:**
- Verifique se `SPTRANS_API_KEY` está configurada
- Confirme se a chave é válida

**Ônibus não aparecem:**
- Selecione pelo menos uma linha no painel lateral
- Verifique conexão com internet

**Geolocalização não funciona:**
- Site deve estar em HTTPS
- Permita acesso à localização no navegador

## 📝 Tecnologias

- **Backend**: Node.js + Express
- **Frontend**: JavaScript vanilla + Leaflet.js
- **API**: SPTrans Olho Vivo v2.1
- **Deploy**: Vercel

## 📄 Licença

MIT License - veja [LICENSE.md](LICENSE.md)

## 👤 Autor

Bruno Gehlen - [brunogfdsilva@gmail.com](mailto:brunogfdsilva@gmail.com)

---

**🚌 Feito com ❤️ para a comunidade USP 🏫**