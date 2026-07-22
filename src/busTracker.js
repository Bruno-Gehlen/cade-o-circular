import { isValidCoordinate, calculateOptimalZoom, formatTimeLocale, calculateBusDirection, getThemeAwareColor, buildShapeSegments, directionFromShapeSegments, distanceMeters, minutesBetweenTimes } from './utils.js';
import { markerIconHtml, busPopupHtml, renderBusLineItemHtml, userLocationMarkerHtml, userLocationPopupHtml, stopMarkerHtml, stopPopupHtml, stopArrivalsHtml } from './uiHelpers.js';
import MapManager from './mapManager.js';
import { stopCoords, lineStops } from './stopsData.js';
import shapesData from './shapesData.js';
import routeShapes from './routeShapes.js';

export default class BusTracker {
  constructor(options = {}) {
    this.apiConfig = Object.assign({
      baseUrl: window.location.origin + '/api',
      // 10s entre atualizações; a barra de progresso lê este mesmo valor
      updateInterval: 10000,
      retryAttempts: 3
    }, options.apiConfig || {});
    this.busLines = options.busLines || [];
    this.uspLocation = options.uspLocation || { lat: -23.561, lng: -46.733 };
    this.map = null;
    this.mapManager = new MapManager();
    this.activeBusLines = new Set();
    this.shapeCache = new Map(); 
    this._shapeSegments = new Map(); // segmentos pré-computados por linha (alinhamento do marcador)
    this.busPositions = new Map();
    Object.keys(shapesData || {}).forEach(k => this.shapeCache.set(k, shapesData[k]));
    this.authenticated = false;
    this.userLocationMarker = null;
    this.locationTracking = false;
    this._locationTimer = null;
    this.userLocation = null;      // { lat, lng } da última leitura conhecida
    this.pinnedStop = null;        // parada fixada pelo usuário { id, name, lat, lon, lineCode }
    this._nearestStop = null;      // parada de referência atual (fixada ou mais próxima)
    this._nearestArrivals = null;  // última resposta de previsão da parada
    this._lastArrivalsFetch = 0;
    this._updateTimer = null;
    this._nextUpdateAt = null;
    this._progressTimer = null;
    this._savedUIState = null;
    // Popup de parada aberto e o timer que atualiza sua previsão de chegada
    this._openStopPopup = null;
    this._openStopId = null;
    this._openStopLineCode = '';
    this._stopArrivalsTimer = null;
    this.init();
  }

  async init() {
    // Clientes de baixa capacidade (Android/pouca RAM) pagam caro por re-borrar
    // os pixels do mapa animado sob os overlays. Marca o documento para trocar
    // backdrop-filter por fundos sólidos (ver .no-blur no style.css). iOS/desktop
    // mantêm o efeito fosco.
    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);
    const lowMem = (navigator.deviceMemory || 8) <= 4;
    if (isAndroid || lowMem) document.documentElement.classList.add('no-blur');

    this.setupUI();
    this.setupTheme();
    this.renderBusLines();
    this.bindEvents();
    this.checkStatus();
    await this.preloadBusPositions();
    this.hideLoadingOverlay();
    this.startAutoUpdate();
    // document.getElementById('sidebar')?.classList.add('collapsed');
    document.getElementById('bottom-panel')?.classList.add('collapsed');
    console.log(`🧩 Serviço iniciado com ${this.busLines.length} linhas pré-configuradas`);
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

    // Previsão de chegada nos popups das paradas: busca ao abrir e reatualiza
    // no mesmo ciclo (~10s) enquanto o popup estiver aberto; para ao fechar.
    this.mapManager.on('popupopen', (e) => {
      const el = e.popup?.getElement?.();
      const container = el ? el.querySelector('.stop-arrivals') : null;
      if (!container) return; // não é um popup de parada
      const stopId = container.getAttribute('data-stop-id');
      const pinBtn = el.querySelector('.stop-pin-btn');
      this._openStopPopup = e.popup;
      this._openStopId = stopId;
      // Preserva a linha do marcador clicado para reconstruir o popup mantendo
      // o data-line-code correto do botão de fixar.
      this._openStopLineCode = pinBtn ? (pinBtn.getAttribute('data-line-code') || '') : '';
      this._populateStopArrivals(stopId);
      if (this._stopArrivalsTimer) clearInterval(this._stopArrivalsTimer);
      this._stopArrivalsTimer = setInterval(() => {
        if (!document.hidden) this._populateStopArrivals(stopId);
      }, this.apiConfig.updateInterval);
    });

