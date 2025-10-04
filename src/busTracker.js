import { isValidCoordinate, calculateOptimalZoom, calculateDistance, formatTimeLocale } from './utils.js';

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
    this.busMarkers = new Map();
    this.activeBusLines = new Set();
    this.authenticated = false;
    this.userLocationMarker = null;

    this.init();
  }

  init() {
    this.setupMap();
    this.setupUI();
    this.renderBusLines();
    this.bindEvents();
    this.checkStatus();
    this.hideLoadingOverlay();
    this.startAutoUpdate();
  }

  setupMap() {
    this.map = L.map('map', {
      center: [this.uspLocation.lat, this.uspLocation.lng],
      zoom: 15
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.map.on('movestart', () => {
      document.getElementById('sidebar')?.classList.add('collapsed');
      document.getElementById('bottom-panel')?.classList.add('collapsed');
      document.querySelector('.top-controls')?.classList.add('collapsed');
    });
    this.map.on('moveend', () => {
      document.querySelector('.top-controls')?.classList.remove('collapsed');
      document.querySelector('.bottom-panel')?.classList.remove('collapsed');
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
        sidebar.classList.remove('collapsed');
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
      lineItem.innerHTML = `
                <label class="bus-line-checkbox">
                    <input type="checkbox" data-line="${line.code}">
                </label>
                <div class="bus-line-info">
                    <div class="bus-line-code">${line.code}</div>
                    <div class="bus-line-name">${line.name}</div>
                </div>
                <div class="line-color-indicator" style="background-color: ${line.color}"></div>
            `;
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
      this.map.setView([this.uspLocation.lat, this.uspLocation.lng], 15);
      this.showToast('success', 'Centralizado na USP Butantã! 🎓');
    });

    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('collapsed');
    });

    document.getElementById('panel-toggle')?.addEventListener('click', () => {
      document.getElementById('bottom-panel')?.classList.toggle('collapsed');
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

      if (this.userLocationMarker) this.map.removeLayer(this.userLocationMarker);

      const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: `<div style="width: 20px; height: 20px; background: #3fba99ff; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 0 3px rgba(0,123,255,0.3); animation: pulse 2s infinite;"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      this.userLocationMarker = L.marker([latitude, longitude], { icon: userIcon })
        .addTo(this.map)
        .bindPopup(`<div style="text-align: center;"><strong>📍 Você está aqui!</strong><br><small>Precisão: ≈${Math.round(accuracy)}m</small><br><small>Latitude: ${latitude.toFixed(2)}</small><br><small>Longitude: ${longitude.toFixed(2)}</small></div>`);

      const zoom = calculateOptimalZoom(accuracy);
      this.map.setView([latitude, longitude], zoom);

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
    // Remove old markers for this line
    this.busMarkers.forEach((marker, key) => {
      if (key.startsWith(lineCode + '-')) {
        try { this.map.removeLayer(marker); } catch (e) {}
        this.busMarkers.delete(key);
      }
    });

    const lineConfig = this.busLines.find(line => line.code === lineCode);
    if (!lineConfig) return;

    buses.forEach(bus => {
      const markerId = `${lineCode}-${bus.p}`;
      // If the app is in dark mode, Leaflet's parent container may have a
      // `filter: hue-rotate(180deg)` applied. To compensate and keep the
      // marker colors correct, apply the same hue-rotate on the marker itself
      // (two rotations cancel out: 180deg + 180deg = 360deg => original colors).
      const isDark = typeof document !== 'undefined' && document.body?.getAttribute('data-color-scheme') === 'dark';
      const compensateFilter = isDark ? 'filter: hue-rotate(180deg);' : '';

      const markerIcon = L.divIcon({
        className: 'bus-marker',
        html: `<div style="background-color: ${lineConfig.color}; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); ${compensateFilter}">${lineCode.split('-')[0].slice(-2)}</div>`,
        iconSize: [24, 24]
      });

      const marker = L.marker([bus.py, bus.px], { icon: markerIcon })
        .bindPopup(`<div style="text-align: center; max-width: 90px"><h5 style="color: ${lineConfig.color};">${lineConfig.name}</h5><p><strong>Linha:</strong> ${lineCode}</p><p><strong>Prefixo:</strong> ${bus.p}</p>${bus.hr ? `<p><strong>Horário:</strong> ${bus.hr}</p>` : ''}</div>`)
        .addTo(this.map);

      this.busMarkers.set(markerId, marker);
    });
  }

  toggleBusLine(lineCode, isActive) {
    if (isActive) {
      this.activeBusLines.add(lineCode);
      this.fetchBusPositions(lineCode);
    } else {
      this.activeBusLines.delete(lineCode);
      this.busMarkers.forEach((marker, key) => {
        if (key.startsWith(lineCode + '-')) {
          try { this.map.removeLayer(marker); } catch (e) {}
          this.busMarkers.delete(key);
        }
      });
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
    if (totalBuses) totalBuses.textContent = this.busMarkers.size;
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
