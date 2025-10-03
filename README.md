# 🚌 Cadê o Circular - Monitor Ônibus USP Butantã

> **''OlhoGehlenVivo''** - Sistema simplificado de monitoramento em tempo real dos ônibus exclusivos da USP Butantã com integração direta à API SPTrans.

![USP Bus Monitor](https://img.shields.io/badge/Status-Ativo-success?style=flat)
![Version](https://img.shields.io/badge/Version-0.1-blue?style=flat)
![API](https://img.shields.io/badge/API-SPTrans-orange?style=flat)

## 🎯 Sobre o Projeto

Sistema web para monitoramento em tempo real das **principais linhas de ônibus** que servem a **Cidade Universitária da USP** em São Paulo. Utiliza a API oficial da SPTrans (Olho Vivo) para fornecer dados precisos de localização, rotas e horários.

## ✨ Funcionalidades Principais

- 🚌 **Rastreamento em Tempo Real** - Posições atualizadas a cada 30 segundos
- 🗺️ **Mapa Interativo** - Interface intuitiva com Leaflet.js
- 📍 **Geolocalização** - Encontre sua posição atual
- 🎨 **Temas Claro/Escuro** - Interface adaptável
- 📱 **Responsivo** - Funciona perfeitamente em dispositivos móveis
- 🔄 **Auto-atualização** - Dados sempre atuais sem necessidade de refresh
- 📊 **Estatísticas** - Linhas ativas e número de ônibus no mapa

## 🚍 Linhas Monitoradas (Principais USP)

| Linha | Nome | Horário | Frequência |
|-------|------|---------|------------|
| **8082-10** | Cidade Universitária ↔ Metrô Butantã | 04:00-01:13 | 10-27 min |
| **8083-10** | Cidade Universitária ↔ Metrô Butantã | 04:30-01:55 | 12-34 min |
| **8084-10** | Metrô Butantã → Cidade Universitária (Circular) | 05:00-00:40 | 6-34 min |
| **8085-10** | P3 Circular USP | 04:00-01:30 | 16-50 min |

> **Nota:** Essas são as principais linhas de *circulares* que **passam por dentro** da Cidade Universitária da USP.

## 📦 Estrutura Simplificada

```
cade-o-circular/
├── 📄 index.html          # Interface principal 
├── 🎨 style.css           # Estilos e temas 
├── ⚡ app.js              # Lógica principal simplificada
├── 🔧 proxy.js            # Servidor proxy para resolver CORS
├── 📦 package.json        # 4 dependências essenciais apenas
├── 🔑 .env                # Configurações (token SPTrans)
├── 📱 manifest.json       # PWA 
├── 🖼️ favicon.ico         # Ícone 
├── 📋 LICENSE.md          # Licença MIT
└── 📖 README.md           # Esta documentação
```

## 🏗️ Arquitetura Técnica

### **🔧 Backend (proxy.js)**
- **Express.js** minimalista para servir arquivos e resolver CORS
- **Autenticação automática** na API SPTrans com renovação a cada 15 minutos
- **Endpoints RESTful** para comunicação frontend ↔ SPTrans
- **Logs detalhados** para debugging

### **⚡ Frontend (app.js)**
- **Classe única** `BusTracker` gerencia toda a aplicação
- **Leaflet.js** para mapa interativo
- **Fetch API** para comunicação com backend
- **Event-driven architecture** responsiva


## 🛠️ Endpoints da API

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/status` | Status da autenticação SPTrans |
| `GET` | `/api/lines/:code/positions` | Posições dos ônibus de uma linha |
| `GET` | `/api/lines/search` | Buscar linhas por termo |
| `POST` | `/api/reauth` | Forçar reautenticação |


## 🎨 Funcionalidades da Interface

### **🗺️ Mapa**
- **Marcadores coloridos** para cada linha de ônibus
- **Popups informativos** com detalhes do veículo
- **Zoom responsivo** e navegação suave
- **Centralização automática** na USP

### **🎛️ Controles**
- **Seleção de linhas** individual ou em massa
- **Botões de ação** (Todas/Nenhuma/Atualizar)
- **Toggle de tema** claro/escuro
- **Geolocalização** do usuário
- **Centralização** na USP Butantã

### **📊 Estatísticas**
- **Linhas ativas** em tempo real
- **Total de ônibus** no mapa
- **Status da conexão** com API
- **Timestamp** da última atualização


## 📈 Próximas Melhorias

- [ ] **Previsão de chegada** nos pontos
- [ ] **Rotas no mapa** (trajetos das linhas)
- [ ] **Notificações push** quando ônibus se aproxima
- [ ] **.Histórico** de posições
- [ ] **API pública** para outros desenvolvedores USP

## 📝 Tecnologias Utilizadas

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| **Node.js** | 18+ | Runtime JavaScript |
| **Express.js** | ^4.18 | Servidor web minimalista |
| **Leaflet.js** | ^1.9 | Mapa interativo |
| **SPTrans API** | v2.1 | Dados em tempo real |
| **Vanilla JS** | ES6+ | Frontend sem frameworks |

## 📄 Licença

**MIT License** - veja [LICENSE.md](LICENSE.md) para detalhes completos.



## 📊 Status do Projeto

```
📍 Localização: São Paulo, SP, Brasil
🚌 Linhas Ativas: 6 principais da USP
📡 API: SPTrans Olho Vivo v2.1  
⚡ Performance: ~64KB total
🔄 Atualizações: Tempo real (30s)
🎯 Foco: Cidade Universitária USP
```

---

**🚌 Feito com ❤️ para a comunidade USP 🏫**