    this.mapManager.on('popupclose', (e) => {
      if (e.popup !== this._openStopPopup) return;
      if (this._stopArrivalsTimer) {
        clearInterval(this._stopArrivalsTimer);
        this._stopArrivalsTimer = null;
      }
      this._openStopPopup = null;
      this._openStopId = null;
      this._openStopLineCode = '';
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

    // passive: os handlers só leem coordenadas (nunca preventDefault), então
    // marcá-los como passivos deixa o Chrome-Android iniciar o pan do mapa sem
    // esperar o JS — remove o input lag no arrasto sobre o mapa.
    dragHandle.addEventListener('touchstart', onDragStart, { passive: true });
    document.addEventListener('touchmove', onDragMove, { passive: true });
    document.addEventListener('touchend', onDragEnd, { passive: true });

    const lastUpdate = document.getElementById('last-update');
    if (lastUpdate) lastUpdate.textContent = `Atualizado às ${formatTimeLocale()}`;
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

      // Recolore marcadores, rotas e indicadores para o novo tema
      this.refreshThemeColors();

      const themeMessage = newTheme === 'dark' ? 'Tema escuro ativado! <i class="ri-moon-fill"></i>' : 'Tema claro ativado! <i class="ri-sun-fill"></i>';
      this.showToast('success', themeMessage);
    });

    document.getElementById('find-location')?.addEventListener('click', () => {
      this.toggleUserLocation();
    });

