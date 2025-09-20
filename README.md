# 🚌 Cadê o Circular - Monitor Ônibus USP Butantã

> **OlhoGehlenVivo** - Sistema simplificado de monitoramento em tempo real dos ônibus exclusivos da USP Butantã com integração direta à API SPTrans.

![USP Bus Monitor](https://img.shields.io/badge/Status-Ativo-success?style=for-the-badge)
![Version](https://img.shields.io/badge/Version-0.0.5-blue?style=for-the-badge)
![API](https://img.shields.io/badge/API-SPTrans-orange?style=for-the-badge)

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

### 🎯 **Simplificações Realizadas:**
- ✅ Reduzido de **10+ arquivos** para apenas **2 arquivos JavaScript essenciais**
- ✅ Eliminadas **dependências desnecessárias** (concurrently, vite, etc)
- ✅ **Interface mantida 100%** intacta (HTML/CSS não modificados)
- ✅ **Uma única classe** `BusTracker` com toda funcionalidade
- ✅ **Servidor proxy mínimo** que resolve CORS automaticamente


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

### **🔗 Fluxo de Dados**
```
Frontend (app.js) → Proxy (proxy.js) → API SPTrans → Dados → Mapa
```

## 🛠️ Endpoints da API

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/status` | Status da autenticação SPTrans |
| `GET` | `/api/lines/:code/positions` | Posições dos ônibus de uma linha |
| `GET` | `/api/lines/search` | Buscar linhas por termo |
| `POST` | `/api/reauth` | Forçar reautenticação |

**Exemplo:**
```bash
curl http://localhost:3000/api/lines/8082-10/positions
```

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

## 🌟 Diferencial do Projeto

### **🎯 Focado na USP**
- Exclusivamente para as **6 principais linhas** da USP Butantã
- Interface otimizada para **estudantes e funcionários**
- **Conhecimento local** das rotas e paradas

### **⚡ Performance**
- **Código mínimo** (330 linhas totais vs 800+ anterior)
- **Dependências essenciais** (4 vs 10+ anterior)
- **Carregamento rápido** e responsivo

### **🔧 Manutenabilidade**
- **Arquitetura simples** (2 arquivos JS principais)
- **Logs detalhados** para debugging
- **Configuração via variáveis** de ambiente

## 📈 Próximas Melhorias

- [ ] **Previsão de chegada** nos pontos
- [ ] **Rotas no mapa** (trajetos das linhas)
- [ ] **Notificações push** quando ônibus se aproxima
- [ ] **Histórico** de posições
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

## 👤 Desenvolvedor

**Bruno Gehlen**
- 📧 Email: brunogfdsilva@gmail.com
- 🐙 GitHub: [@Bruno-Gehlen](https://github.com/Bruno-Gehlen)
- 🎓 Estudante: Matemática (Mestrado), USP

## 🤝 Contribuições

Contribuições são bem-vindas! Sinta-se à vontade para:

1. **Fork** o projeto
2. **Crie** uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. **Commit** suas mudanças (`git commit -m 'Adiciona nova feature'`)
4. **Push** para a branch (`git push origin feature/nova-feature`)
5. **Abra** um Pull Request

## 🙏 Agradecimentos

- **SPTrans** pela API Olho Vivo
- **USP** pela infraestrutura de transporte
- **Comunidade USP** pelo feedback e sugestões
- **OpenStreetMap** pelos dados cartográficos

---

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