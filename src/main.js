import BusTracker from './busTracker.js';
import busLines from './presetLines.js';

// Gerenciamento do Service Worker
class ServiceWorkerManager {
  constructor() {
    this.registration = null;
    this.init();
  }

  async init() {
    if (!('serviceWorker' in navigator)) {
      console.log('❌ Service Worker não suportado');
      return;
    }

    try {
      // Registra o service worker
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/', // Controla todo o site
        updateViaCache: 'none' // Sempre verifica atualizações
      });

      console.log('✅ Service Worker registrado:', this.registration.scope);

      // Configura listeners para atualizações
      this.setupUpdateHandling();

    } catch (error) {
      console.error('❌ Falha ao registrar Service Worker:', error);
    }

    // Verificação de versão roda independente do registro do SW
    this.checkAppVersion();
  }

  setupUpdateHandling() {
    // Detecta quando nova versão do SW está disponível (sw.js mudou)
    this.registration.addEventListener('updatefound', () => {
      const newWorker = this.registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          this.showUpdatePrompt();
        }
      });
    });

    // Detecta quando service worker toma controle
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }

  async checkAppVersion() {
    try {
      const res = await fetch('/manifest.json', { cache: 'no-store' });
      const manifest = await res.json();
      this._latestVersion = manifest.version;

      const current = localStorage.getItem('appVersion');
      if (!current) {
        localStorage.setItem('appVersion', manifest.version);
      } else if (current !== manifest.version) {
        console.log(`🆕 Nova versão detectada: ${current} → ${manifest.version}`);
        this.showUpdatePrompt();
      }
    } catch (err) {
      console.warn('⚠️ Falha ao verificar versão do app:', err);
    }
  }

  // Overlay de atualização obrigatória: ocupa a tela toda e não pode ser
  // fechado — a única saída é atualizar (ou recarregar a página, o que
  // também ativa a nova versão)
  showUpdatePrompt() {
    const overlay = document.getElementById('update-overlay');
    if (!overlay) return;

    overlay.classList.remove('hidden');

    const btn = document.getElementById('update-now-btn');
    if (btn && !btn._updateBound) {
      btn._updateBound = true;
      btn.addEventListener('click', () => this.applyUpdate());
    }
  }

  async applyUpdate() {
    // Marca a nova versão como aceita antes de recarregar, para que a
    // verificação de versão não exiba o overlay novamente após o reload
    try {
      if (!this._latestVersion) {
        const res = await fetch('/manifest.json', { cache: 'no-store' });
        this._latestVersion = (await res.json()).version;
      }
      if (this._latestVersion) localStorage.setItem('appVersion', this._latestVersion);
    } catch (err) {
      console.warn('⚠️ Falha ao registrar versão:', err);
    }

    if (this.registration && this.registration.waiting) {
      // Há um novo SW aguardando: ativa (o evento controllerchange recarrega)
      this.skipWaiting();
    } else {
      // sw.js não mudou (só a versão do manifest): limpa os caches para que
      // o SW re-precacheie com o novo nome derivado da versão e recarrega
      try { await this.clearCache(); } catch (err) { console.warn(err); }
      window.location.reload();
    }
  }

  skipWaiting() {
    if (this.registration && this.registration.waiting) {
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  // Método para forçar limpeza de cache (para emergências)
  async clearCache() {
    if (!this.registration || !this.registration.active) return;

    const messageChannel = new MessageChannel();

    return new Promise((resolve) => {
      // Timeout de segurança: se o SW não responder, segue com o reload
      const timer = setTimeout(() => resolve({ timeout: true }), 3000);

      messageChannel.port1.onmessage = (event) => {
        clearTimeout(timer);
        resolve(event.data);
      };

      this.registration.active.postMessage(
        { type: 'CLEAR_CACHE' }, 
        [messageChannel.port2]
      );
    });
  }
}

// Checa que a DOM foi iniciada então inicia o Cade-o-circular
document.addEventListener('DOMContentLoaded', () => {
  window.swManager = new ServiceWorkerManager();
  window.busTracker = new BusTracker({ busLines });
  console.log('🚌 Cade-o-circular iniciado com sucesso!');
});

export default window.busTracker;


// // Adicionar log mais detalhado na inicialização
// document.addEventListener('DOMContentLoaded', () => {
//   console.log('🚌 Iniciando Cadê o Circular...');
//   console.log(`📍 Linhas configuradas: ${busLines.map(l => l.code).join(', ')}`);
  
//   window.swManager = new ServiceWorkerManager();
//   window.busTracker = new BusTracker({ busLines });
  
//   console.log('✅ Cadê o Circular iniciado - pré-carregamento em andamento');
// });