    document.getElementById('center-usp')?.addEventListener('click', () => {
      this.mapManager.setView([this.uspLocation.lat, this.uspLocation.lng], 15);
      this.showToast('success', 'Centralizado na USP Butantã! <i class="ri-graduation-cap-fill"></i>');
    });

    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('collapsed');
    });
    
    document.getElementById('panel-toggle')?.addEventListener('click', () => {
        const panel = document.getElementById('bottom-panel');
        panel?.classList.toggle('collapsed');
        // Ao abrir o painel: redesenha a linha tracejada e atualiza a previsão
        if (panel && !panel.classList.contains('collapsed')) {
          this.updateNearestStopInfo({ forceFetch: true });
        } else {
          this.updateNearestStopLine();
        }
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
    });

    document.addEventListener('change', (e) => {
      if (e.target.matches && e.target.matches('input[data-line]')) {
        this.toggleBusLine(e.target.dataset.line, e.target.checked);
      }
    });

    // Delegação de eventos: botão "Fixar parada" nos popups das paradas
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('.stop-pin-btn');
      if (btn) {
        this.togglePinnedStop(btn.dataset.stopId, btn.dataset.lineCode);
      }
    });

    document.getElementById('close-error')?.addEventListener('click', () => {
      document.getElementById('error-toast')?.classList.add('hidden');
    });

    document.getElementById('close-success')?.addEventListener('click', () => {
      document.getElementById('success-toast')?.classList.add('hidden');
    });
  }

  // Liga/desliga o rastreamento contínuo da localização do usuário
  async toggleUserLocation() {
    if (this.locationTracking) {
      this.stopLocationTracking();
      this.showToast('success', 'Rastreamento desativado');
      return;
    }
    await this.startLocationTracking();
  }

  async startLocationTracking() {
    if (!navigator.geolocation) {
      this.showToast('error', 'Geolocalização não suportada pelo navegador');
      return;
    }

    // Primeira leitura: centraliza o mapa no usuário
    const success = await this.updateUserLocation({ center: true });
    if (!success) return; // erro já tratado em updateUserLocation

    this.locationTracking = true;
    this.updateLocationButtonState(true);
    this.showToast('success', 'Rastreamento ativado! <i class="ri-navigation-fill"></i>');

    this.startLocationTimer();
  }

  stopLocationTracking() {
    this.locationTracking = false;
    if (this._locationTimer) {
      clearInterval(this._locationTimer);
      this._locationTimer = null;
    }
    this.updateLocationButtonState(false);
  }

  startLocationTimer() {
    if (this._locationTimer) clearInterval(this._locationTimer);
    this._locationTimer = setInterval(() => {
      this.updateUserLocation({ center: false });
    }, 15000);
  }

  updateLocationButtonState(active) {
    const button = document.getElementById('find-location');
    if (!button) return;
    button.classList.toggle('tracking-active', active);
    button.innerHTML = active
      ? '<span><i class="ri-navigation-fill"></i></span><span class="btn-text">Rastreando...</span>'
      : '<span><i class="ri-map-pin-fill"></i></span><span class="btn-text">Minha Localização</span>';
  }

  // Atualiza o marcador do usuário. Retorna true em caso de sucesso.
  // `center: true` também move a visão do mapa (usado na ativação manual).
  async updateUserLocation({ center = false } = {}) {
    // maximumAge baixo para que as leituras do rastreamento sejam frescas
    const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 };

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

      if (center) {
        const zoom = calculateOptimalZoom(accuracy);
        this.mapManager.setView([latitude, longitude], zoom);

        const accuracyText = accuracy < 50 ? 'Alta precisão' : accuracy < 200 ? 'Boa precisão' : 'Precisão aproximada';
        this.showToast('success', `Te achei! ${accuracyText}! <i class="ri-map-pin-fill"></i>`);
      }
      console.log(`🎯 Localização obtida: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${Math.round(accuracy)}m)`);
      this.userLocation = { lat: latitude, lng: longitude };
      this.updateNearestStopInfo();
      return true;
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

      // Permissão revogada/negada: desliga o rastreamento. Erros transitórios
      // (timeout/indisponível) durante o rastreamento só são logados para não
      // spammear toasts a cada 15s.
      if (error && error.code === 1) {
        this.stopLocationTracking();
        this.showToast('error', errorMessage);
      } else if (center) {
        this.showToast('error', errorMessage);
      } else {
        console.warn('⚠️ Falha transitória ao atualizar localização:', errorMessage);
      }
      console.error('❌ Erro geolocalização:', error);
      return false;
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

  // Busca as posições de todas as linhas monitoradas em UMA única chamada
  // ao proxy (que por sua vez faz no máximo 1 chamada upstream /Posicao por
  // janela de cache). Retorna um mapa { lineCode: [buses] }.
  async fetchAllPositions() {
    const response = await fetch(`${this.apiConfig.baseUrl}/positions`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    const byLine = {};
    for (const line of data.lines || []) {
      const code = (line.c || '').split('-')[0];
      if (!code) continue;
      if (!byLine[code]) byLine[code] = [];
      for (const v of line.vs || []) {
        byLine[code].push({ ...v, sl: line.sl, lineId: line.cl });
      }
    }
    return { hr: data.hr, byLine };
  }

  async preloadBusPositions() {
  console.log('🔄 Pré-carregando posições dos ônibus...');
  try {
    const { byLine } = await this.fetchAllPositions();

    // Armazena as posições sem criar markers
    for (const [lineCode, buses] of Object.entries(byLine)) {
      buses.forEach(bus => {
        const busId = `${lineCode}-${bus.p}`;
        this.busPositions.set(busId, {
          lat: bus.py,
          lng: bus.px,
          timestamp: Date.now()
        });
      });
      console.log(`✅ Posições pré-carregadas para linha ${lineCode}: ${buses.length} ônibus`);
    }
  } catch (error) {
    console.log('⚠️ Falha ao pré-carregar posições:', error.message);
  }
  console.log('🎯 Pré-carregamento concluído');
  }

  // A PARTIR DAQUI AS CANÔNICAS

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

  // Fixa/desafixa uma parada como referência para a linha tracejada e a
  // previsão de chegada (ativado pelo botão no popup da parada)
  togglePinnedStop(stopId, lineCode) {
    const stop = stopCoords[stopId];
    if (!stop) return;

    if (this.pinnedStop && this.pinnedStop.id === stopId) {
      this.pinnedStop = null;
      this.showToast('success', 'Parada desafixada');
    } else {
      this.pinnedStop = { id: stopId, name: stop.name, lat: stop.lat, lon: stop.lon, lineCode };
      this.showToast('success', `Parada fixada: ${stop.name} <i class="ri-pushpin-fill"></i>`);
    }

    this.refreshStopPopups();
    this.updateNearestStopInfo({ forceFetch: true });
  }

  // Atualiza o conteúdo dos popups das paradas para refletir o estado de fixação
  refreshStopPopups() {
    for (const [markerId, marker] of this.mapManager.markers) {
      if (!markerId.includes('-stop-')) continue;
      const [lineCode, stopId] = markerId.split('-stop-');
      const stop = stopCoords[stopId];
      if (!stop) continue;
      marker.setPopupContent(stopPopupHtml(stop, stopId, this.pinnedStop?.id === stopId, lineCode));
    }
    // setPopupContent acima repõe o placeholder "Carregando" no popup aberto;
    // recarrega a previsão para não deixá-lo preso em estado de carregamento.
    if (this._openStopId) this._populateStopArrivals(this._openStopId);
  }

  // Busca e injeta a previsão de chegada no popup de parada aberto, apenas para
  // as linhas ativas que atendem esta parada (a união das linhas selecionadas —
  // independente de qual marcador sobreposto foi clicado). Chamado ao abrir o
  // popup e a cada ciclo enquanto ele permanecer aberto.
  async _populateStopArrivals(stopId) {
    const popup = this._openStopPopup;
    if (!popup || this._openStopId !== stopId) return;

    // Reconstrói o conteúdo do popup com a previsão embutida e usa setContent:
    // é a string de conteúdo do popup que o Leaflet re-renderiza em cada
    // update(); escrever direto no .stop-arrivals do DOM seria revertido.
    const writeArrivals = (arrivalsHtml) => {
      if (this._openStopPopup !== popup || this._openStopId !== stopId) return;
      const stop = stopCoords[stopId];
      if (!stop) return;
      const pinned = this.pinnedStop?.id === stopId;
      popup.setContent(stopPopupHtml(stop, stopId, pinned, this._openStopLineCode, arrivalsHtml));
    };

    const servingCodes = [...this.activeBusLines]
      .filter((code) => (lineStops[code] || []).includes(stopId));

    if (servingCodes.length === 0) {
      writeArrivals(stopArrivalsHtml(null, [], this.busLines));
      return;
    }

    try {
      const response = await fetch(`${this.apiConfig.baseUrl}/stops/${stopId}/arrivals?lines=${servingCodes.join(',')}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      writeArrivals(stopArrivalsHtml(payload, servingCodes, this.busLines));
    } catch (error) {
      console.warn('⚠️ Falha ao buscar previsão do popup da parada:', error.message);
      writeArrivals(stopArrivalsHtml({ success: false }, servingCodes, this.busLines));
    }
  }

  // Encontra a parada mais próxima da localização do usuário, considerando
  // apenas as paradas das linhas ativas. Sem linhas ativas, retorna null.
  findNearestStop(userLat, userLng) {
    if (this.activeBusLines.size === 0) return null;

    let stopIds = [];
    for (const code of this.activeBusLines) {
      stopIds.push(...(lineStops[code] || []));
    }
    if (stopIds.length === 0) return null;

    let best = null;
    let bestDist = Infinity;
    for (const id of stopIds) {
      const stop = stopCoords[id];
      if (!stop || !isFinite(stop.lat) || !isFinite(stop.lon)) continue;
      const d = distanceMeters(userLat, userLng, stop.lat, stop.lon);
      if (d < bestDist) {
        bestDist = d;
        best = { id, name: stop.name, lat: stop.lat, lon: stop.lon, distance: d };
      }
    }
    return best;
  }

  // Atualiza a stat de "chegada na parada mais próxima" e a linha tracejada.
  // A previsão é buscada no máximo 1x/minuto (ou quando a parada muda),
  // exceto com forceFetch.
  async updateNearestStopInfo({ forceFetch = false } = {}) {
    const labelEl = document.getElementById('nearest-stop-label');
    const valueEl = document.getElementById('nearest-arrival');
    if (!labelEl || !valueEl) return;

    if (!this.userLocation) {
      this._nearestStop = null;
      this._nearestArrivals = null;
      labelEl.textContent = 'Parada mais próxima';
      labelEl.title = '';
      valueEl.textContent = 'Ative a localização';
      this.updateNearestStopLine();
      return;
    }

    // Se a parada fixada pertence a uma linha que foi desativada, desafixa
    if (this.pinnedStop && !this.activeBusLines.has(this.pinnedStop.lineCode)) {
      this.pinnedStop = null;
      this.refreshStopPopups();
    }

    // Sem linhas selecionadas não há parada de referência: reseta a stat
    // e remove a linha tracejada
    if (this.activeBusLines.size === 0) {
      this._nearestStop = null;
      this._nearestArrivals = null;
      labelEl.textContent = 'Parada mais próxima';
      labelEl.title = '';
      valueEl.textContent = 'Selecione uma linha';
      this.updateNearestStopLine();
      return;
    }

    // A parada de referência é a fixada pelo usuário, se houver; caso
    // contrário, a mais próxima entre as paradas das linhas ativas
    const stop = this.pinnedStop
      ? { ...this.pinnedStop, distance: distanceMeters(this.userLocation.lat, this.userLocation.lng, this.pinnedStop.lat, this.pinnedStop.lon) }
      : this.findNearestStop(this.userLocation.lat, this.userLocation.lng);
    const stopChanged = !this._nearestStop || !stop || this._nearestStop.id !== stop.id;
    this._nearestStop = stop;
    // Não exibir previsão da parada anterior; e se a parada fixada mudou de
    // ID mas o fetch anterior era para outro cp, força nova busca
    if (stopChanged) this._nearestArrivals = null;
    this.updateNearestStopLine();

    if (!stop) {
      labelEl.textContent = 'Parada mais próxima';
      labelEl.title = '';
      valueEl.textContent = '—';
      return;
    }

    const pinIcon = this.pinnedStop ? '<i class="ri-pushpin-fill"></i> ' : '';
    labelEl.innerHTML = `${pinIcon}${stop.name}`;
    labelEl.title = `${this.pinnedStop ? 'Parada fixada · ' : ''}${stop.name} · ${Math.round(stop.distance)} m`;

    const isStale = Date.now() - this._lastArrivalsFetch > 60000;
    if (forceFetch || stopChanged || isStale || !this._nearestArrivals) {
      this._lastArrivalsFetch = Date.now();
      try {
        // Consulta apenas as linhas ativas que de fato atendem esta parada —
        // o proxy usa GET /Previsao?codigoParada&codigoLinha para cada uma,
        // que é o endpoint que inclui as previsões dos circulares
        const servingLines = [...this.activeBusLines]
          .filter(code => (lineStops[code] || []).includes(stop.id));
        const query = servingLines.length > 0 ? `?lines=${servingLines.join(',')}` : '';
        const response = await fetch(`${this.apiConfig.baseUrl}/stops/${stop.id}/arrivals${query}`);
        if (!response.ok) {
          // 404 = o proxy em execução não tem este endpoint (processo antigo)
          if (response.status === 404) throw new Error('404');
          throw new Error(`HTTP ${response.status}`);
        }
        this._nearestArrivals = await response.json();
      } catch (error) {
        console.warn('⚠️ Falha ao buscar previsão da parada:', error.message);
        valueEl.textContent = error.message === '404' ? 'reinicie o proxy' : 'indisponível';
        return;
      }
    }
    this.renderNearestArrival();
  }

  // Renderiza a menor previsão de chegada (filtrada pelas linhas ativas,
  // quando houver) usando o horário de referência hr da própria API.
  renderNearestArrival() {
    const valueEl = document.getElementById('nearest-arrival');
    if (!valueEl) return;
    const data = this._nearestArrivals;
    if (!data) { valueEl.textContent = '—'; return; }

    let lines = Array.isArray(data.lines) ? data.lines : [];
    // Mostra apenas as linhas ativas: a resposta já vem filtrada pelo proxy
    // (modo ?lines=), mas o filtro local cobre o modo agregado
    if (this.activeBusLines.size > 0) {
      lines = lines.filter(l => this.activeBusLines.has((l.c || '').split('-')[0]));
    }

    let best = null;
    for (const line of lines) {
      for (const v of line.veiculos || []) {
        const mins = minutesBetweenTimes(data.hr, v.t);
        if (mins === null) continue;
        if (!best || mins < best.mins) best = { mins, line: line.c, a: v.a };
      }
    }

    if (!best) {
      valueEl.textContent = 'sem previsão';
    } else if (best.mins <= 0) {
      valueEl.textContent = `chegando · ${best.line}`;
    } else {
      valueEl.textContent = `${best.mins} min · ${best.line}`;
    }
  }

  // Linha tracejada entre o pin do usuário e a parada mais próxima.
  // Só é desenhada enquanto o painel "Estatísticas em Tempo Real" está aberto.
  updateNearestStopLine() {
    const lineId = 'user-nearest-stop';
    const panel = document.getElementById('bottom-panel');
    const panelOpen = !!panel && !panel.classList.contains('collapsed');

    if (panelOpen && this.userLocation && this._nearestStop) {
      // Parada fixada usa a cor da própria linha; a automática usa teal
      let color = getThemeAwareColor('#21808d');
      if (this.pinnedStop) {
        const lineConfig = this.busLines.find(l => l.code === this.pinnedStop.lineCode);
        if (lineConfig) color = getThemeAwareColor(lineConfig.color);
      }

      this.mapManager.addPolyline(lineId, [
        [this.userLocation.lat, this.userLocation.lng],
        [this._nearestStop.lat, this._nearestStop.lon]
      ], {
        dashArray: '6 8',
        color,
        weight: 3,
        opacity: 0.9,
        className: 'nearest-stop-line'
      });
    } else {
      this.mapManager.removePolyline(lineId);
    }
  }

  // Segmentos (com bearings pré-computados) de todos os shapes da linha,
  // usados para alinhar a rotação do marcador à via. Construído uma vez por linha.
  getShapeSegments(lineCode) {
    if (!this._shapeSegments.has(lineCode)) {
      const matchingIds = routeShapes[lineCode] || [];
      // Mesma lógica de segurança do toggleBusLine: inclui ids que contenham o código
      for (const sid of this.shapeCache.keys()) {
        if (!matchingIds.includes(sid) && (sid.startsWith(lineCode) || sid.includes(lineCode))) {
          matchingIds.push(sid);
        }
      }
      const latlngs = matchingIds.map(sid => this.shapeCache.get(sid)).filter(Boolean);
      this._shapeSegments.set(lineCode, buildShapeSegments(latlngs));
    }
    return this._shapeSegments.get(lineCode);
  }

  updateBusMarkers(lineCode, buses) {
  const lineConfig = this.busLines.find(line => line.code === lineCode);
  if (!lineConfig) return;

  const prefix = `${lineCode}-bus-`;
  const seen = new Set();

  buses.forEach(bus => {
    const busId = `${lineCode}-${bus.p}`;
    const markerId = `${prefix}${bus.p}`;
    seen.add(markerId);

    // 1) Bearing pelo movimento (também atualiza o histórico de posições)
    const movementBearing = calculateBusDirection(this.busPositions, busId, bus.py, bus.px);

    // 2) Tenta alinhar ao shape: usa a tangente do segmento mais próximo,
    //    desambiguando o sentido pelo bearing do movimento. Se o ônibus
    //    estiver longe de qualquer shape (garagem/desvio), usa o movimento.
    const shapeBearing = directionFromShapeSegments(
      this.getShapeSegments(lineCode), bus.py, bus.px, movementBearing
    );
    const direction = shapeBearing !== null ? shapeBearing : movementBearing;

    // Guarda a direção final exibida: com o ônibus parado, ela vira a
    // referência da próxima atualização (evita giros espúrios de 180°)
    const stored = this.busPositions.get(busId);
    if (stored) stored.direction = direction;

    const sentidoInfo = bus.sl ? ` (Sentido ${bus.sl})` : '';
    const isDark = document.body?.getAttribute('data-color-scheme') === 'dark';
    const roundedDir = Math.round(direction);

    const existing = this.mapManager.markers.get(markerId);
    if (existing) {
      // A posição é atualizada todo tick, mas o ícone (nó DOM/SVG) só é
      // reconstruído quando o tema muda (recolore). Uma mudança de direção
      // apenas gira o nó existente via a variável CSS --rotation, sem recriar
      // o DOM — evita flicker, mantém o popup aberto e corta o custo por tick.
      existing.setLatLng([bus.py, bus.px]);
      const themeChanged = existing._busRenderedDark !== isDark;
      const dirChanged = existing._busRenderedDir !== roundedDir;
      if (themeChanged) {
        const iconHtml = `<div class="bus-marker">${markerIconHtml(lineConfig, lineCode, direction)}</div>`;
        existing.setIcon(this.mapManager.createDivIcon({ html: iconHtml, iconSize: [24, 24] }));
        this._applyMarkerRotation(existing, direction);
      } else if (dirChanged) {
        this._applyMarkerRotation(existing, direction);
      }
      existing._busRenderedDir = roundedDir;
      existing._busRenderedDark = isDark;
      if (existing.getPopup()) {
        existing.setPopupContent(busPopupHtml(lineConfig, lineCode, bus, sentidoInfo));
      }
    } else {
      const iconHtml = `<div class="bus-marker">${markerIconHtml(lineConfig, lineCode, direction)}</div>`;
      const popupHtml = busPopupHtml(lineConfig, lineCode, bus, sentidoInfo);
      const marker = this.mapManager.addMarker(markerId, bus.py, bus.px, {
        iconHtml,
        iconSize: [24, 24],
        popupHtml
      });
      this._applyMarkerRotation(marker, direction);
      if (marker) {
        marker._busRenderedDir = roundedDir;
        marker._busRenderedDark = isDark;
      }
    }
  });

  // Remove markers de ônibus que não aparecem mais na resposta
  for (const key of Array.from(this.mapManager.markers.keys())) {
    if (key.startsWith(prefix) && !seen.has(key)) {
      this.mapManager.removeMarker(key);
    }
  }

  const totalBuses = document.getElementById('total-buses');
  if (totalBuses) {
    let busCount = 0;
    if (this.mapManager?.markers) {
      for (const [markerId] of this.mapManager.markers) {
        if (markerId.includes('-bus-')) {
          busCount++;
        }
      }
    }
    totalBuses.textContent = busCount;
  }
  }

  // Gira o marcador de ônibus escrevendo a variável CSS --rotation no nó já
  // existente, sem reconstruir o ícone. A gota (.bus-rotator) e o texto
  // (.bus-label) leem essa variável — o texto com o giro contrário para ficar
  // sempre na horizontal.
  _applyMarkerRotation(marker, direction) {
    if (!marker || typeof marker.getElement !== 'function') return;
    const el = marker.getElement();
    if (!el) return;
    const svg = el.querySelector('.bus-marker-svg');
    if (svg) svg.style.setProperty('--rotation', `${direction}deg`);
  }

  addStopMarkers(lineCode) {
    const lineConfig = this.busLines.find(line => line.code === lineCode);
    if (!lineConfig) return;
    const stopsForLine = lineStops[lineCode] || [];

    const stopColor = getThemeAwareColor(lineConfig.color);

    stopsForLine.forEach(stopId => {
      const stop = stopCoords[stopId];
      if (!stop || !isFinite(stop.lat) || !isFinite(stop.lon)) return;
      const markerId = `${lineCode}-stop-${stopId}`;
      this.mapManager.addMarker(markerId, stop.lat, stop.lon, {
        iconHtml: stopMarkerHtml(stop, stopColor),
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        popupHtml: stopPopupHtml(stop, stopId, this.pinnedStop?.id === stopId, lineCode),
        pane: 'stopPane'
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
          this.mapManager.addPolyline(polyId, latlngs, { className: 'map-polyline', color: getThemeAwareColor(lineConfig.color || '#3388ff'), weight: 4, opacity: 0.8 });
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
    // A troca de linhas ativas muda o conjunto de paradas candidatas e o
    // filtro da previsão — recalcula sem forçar fetch (respeita o rate limit)
    this.updateNearestStopInfo();
  }

  // Atualiza os markers de todas as linhas ativas com uma única chamada
  // ao endpoint agregado do proxy.
  async refreshActiveLines() {
    try {
      const { byLine } = await this.fetchAllPositions();
      for (const lineCode of this.activeBusLines) {
        this.updateBusMarkers(lineCode, byLine[lineCode] || []);
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar posições:', error);
      this.showToast('error', 'Erro ao atualizar posições');
    }
  }

  async refreshBusData() {
    if (this.activeBusLines.size === 0) {
      this.showToast('error', 'Selecione pelo menos uma linha para atualizar');
      return;
    }

    await this.refreshActiveLines();

    this.updateStats();

    this.showToast('success', 'Dados atualizados! <i class="ri-refresh-line"></i>');
  }

  updateStats() {
  const totalBuses = document.getElementById('total-buses');
  const lastUpdate = document.getElementById('last-update');
  
  if (lastUpdate) lastUpdate.textContent = `Atualizado às ${formatTimeLocale()}`;
  
  if (totalBuses) {
    let busCount = 0;
    if (this.mapManager?.markers) {
      // Filtrar markers que contêm '-bus-' no ID
      for (const [markerId] of this.mapManager.markers) {
        if (markerId.includes('-bus-')) {
          busCount++;
        }
      }
    }
    totalBuses.textContent = busCount;
    }
  }

  // Reaplica as cores do tema atual em rotas, paradas, indicadores da
  // sidebar e marcadores de ônibus (chamado ao alternar claro/escuro).
  refreshThemeColors() {
    // Polylines (shapes das rotas)
    for (const [id, poly] of this.mapManager.polylines) {
      const lineCode = id.split('-shape-')[0];
      const lineConfig = this.busLines.find(l => l.code === lineCode);
      if (lineConfig) {
        poly.setStyle({ color: getThemeAwareColor(lineConfig.color || '#3388ff') });
      }
    }

    // Marcadores de paradas das linhas ativas
    for (const lineCode of this.activeBusLines) {
      this.mapManager.removeMarkersByPrefix(`${lineCode}-stop-`);
      try { this.addStopMarkers(lineCode); } catch (e) { console.error('Erro ao recolorir paradas:', e); }
    }

    // Indicadores de cor na sidebar (preserva o estado dos checkboxes)
    this.renderBusLines();
    document.querySelectorAll('input[data-line]').forEach(checkbox => {
      checkbox.checked = this.activeBusLines.has(checkbox.dataset.line);
    });

    // Marcadores de ônibus: força um refresh (o proxy responde do cache,
    // então não gera chamada upstream adicional)
    if (this.activeBusLines.size > 0) {
      this.refreshActiveLines();
    }

    // Linha tracejada usuário → parada também acompanha o tema
    this.updateNearestStopLine();
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
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    const message = overlay.querySelector('.loading-text');
    if (message) message.textContent = 'Finalizando carregamento...';
    
    setTimeout(() => {
      overlay.classList.add('hidden');
      }, 1500);
    }
  }

  startAutoUpdate() {
    const tick = async () => {
      this.checkStatus();
      if (this.authenticated && this.activeBusLines.size > 0) {
        await this.refreshActiveLines();
      }
      this.updateNearestStopInfo();
    };

    const scheduleNext = () => {
      this._nextUpdateAt = Date.now() + this.apiConfig.updateInterval;
    };

    scheduleNext();
    this._updateTimer = setInterval(() => {
      tick();
      scheduleNext();
    }, this.apiConfig.updateInterval);

    this.startRefreshProgress();

    // Pausa as atualizações quando a aba fica em segundo plano e retoma
    // (com um refresh imediato) quando o usuário volta
    this._visibilityHandler = () => {
      if (document.hidden) {
        clearInterval(this._updateTimer);
        this._updateTimer = null;
        this._nextUpdateAt = null;
        if (this._locationTimer) {
          clearInterval(this._locationTimer);
          this._locationTimer = null;
        }
      } else if (!this._updateTimer) {
        tick();
        scheduleNext();
        this._updateTimer = setInterval(() => {
          tick();
          scheduleNext();
        }, this.apiConfig.updateInterval);
        // Retoma o rastreamento de localização, se estiver ativo
        if (this.locationTracking) {
          this.updateUserLocation({ center: false });
          this.startLocationTimer();
        }
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  // Barra de progresso do tempo restante até o próximo refresh dos ônibus
  startRefreshProgress() {
    const bar = document.getElementById('refresh-progress-bar');
    const container = document.getElementById('refresh-progress');
    if (!bar) return;

    if (this._progressTimer) clearInterval(this._progressTimer);
    this._progressTimer = setInterval(() => {
      if (!this._nextUpdateAt) {
        bar.style.transform = 'scaleX(0)';
        if (container) container.title = 'Atualização pausada (aba em segundo plano)';
        return;
      }
      const remaining = Math.max(0, this._nextUpdateAt - Date.now());
      const pct = Math.min(100, (remaining / this.apiConfig.updateInterval) * 100);
      // scaleX é composto pela GPU; width forçaria layout+paint a cada tick,
      // mesmo com o mapa parado. Intervalo de 250ms (visualmente idêntico p/ 10s).
      bar.style.transform = `scaleX(${(pct / 100).toFixed(3)})`;
      if (container) container.title = `Próxima atualização em ${Math.ceil(remaining / 1000)}s`;
    }, 250);
  }

  // shapes are provided via imported `shapesData` and `routeShapes`

}
