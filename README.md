# 🚌 Monitor Ônibus USP Butantã

Sistema de monitoramento em tempo real dos ônibus da USP Butantã com integração à API SPTrans, notificações push e geolocalização.

## ✨ Funcionalidades

- 🔄 **Integração real com API SPTrans**
- 🔔 **Notificações Push** nativas do navegador
- 📍 **Geolocalização** do usuário
- 📱 **PWA completo** - instalável no celular
- 🔄 **Service Worker** para cache offline
- ⚙️ **Interface avançada** com configurações
- ⭐ **Sistema de favoritos** para linhas
- 🌓 **Tema claro/escuro** persistente
- 📱 **Responsivo** para todos dispositivos

## 🚀 Tecnologias

- Node.js
- Vercel Serverless Functions
- API SPTrans
- Service Workers
- PWA (Progressive Web App)

## 📦 Estrutura do Projeto

```
.
├── api/
│   └── sptrans-proxy.js     # Proxy CORS para API SPTrans
├── public/
│   ├── index.html           # Interface principal
│   ├── app.js              # Lógica principal
│   ├── style.css           # Estilos
│   ├── service-worker.js   # PWA e Push
│   └── manifest.json       # Configuração PWA
├── vercel.json             # Configuração Vercel
└── package.json            # Dependências Node.js
```

### Notificações Push

As notificações são habilitadas automaticamente quando:
- Site está em HTTPS
- Usuário concede permissão
- Service Worker está ativo

## 📱 PWA Features

- Instalável no celular
- Funciona offline
- Ícone na home screen
- Splash screen personalizada
- Atualizações automáticas

## 🤝 Contribuindo

1. Faça um Fork do projeto
2. Crie sua Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a Branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 👤 Autor

**Bruno Gehlen**
- Email: brunogfdsilva@gmail.com
- Website: https://monitorusp.vercel.app

## 🙏 Agradecimentos

- SPTrans pela disponibilização da API
- Comunidade USP pelo feedback