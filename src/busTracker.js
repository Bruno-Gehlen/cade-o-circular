import { isValidCoordinate, calculateOptimalZoom, calculateDistance, formatTimeLocale } from './utils.js';
import { markerIconHtml, busPopupHtml, renderBusLineItemHtml, userLocationMarkerHtml, userLocationPopupHtml, stopMarkerHtml } from './uiHelpers.js';
import MapManager from './mapManager.js';
import { stopCoords, lineStops } from './stopsData.js';
import shapesData from './shapesData.js';
import routeShapes from './routeShapes.js';

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
    this.shapeCache = new Map(); // shape_id => [[lat,lng], ...]
    // Initialize shapeCache from imported shapesData
    Object.keys(shapesData || {}).forEach(k => this.shapeCache.set(k, shapesData[k]));
    this.authenticated = false;
    this.userLocationMarker = null;
    this._savedUIState = null; // used to save/restore UI collapsed states during map interactions
    this.init();
  }

  init() {
    this.setupUI();
    this.setupTheme();
    this.renderBusLines();
    this.bindEvents();
    this.checkStatus();
    this.hideLoadingOverlay();
    this.startAutoUpdate();
    document.getElementById('sidebar')?.classList.add('collapsed');
    document.getElementById('bottom-panel')?.classList.add('collapsed');
  }

  setupUI() {
    const self = this;
    this.mapManager.init('map', [this.uspLocation.lat, this.uspLocation.lng], 15);

    // Save current UI states once, then collapse top-controls, sidebar and bottom-panel while moving
    this.mapManager.on('movestart', () => {
      if (!this._savedUIState) {
        const topEl = document.querySelector('.top-controls');
        const sidebarEl = document.getElementById('sidebar');
        const panelEl = document.getElementById('bottom-panel');
        this._savedUIState = {
          topCollapsed: topEl?.classList.contains('collapsed') || false,
          sidebarCollapsed: sidebarEl?.classList.contains('abaixada') || false,
          panelCollapsed: panelEl?.classList.contains('abaixado') || false
        };
      }

      document.querySelector('.top-controls')?.classList.add('collapsed');
      document.getElementById('sidebar')?.classList.add('abaixada');
      document.getElementById('bottom-panel')?.classList.add('abaixado');
    });

    // Restore previously saved UI states after moving the map
    this.mapManager.on('moveend', () => {
      const topEl = document.querySelector('.top-controls');
      const sidebarEl = document.getElementById('sidebar');
      const panelEl = document.getElementById('bottom-panel');

      if (this._savedUIState) {
        if (this._savedUIState.topCollapsed) topEl?.classList.add('collapsed'); else topEl?.classList.remove('collapsed');
        if (this._savedUIState.sidebarCollapsed) sidebarEl?.classList.add('abaixada'); else sidebarEl?.classList.remove('abaixada');
        if (this._savedUIState.panelCollapsed) panelEl?.classList.add('abaixado'); else panelEl?.classList.remove('abaixado');
        this._savedUIState = null;
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
        // self.setSidebarCollapsed(false);
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

  setupTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-color-scheme', savedTheme);

    const themeIcon = document.querySelector('.theme-icon');
    // if (themeIcon) themeIcon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    if (themeIcon) themeIcon.innerHTML = savedTheme === 'dark' ? '<i class="ri-sun-fill"></i>' : '<i class="ri-moon-fill"></i>';

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
      if (icon) icon.innerHTML = newTheme === 'dark' ? '<i class="ri-sun-fill"></i>' : '<i class="ri-moon-fill"></i>';

      const themeMessage = newTheme === 'dark' ? 'Tema escuro ativado! <i class="ri-moon-fill"></i>' : 'Tema claro ativado! <i class="ri-sun-fill"></i>';
      this.showToast('success', themeMessage);
    });

    document.getElementById('find-location')?.addEventListener('click', () => {
      this.findUserLocation();
    });

    document.getElementById('center-usp')?.addEventListener('click', () => {
      this.mapManager.setView([this.uspLocation.lat, this.uspLocation.lng], 15);
      this.showToast('success', 'Centralizado na USP Butantã! <i class="ri-graduation-cap-fill"></i>');
    });

    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('collapsed');
    });
    
    document.getElementById('panel-toggle')?.addEventListener('click', () => {
        document.getElementById('bottom-panel')?.classList.toggle('collapsed');
    });

    document.getElementById('select-all-btn')?.addEventListener('click', () => {
      document.querySelectorAll('input[data-line]').forEach(checkbox => {
        checkbox.checked = true;
        this.toggleBusLine(checkbox.dataset.line, true);
      });
      // this.showToast('success', 'Todas as linhas selecionadas! 🚌');
    });

    document.getElementById('select-none-btn')?.addEventListener('click', () => {
      document.querySelectorAll('input[data-line]').forEach(checkbox => {
        checkbox.checked = false;
        this.toggleBusLine(checkbox.dataset.line, false);
      });
      // this.showToast('success', 'Todas as linhas desmarcadas');
    });

    document.getElementById('refresh-btn')?.addEventListener('click', () => {
      this.refreshBusData();
      this.showToast('success', 'Dados atualizados! <i class="ri-refresh-line"></i>');
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
    const isDark = typeof document !== 'undefined' && document.body?.getAttribute('data-color-scheme') === 'dark';
    const compensateFilter = isDark ? 'filter: hue-rotate(180deg);' : '';

    if (!navigator.geolocation) {
      this.showToast('error', 'Geolocalização não suportada pelo navegador');
      return;
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
        popupHtml: userLocationPopupHtml(latitude, longitude, accuracy, compensateFilter)
      });

      const zoom = calculateOptimalZoom(accuracy);
      this.mapManager.setView([latitude, longitude], zoom);

      const accuracyText = accuracy < 50 ? 'Alta precisão' : accuracy < 200 ? 'Boa precisão' : 'Precisão aproximada';
      this.showToast('success', `Te achei! ${accuracyText}! <i class="ri-map-pin-fill"></i>`);
      console.log(`🎯 Localização obtida: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${Math.round(accuracy)}m)`);
    } catch (error) {
      let errorMessage = 'Erro ao obter localização <i class="ri-map-pin-fill"></i>';
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
        button.innerHTML = '<span><i class="ri-map-pin-fill"></i></span><span class="btn-text">Minha Localização</span>';
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
    // Remove old bus markers for this line via mapManager (keep stop markers)
    this.mapManager.removeMarkersByPrefix(`${lineCode}-bus-`);

    const lineConfig = this.busLines.find(line => line.code === lineCode);
    if (!lineConfig) return;

    buses.forEach(bus => {
      const markerId = `${lineCode}-bus-${bus.p}`;
      const isDark = typeof document !== 'undefined' && document.body?.getAttribute('data-color-scheme') === 'dark';
      const compensateFilter = isDark ? 'filter: hue-rotate(180deg);' : '';

      this.mapManager.addMarker(markerId, bus.py, bus.px, {
        iconHtml: `<div class=\"bus-marker\">${markerIconHtml(lineConfig, lineCode, compensateFilter)}</div>`,
        iconSize: [24, 24],
        popupHtml: busPopupHtml(lineConfig, lineCode, bus, compensateFilter)
      });
    });
  }

  addStopMarkers(lineCode) {
    const lineConfig = this.busLines.find(line => line.code === lineCode);
    if (!lineConfig) return;
    const stopsForLine = lineStops[lineCode] || [];

    stopsForLine.forEach(stopId => {
      const stop = stopCoords[stopId];
      if (!stop || !isFinite(stop.lat) || !isFinite(stop.lon)) return;
      const markerId = `${lineCode}-stop-${stopId}`;
      this.mapManager.addMarker(markerId, stop.lat, stop.lon, {
        iconHtml: stopMarkerHtml(stop, lineConfig.color),
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        popupHtml: `<div class=\"stop-popup\"><strong>${stop.name}</strong><br><small>ID: ${stopId}</small></div>`
      });
    });
  }

  toggleBusLine(lineCode, isActive) {
    if (isActive) {
      this.activeBusLines.add(lineCode);
      this.fetchBusPositions(lineCode);
      // add stops for this line
      try { this.addStopMarkers(lineCode); } catch (e) { console.error('Erro ao adicionar paradas:', e); }

      try {
        const matchingShapeIds = routeShapes[lineCode] || [];
        // As a safety, also include any shape id that includes the lineCode
        for (const sid of this.shapeCache.keys()) {
          if (!matchingShapeIds.includes(sid) && (sid.startsWith(lineCode) || sid.includes(lineCode))) matchingShapeIds.push(sid);
        }

        matchingShapeIds.forEach((sid, idx) => {
          const latlngs = this.shapeCache.get(sid);
          if (!latlngs || latlngs.length === 0) return;
          const lineConfig = this.busLines.find(l => l.code === lineCode) || { color: '#3388ff' };
          const polyId = `${lineCode}-shape-${sid}-${idx}`;
          this.mapManager.addPolyline(polyId, latlngs, { className: 'map-polyline', color: lineConfig.color || '#3388ff', weight: 4, opacity: 0.8 });
        });
      } catch (e) {
        console.error('Erro ao desenhar shapes para linha', lineCode, e);
      }

    } else {
      this.activeBusLines.delete(lineCode);
      // remove markers and polylines for this line via mapManager
      this.mapManager.removeMarkersByPrefix(`${lineCode}-`);
      this.mapManager.removePolylinesByPrefix(`${lineCode}-shape-`);
    }
    this.updateStats();
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
      messageElement.innerHTML = message;
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

  // shapes are provided via imported `shapesData` and `routeShapes`
}
