import { isValidCoordinate, calculateOptimalZoom, calculateDistance, formatTimeLocale } from './utils.js';
import { markerIconHtml, busPopupHtml, renderBusLineItemHtml, userLocationMarkerHtml, userLocationPopupHtml } from './uiHelpers.js';
import MapManager from './mapManager.js';

export default class BusTracker {
  constructor(options = {}) {
    this.apiConfig = Object.assign({
      baseUrl: window.location.origin + '/api',
      updateInterval: 30000,
      retryAttempts: 3
    }, options.apiConfig || {});

    this.busLines = options.busLines || [];
    this.uspLocation = options.uspLocation || { lat: -23.561, lng: -46.733 };
  this.map = null;
  this.mapManager = new MapManager();
    this.activeBusLines = new Set();
    this.authenticated = false;
    this.userLocationMarker = null;
  this._savedUIState = null; // used to save/restore UI collapsed states during map interactions

    this.init();
  }

  init() {
    this.setupMap();
    this.setupUI();
    this.renderBusLines();
    this.bindEvents();
    // Ensure panels are mutually exclusive: when sidebar is expanded, bottom-panel is collapsed and vice-versa
    this.setSidebarCollapsed(false);
    this.checkStatus();
    this.hideLoadingOverlay();
    this.startAutoUpdate();
  }

  setupMap() {
    const self = this;
    this.mapManager.init('map', [this.uspLocation.lat, this.uspLocation.lng], 15);

    this.mapManager.on('movestart', () => {
      // Save current UI states once, then collapse top-controls, sidebar and bottom-panel while moving
      if (!this._savedUIState) {
        const topEl = document.querySelector('.top-controls');
        const sidebarEl = document.getElementById('sidebar');
        const panelEl = document.getElementById('bottom-panel');
        this._savedUIState = {
          topCollapsed: topEl?.classList.contains('collapsed') || false,
          sidebarCollapsed: sidebarEl?.classList.contains('collapsed') || false,
          panelCollapsed: panelEl?.classList.contains('collapsed') || false
        };
      }

      document.querySelector('.top-controls')?.classList.add('collapsed');
      document.getElementById('sidebar')?.classList.add('collapsed');
      document.getElementById('bottom-panel')?.classList.add('collapsed');
    });

    this.mapManager.on('moveend', () => {
      // Restore previously saved UI states after moving the map
      const topEl = document.querySelector('.top-controls');
      const sidebarEl = document.getElementById('sidebar');
      const panelEl = document.getElementById('bottom-panel');

      if (this._savedUIState) {
        if (this._savedUIState.topCollapsed) topEl?.classList.add('collapsed'); else topEl?.classList.remove('collapsed');
        if (this._savedUIState.sidebarCollapsed) sidebarEl?.classList.add('collapsed'); else sidebarEl?.classList.remove('collapsed');
        if (this._savedUIState.panelCollapsed) panelEl?.classList.add('collapsed'); else panelEl?.classList.remove('collapsed');
        this._savedUIState = null;
      } else {
        // Fallback: ensure top-controls visible and keep mutually-exclusive default
        topEl?.classList.remove('collapsed');
        this.setSidebarCollapsed(true);
      }
    });

    // Sidebar drag handle
    const sidebar = document.getElementById('sidebar');
    const dragHandle = document.getElementById('sidebar-drag-handle');
    let dragStartX = null;
    let dragging = false;

    function onDragStart(e) {
      dragging = true;
      dragStartX = e.touches ? e.touches[0].clientX : e.clientX;
    }

    function onDragMove(e) {
      if (!dragging) return;
      const currentX = e.touches ? e.touches[0].clientX : e.clientX;
      if ((currentX - dragStartX) > 40) {
        // Expand sidebar and collapse bottom-panel
        self.setSidebarCollapsed(false);
        const toggleBtn = document.getElementById('sidebar-toggle');
        if (toggleBtn) toggleBtn.focus();
        dragging = false;
      }
    }

    function onDragEnd() {
      dragging = false;
      dragStartX = null;
    }

    dragHandle.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);

