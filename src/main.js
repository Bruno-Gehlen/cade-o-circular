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
  }

  setupUpdateHandling() {
    // Detecta quando nova versão está disponível
    this.registration.addEventListener('updatefound', () => {
      const newWorker = this.registration.installing;
      
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

  showUpdatePrompt() {
    // Integrar com sua UI existente
    if (confirm('Nova versão  do site disponível! Atualizar agora?')) {
      this.skipWaiting();
    }
  }

  skipWaiting() {
    if (this.registration && this.registration.waiting) {
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  // Método para forçar limpeza de cache (para emergências)
  async clearCache() {
    if (this.registration) {
      const messageChannel = new MessageChannel();
      
      return new Promise((resolve) => {
        messageChannel.port1.onmessage = (event) => {
          resolve(event.data);
        };

        this.registration.active.postMessage(
          { type: 'CLEAR_CACHE' }, 
          [messageChannel.port2]
        );
      });
    }
  }
}

// Checa que a DOM foi iniciada então inicia o Cade-o-circular
document.addEventListener('DOMContentLoaded', () => {
  window.swManager = new ServiceWorkerManager();
  window.busTracker = new BusTracker({ busLines });
  console.log('🚌 Cade-o-circular iniciado com sucesso!');
});

export default window.busTracker;