    dragHandle.addEventListener('touchstart', onDragStart);
    document.addEventListener('touchmove', onDragMove);
    document.addEventListener('touchend', onDragEnd);
  }

  setupUI() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-color-scheme', savedTheme);

    const themeIcon = document.querySelector('.theme-icon');
    if (themeIcon) themeIcon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

    this.updateStats();
  }

  renderBusLines() {
    const container = document.getElementById('bus-lines-container');
    if (!container) return;

    container.innerHTML = '';

    this.busLines.forEach(line => {
      const lineItem = document.createElement('div');
      lineItem.className = 'bus-line-item';
      lineItem.innerHTML = renderBusLineItemHtml(line);
      container.appendChild(lineItem);
    });
  }

  bindEvents() {
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      const current = document.body.getAttribute('data-color-scheme');
      const newTheme = current === 'dark' ? 'light' : 'dark';
      document.body.setAttribute('data-color-scheme', newTheme);
      localStorage.setItem('theme', newTheme);

      const icon = document.querySelector('.theme-icon');
      if (icon) icon.textContent = newTheme === 'dark' ? '☀️' : '🌙';

      const themeMessage = newTheme === 'dark' ? 'Tema escuro ativado! 🌙' : 'Tema claro ativado! ☀️';
      this.showToast('success', themeMessage);
    });

    document.getElementById('find-location')?.addEventListener('click', () => {
      this.findUserLocation();
    });

    document.getElementById('center-usp')?.addEventListener('click', () => {
      this.mapManager.setView([this.uspLocation.lat, this.uspLocation.lng], 15);
      this.showToast('success', 'Centralizado na USP Butantã! 🎓');
    });

    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
      // Toggle sidebar and keep bottom-panel opposite
      const sidebarEl = document.getElementById('sidebar');
      if (!sidebarEl) return;
      const willCollapse = !sidebarEl.classList.contains('collapsed');
      this.setSidebarCollapsed(willCollapse);
    });

    document.getElementById('panel-toggle')?.addEventListener('click', () => {
      // Toggle bottom-panel and keep sidebar opposite
      const panelEl = document.getElementById('bottom-panel');
      if (!panelEl) return;
      const willCollapse = !panelEl.classList.contains('collapsed');
      this.setBottomPanelCollapsed(willCollapse);
    });

    document.getElementById('select-all-btn')?.addEventListener('click', () => {
      this.selectAllLines(true);
      this.showToast('success', 'Todas as linhas selecionadas! 🚌');
    });

    document.getElementById('select-none-btn')?.addEventListener('click', () => {
      this.selectAllLines(false);
      this.showToast('success', 'Todas as linhas desmarcadas');
    });

    document.getElementById('refresh-btn')?.addEventListener('click', () => {
      this.refreshBusData();
      this.showToast('success', 'Dados atualizados! 🔄');
    });

    document.addEventListener('change', (e) => {
      if (e.target.matches && e.target.matches('input[data-line]')) {
        this.toggleBusLine(e.target.dataset.line, e.target.checked);
      }
    });

    document.getElementById('close-error')?.addEventListener('click', () => {
      document.getElementById('error-toast')?.classList.add('hidden');
    });

    document.getElementById('close-success')?.addEventListener('click', () => {
      document.getElementById('success-toast')?.classList.add('hidden');
    });
  }

  async findUserLocation() {
    const button = document.getElementById('find-location');

    if (!navigator.geolocation) {
      this.showToast('error', 'Geolocalização não suportada pelo navegador');
      return;
    }

    if (button) {
      button.disabled = true;
      button.innerHTML = '<span>📍</span><span class="btn-text">Localizando...</span>';
      button.classList.add('loading');
    }

    const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 };

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });

      const { latitude, longitude, accuracy } = position.coords;

      if (!isValidCoordinate(latitude, longitude)) {
        throw new Error('Coordenadas inválidas recebidas');
      }

      if (this.userLocationMarker) this.mapManager.removeMarker('user-location');

      this.userLocationMarker = this.mapManager.addMarker('user-location', latitude, longitude, {
        iconHtml: userLocationMarkerHtml(),
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupHtml: userLocationPopupHtml(latitude, longitude, accuracy)
      });

      const zoom = calculateOptimalZoom(accuracy);
      this.mapManager.setView([latitude, longitude], zoom);

      const accuracyText = accuracy < 50 ? 'Alta precisão' : accuracy < 200 ? 'Boa precisão' : 'Precisão aproximada';
      this.showToast('success', `Te achei! ${accuracyText}! 📍`);
      console.log(`🎯 Localização obtida: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${Math.round(accuracy)}m)`);
    } catch (error) {
      let errorMessage = 'Erro ao obter localização 📍';
      if (error && error.code) {
        switch (error.code) {
          case 1:
            errorMessage = 'Permissão negada para geolocalização';
            break;
          case 2:
            errorMessage = 'Localização indisponível';
            break;
          case 3:
            errorMessage = 'Timeout ao obter localização';
            break;
          default:
            errorMessage = `Erro na localização: ${error.message}`;
        }
      }
      this.showToast('error', errorMessage);
      console.error('❌ Erro geolocalização:', error);
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = '<span>📍</span><span class="btn-text">Minha Localização</span>';
        button.classList.remove('loading');
      }
    }
  }

  async checkStatus() {
    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      this.authenticated = !!data.authenticated;

      const status = document.getElementById('connection-status');
      if (status) {
        status.className = `status status--${this.authenticated ? 'success' : 'warning'}`;
        status.textContent = this.authenticated ? 'Conectado' : 'Conectando...';
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error);
      this.updateConnectionStatus('error', 'Erro de conexão');
    }
  }

  async fetchBusPositions(lineCode) {
    try {
      console.log(`🔍 Buscando posições da linha: ${lineCode}`);
      const response = await fetch(`${this.apiConfig.baseUrl}/lines/${lineCode}/positions`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      console.log(`✅ Dados recebidos para ${lineCode}:`, data);

      let buses = [];
      if (Array.isArray(data.buses)) buses = data.buses;
      else if (Array.isArray(data.vs)) buses = data.vs;

      try {
        this.updateBusMarkers(lineCode, buses);
      } catch (err) {
        console.error('Erro ao atualizar marcadores:', err);
      }

      return { ...data, buses };
    } catch (error) {
      console.error(`❌ Erro ao buscar posições da linha ${lineCode}:`, error);
      this.showNotification ? this.showNotification(`Erro ao carregar linha ${lineCode}: ${error.message}`, 'error') : this.showToast('error', `Erro ao carregar linha ${lineCode}`);
      return { buses: [], error: error.message };
    }
  }

  updateBusMarkers(lineCode, buses) {
    // Remove old markers for this line via mapManager
    this.mapManager.removeMarkersByPrefix(lineCode + '-');

    const lineConfig = this.busLines.find(line => line.code === lineCode);
    if (!lineConfig) return;

    buses.forEach(bus => {
      const markerId = `${lineCode}-${bus.p}`;
      const isDark = typeof document !== 'undefined' && document.body?.getAttribute('data-color-scheme') === 'dark';
      const compensateFilter = isDark ? 'filter: hue-rotate(180deg);' : '';

      this.mapManager.addMarker(markerId, bus.py, bus.px, {
        iconHtml: `<div class=\"bus-marker\">${markerIconHtml(lineConfig, lineCode, compensateFilter)}</div>`,
        iconSize: [24, 24],
        popupHtml: busPopupHtml(lineConfig, lineCode, bus, compensateFilter)
      });
    });
  }

  toggleBusLine(lineCode, isActive) {
    if (isActive) {
      this.activeBusLines.add(lineCode);
      this.fetchBusPositions(lineCode);
    } else {
      this.activeBusLines.delete(lineCode);
      // remove markers for this line via mapManager
      this.mapManager.removeMarkersByPrefix(lineCode + '-');
    }
    this.updateStats();
  }

  selectAllLines(select) {
    document.querySelectorAll('input[data-line]').forEach(checkbox => {
      checkbox.checked = select;
      this.toggleBusLine(checkbox.dataset.line, select);
    });
  }

  async refreshBusData() {
    for (const lineCode of this.activeBusLines) {
      await this.fetchBusPositions(lineCode);
    }

    const lastUpdate = document.getElementById('last-update');
    if (lastUpdate) lastUpdate.textContent = `Atualizado às ${formatTimeLocale()}`;

    if (this.activeBusLines.size === 0) {
      this.showToast('error', 'Selecione pelo menos uma linha para atualizar');
      return;
    }

    this.updateStats();
  }

  updateStats() {
    const activeLines = document.getElementById('active-lines');
    const totalBuses = document.getElementById('total-buses');

    if (activeLines) activeLines.textContent = this.activeBusLines.size;
    if (totalBuses) totalBuses.textContent = this.mapManager?.markers.size || 0;
  }

  // Ensure sidebar and bottom-panel are mutually exclusive.
  // When sidebar is collapsed = true -> bottom-panel should be expanded (not collapsed), and vice-versa.
  setSidebarCollapsed(collapsed) {
    const sidebarEl = document.getElementById('sidebar');
    const panelEl = document.getElementById('bottom-panel');
    if (sidebarEl) {
      if (collapsed) sidebarEl.classList.add('collapsed'); else sidebarEl.classList.remove('collapsed');
    }
    if (panelEl) {
      // bottom-panel should be opposite of sidebar
      if (collapsed) panelEl.classList.remove('collapsed'); else panelEl.classList.add('collapsed');
    }
  }

  setBottomPanelCollapsed(collapsed) {
    const sidebarEl = document.getElementById('sidebar');
    const panelEl = document.getElementById('bottom-panel');
    if (panelEl) {
      if (collapsed) panelEl.classList.add('collapsed'); else panelEl.classList.remove('collapsed');
    }
    if (sidebarEl) {
      // sidebar should be opposite of bottom-panel
      if (collapsed) sidebarEl.classList.remove('collapsed'); else sidebarEl.classList.add('collapsed');
    }
  }

  

  updateConnectionStatus(status, message) {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
      statusElement.className = `status status--${status}`;
      statusElement.textContent = message;
    }
  }

  showToast(type, message) {
    const toast = document.getElementById(`${type}-toast`);
    const messageElement = document.getElementById(type === 'error' ? 'toast-message' : 'success-message');
    if (toast && messageElement) {
      messageElement.textContent = message;
      toast.classList.remove('hidden');
      toast.classList.add('visible');
      clearTimeout(toast._hideTimeout);
      toast._hideTimeout = setTimeout(() => { toast.classList.remove('visible'); toast.classList.add('hidden'); }, 3000);
    }
  }

  hideLoadingOverlay() {
    setTimeout(() => { document.getElementById('loading-overlay')?.classList.add('hidden'); }, 1500);
  }

  startAutoUpdate() {
    setInterval(() => {
      this.checkStatus();
      if (this.authenticated && this.activeBusLines.size > 0) {
        for (const lc of this.activeBusLines) this.fetchBusPositions(lc);
      }
    }, this.apiConfig.updateInterval);
  }
}
