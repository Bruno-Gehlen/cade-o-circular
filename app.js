// USP Butantã Bus Tracking Application
class BusTracker {
    constructor() {
        // Configuration from provided data
        this.busLines = [
            {
                code: "8082-10",
                name: "Cidade Universitária - Metrô Butantã",
                color: "#FF6B6B",
                operating_hours: "04:00-01:13",
                frequency: "10 a 27 Minutos"
            },
            {
                code: "8083-10", 
                name: "Cidade Universitária - Metrô Butantã",
                color: "#4ECDC4",
                operating_hours: "04:30-01:55",
                frequency: "12 a 34 Minutos"
            },
            {
                code: "8084-10",
                name: "Metrô Butantã - Cidade Universitária (Circular)",
                color: "#45B7D1",
                operating_hours: "05:00-00:40", 
                frequency: "6 a 34 Minutos"
            },
            {
                code: "8085-10",
                name: "P3 Circular USP",
                color: "#96CEB4",
                operating_hours: "04:00-01:30",
                frequency: "16 a 50 Minutos"
            },
            {
                code: "8012-10",
                name: "Metrô Butantã - Cidade Universitária",
                color: "#FECA57",
                operating_hours: "24 horas",
                frequency: "19 a 120 Minutos"
            },
            {
                code: "8022-10",
                name: "Metrô Butantã – Cidade Universitária", 
                color: "#FF9FF3",
                operating_hours: "24 horas",
                frequency: "30 a 120 Minutos"
            }
        ];

        this.uspLocation = { lat: -23.561, lng: -46.733};
        this.apiConfig = {
            baseUrl: "http://api.olhovivo.sptrans.com.br/v0",
            corsProxy: "https://api.allorigins.win/raw?url=",
            updateInterval: 30000,
            retryAttempts: 3
        };

        // State management
        this.map = null;
        this.authenticated = false;
        this.apiKey = null;
        this.activeBusLines = new Set();
        this.busMarkers = new Map();
        this.userMarker = null;
        this.updateTimer = null;
        this.isDarkMode = true;
        
        // Initialize application
        this.init();
    }

    init() {
        this.setupMap();
        this.setupUI();
        this.renderBusLines();
        this.bindEvents();
        this.hideLoadingOverlay();
        
        // Try to get API key from environment or localStorage
        this.checkApiKey();
    }

    setupMap() {
        // Initialize map centered on USP Butantã
        this.map = L.map('map', {
            center: [this.uspLocation.lat, this.uspLocation.lng],
            zoom: 15,
            minZoom: 10,
            maxZoom: 18
        });

        // Add tile layer based on theme
        this.updateMapTiles();

        // Retrair barras ao arrastar o mapa
        this.map.on('movestart', () => {
            document.querySelector('.map-container').classList.add('leaflet-drag-target');
            document.getElementById('sidebar').classList.add('collapsed');
            document.getElementById('bottom-panel').classList.add('collapsed');
            document.querySelector('.top-controls').classList.add('collapsed');
        });
        this.map.on('moveend', () => {
            document.querySelector('.map-container').classList.remove('leaflet-drag-target');
            document.querySelector('.top-controls').classList.remove('collapsed');
        });
    }

    updateMapTiles() {
        // Remove existing tile layer
        this.map.eachLayer(layer => {
            if (layer instanceof L.TileLayer) {
                this.map.removeLayer(layer);
            }
        });

        // Add appropriate tile layer based on theme
        const tileUrl = this.isDarkMode 
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

        L.tileLayer(tileUrl, {
            attribution: this.isDarkMode,
                // ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                // : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            subdomains: 'abc',
            maxZoom: 19
        }).addTo(this.map);
    }

    setupUI() {
        // Initialize connection status
        this.updateConnectionStatus('disconnected', 'Desconectado');
        
        // Set initial theme
        this.updateThemeIcon();
        
        // Initialize stats
        this.updateStats();
    }

    renderBusLines() {
        const container = document.getElementById('bus-lines-container');
        container.innerHTML = '';

        this.busLines.forEach(line => {
            const lineItem = document.createElement('div');
            lineItem.className = 'bus-line-item';
            lineItem.innerHTML = `
                <input type="checkbox" class="bus-line-checkbox" id="line-${line.code}" data-line="${line.code}">
                <div class="bus-line-info">
                    <div class="bus-line-code">${line.code}</div>
                    <div class="bus-line-name">${line.name}</div>
                    <div class="bus-line-details">
                        <span>Horário: ${line.operating_hours}</span>
                        <span>Frequência: ${line.frequency}</span>
                    </div>
                </div>
                <div class="line-color-indicator" style="background-color: ${line.color}"></div>
            `;
            container.appendChild(lineItem);
        });
    }

    bindEvents() {
        // Theme toggle
        document.getElementById('theme-toggle').addEventListener('click', () => {
            this.toggleTheme();
        });

        // Location controls
        document.getElementById('find-location').addEventListener('click', () => {
            this.findUserLocation();
        });

        document.getElementById('center-usp').addEventListener('click', () => {
            this.centerOnUSP();
        });

        // API connection
        // document.getElementById('connect-api').addEventListener('click', () => {
        //     this.connectToAPI();
        // });

        // Manual refresh
        document.getElementById('manual-refresh').addEventListener('click', () => {
            this.refreshBusData();
        });

        // Bus line selection
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('bus-line-checkbox')) {
                this.toggleBusLine(e.target.dataset.line, e.target.checked);
            }
        });

        // Select/Clear all buttons
        document.getElementById('select-all').addEventListener('click', () => {
            this.selectAllLines(true);
        });

        document.getElementById('clear-all').addEventListener('click', () => {
            this.selectAllLines(false);
        });

        // Sidebar toggle
        document.getElementById('sidebar-toggle').addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Panel toggle
        document.getElementById('panel-toggle').addEventListener('click', () => {
            this.toggleBottomPanel();
        });

        // Toast close buttons
        document.getElementById('toast-close').addEventListener('click', () => {
            this.hideToast('error');
        });

        document.getElementById('success-close').addEventListener('click', () => {
            this.hideToast('success');
        });

        // API key input enter key
        // document.getElementById('api-key').addEventListener('keypress', (e) => {
        //     if (e.key === 'Enter') {
        //         this.connectToAPI();
        //     }
        // });
    }

    checkApiKey() {
        // Try to get API key from various sources
        const apiKey = process?.env?.SPTRANS_API_KEY || 
                     localStorage.getItem('sptrans_api_key') ||
                     '';
        
        if (apiKey) {
            document.getElementById('api-key').value = apiKey;
            this.connectToAPI();
        }
    }

    async connectToAPI() {
        const apiKeyInput = document.getElementById('api-key');
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            this.showToast('error', 'Por favor, insira sua chave da API SPTrans');
            return;
        }

        this.apiKey = apiKey;
        this.updateConnectionStatus('connecting', 'Conectando...');

        try {
            const authUrl = `${this.apiConfig.corsProxy}${encodeURIComponent(this.apiConfig.baseUrl + '/Login/Autenticar?token=' + apiKey)}`;
            
            const response = await fetch(authUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const result = await response.text();
                if (result === 'true') {
                    this.authenticated = true;
                    localStorage.setItem('sptrans_api_key', apiKey);
                    this.updateConnectionStatus('connected', 'Conectado com sucesso');
                    this.showToast('success', 'Conectado à API SPTrans com sucesso!');
                    this.startAutoUpdate();
                } else {
                    throw new Error('Chave de API inválida');
                }
            } else {
                throw new Error('Erro na autenticação');
            }
        } catch (error) {
            this.authenticated = false;
            this.updateConnectionStatus('error', 'Erro na conexão');
            this.showToast('error', `Erro ao conectar: ${error.message}`);
        }
    }

    async refreshBusData() {
        if (!this.authenticated) {
            this.showToast('error', 'Conecte-se à API primeiro');
            return;
        }

        if (this.activeBusLines.size === 0) {
            this.showToast('error', 'Selecione pelo menos uma linha de ônibus');
            return;
        }

        this.updateConnectionStatus('loading', 'Atualizando...');

        try {
            // Clear existing bus markers
            this.clearBusMarkers();

            let totalBuses = 0;
            
            for (const lineCode of this.activeBusLines) {
                const buses = await this.getBusPositions(lineCode);
                if (buses && buses.length > 0) {
                    this.displayBuses(lineCode, buses);
                    totalBuses += buses.length;
                }
            }

            this.updateConnectionStatus('connected', 'Dados atualizados');
            this.updateLastUpdateTime();
            this.updateStats();

            if (totalBuses === 0) {
                this.showToast('error', 'Nenhum ônibus encontrado nas linhas selecionadas');
            }

        } catch (error) {
            this.updateConnectionStatus('error', 'Erro na atualização');
            this.showToast('error', `Erro ao atualizar dados: ${error.message}`);
        }
    }

    async getBusPositions(lineCode) {
        try {
            const positionUrl = `${this.apiConfig.corsProxy}${encodeURIComponent(this.apiConfig.baseUrl + '/Posicao?codigoLinha=' + lineCode)}`;
            
            const response = await fetch(positionUrl, {
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                return data.l && data.l[0] ? data.l[0].vs : [];
            } else {
                throw new Error('Erro ao buscar posições dos ônibus');
            }
        } catch (error) {
            console.error(`Erro ao buscar linha ${lineCode}:`, error);
            return [];
        }
    }

    displayBuses(lineCode, buses) {
        const lineConfig = this.busLines.find(line => line.code === lineCode);
        if (!lineConfig) return;

        buses.forEach(bus => {
            if (bus.py && bus.px) {
                const marker = this.createBusMarker(bus, lineConfig);
                this.busMarkers.set(`${lineCode}-${bus.p}`, marker);
            }
        });
    }

    createBusMarker(bus, lineConfig) {
        const icon = L.divIcon({
            className: 'bus-marker',
            html: `<div style="background-color: ${lineConfig.color}">${lineConfig.code.split('-')[0]}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        const marker = L.marker([bus.py, bus.px], { icon })
            .addTo(this.map);

        // Add popup with bus information
        const popupContent = this.createBusPopup(bus, lineConfig);
        marker.bindPopup(popupContent);

        // Handle marker click for bottom panel
        marker.on('click', () => {
            this.showBusDetails(bus, lineConfig);
        });

        return marker;
    }

    createBusPopup(bus, lineConfig) {
        const lastUpdate = new Date(bus.ta).toLocaleTimeString();
        return `
            <div style="min-width: 200px;">
                <h4 style="margin: 0 0 8px 0; color: ${lineConfig.color};">${lineConfig.code}</h4>
                <p style="margin: 0 0 4px 0; font-size: 12px;">${lineConfig.name}</p>
                <hr style="margin: 8px 0;">
                <p style="margin: 4px 0; font-size: 11px;"><strong>Prefixo:</strong> ${bus.p}</p>
                <p style="margin: 4px 0; font-size: 11px;"><strong>Última atualização:</strong> ${lastUpdate}</p>
                ${bus.v ? `<p style="margin: 4px 0; font-size: 11px;"><strong>Velocidade:</strong> ${bus.v} km/h</p>` : ''}
                <p style="margin: 4px 0; font-size: 11px;"><strong>Horário:</strong> ${lineConfig.operating_hours}</p>
            </div>
        `;
    }

    showBusDetails(bus, lineConfig) {
        const detailsContainer = document.getElementById('bus-details');
        const selectedInfo = document.getElementById('selected-bus-info');
        
        detailsContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <div style="width: 12px; height: 12px; background: ${lineConfig.color}; border-radius: 50%;"></div>
                <strong>${lineConfig.code} - ${lineConfig.name}</strong>
            </div>
            <p style="margin: 4px 0; font-size: 12px;">Prefixo: ${bus.p}</p>
            <p style="margin: 4px 0; font-size: 12px;">Última atualização: ${new Date(bus.ta).toLocaleTimeString()}</p>
            ${bus.v ? `<p style="margin: 4px 0; font-size: 12px;">Velocidade: ${bus.v} km/h</p>` : ''}
        `;
        
        selectedInfo.style.display = 'block';
    }

    clearBusMarkers() {
        this.busMarkers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.busMarkers.clear();
    }

    toggleBusLine(lineCode, isActive) {
        const lineItem = document.querySelector(`[data-line="${lineCode}"]`).closest('.bus-line-item');
        
        if (isActive) {
            this.activeBusLines.add(lineCode);
            lineItem.classList.add('active');
        } else {
            this.activeBusLines.delete(lineCode);
            lineItem.classList.remove('active');
            
            // Remove markers for this line
            const markersToRemove = [];
            this.busMarkers.forEach((marker, key) => {
                if (key.startsWith(lineCode + '-')) {
                    this.map.removeLayer(marker);
                    markersToRemove.push(key);
                }
            });
            markersToRemove.forEach(key => this.busMarkers.delete(key));
        }

        this.updateStats();
        
        if (this.authenticated && isActive) {
            this.refreshBusData();
        }
    }

    selectAllLines(select) {
        const checkboxes = document.querySelectorAll('.bus-line-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = select;
            this.toggleBusLine(checkbox.dataset.line, select);
        });
    }

    findUserLocation() {
        if (!navigator.geolocation) {
            this.showToast('error', 'Geolocalização não suportada pelo navegador');
            return;
        }

        const button = document.getElementById('find-location');
        button.disabled = true;
        button.innerHTML = '<span>📍</span> Localizando...';

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                
                // Remove existing user marker
                if (this.userMarker) {
                    this.map.removeLayer(this.userMarker);
                }

                // Add user marker
                const userIcon = L.divIcon({
                    className: 'user-marker',
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                });

                this.userMarker = L.marker([latitude, longitude], { icon: userIcon })
                    .addTo(this.map)
                    .bindPopup('Você está aqui!');

                // Center map on user location
                this.map.setView([latitude, longitude], 16);
                
                button.disabled = false;
                button.innerHTML = '<span>📍</span>';
                this.showToast('success', 'Localização encontrada!');
            },
            (error) => {
                button.disabled = false;
                button.innerHTML = '<span>📍</span> Minha Localização';
                this.showToast('error', 'Não foi possível obter sua localização');
            }
        );
    }

    centerOnUSP() {
        this.map.setView([this.uspLocation.lat, this.uspLocation.lng], 15);
        this.showToast('success', 'Centralizado na USP');
    }

    toggleTheme() {
        this.isDarkMode = !this.isDarkMode;
        document.body.setAttribute('data-color-scheme', this.isDarkMode ? 'dark' : 'light');
        this.updateThemeIcon();
        this.updateMapTiles();
        this.showToast('success', `Tema alterado para ${this.isDarkMode ? 'escuro' : 'claro'}!`);
    }

    updateThemeIcon() {
        const icon = document.querySelector('.theme-icon');
        icon.textContent = this.isDarkMode ? '☀️' : '🌙';
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('collapsed');
    }

    toggleBottomPanel() {
        const panel = document.getElementById('bottom-panel');
        panel.classList.toggle('collapsed');
    }

    updateConnectionStatus(status, message) {
        const statusElement = document.getElementById('connection-status');
        statusElement.className = `status status--${status === 'connected' ? 'success' : status === 'error' ? 'error' : 'info'}`;
        statusElement.textContent = message;
    }

    updateLastUpdateTime() {
        const now = new Date().toLocaleTimeString();
        document.getElementById('last-update').textContent = `Atualizado às ${now}`;
        document.getElementById('update-time').textContent = now;
    }

    updateStats() {
        document.getElementById('active-lines').textContent = this.activeBusLines.size;
        document.getElementById('total-buses').textContent = this.busMarkers.size;
    }

    startAutoUpdate() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }

        this.updateTimer = setInterval(() => {
            if (this.authenticated && this.activeBusLines.size > 0) {
                this.refreshBusData();
            }
        }, this.apiConfig.updateInterval);
    }

    showToast(type, message) {
        const toast = document.getElementById(`${type}-toast`);
        const messageElement = document.getElementById(type === 'error' ? 'toast-message' : 'success-message');
        
        messageElement.textContent = message;
        toast.classList.remove('hidden');

        // Auto-hide after 2 seconds
        setTimeout(() => {
            this.hideToast(type);
        }, 2000);
    }

    hideToast(type) {
        const toast = document.getElementById(`${type}-toast`);
        toast.classList.add('hidden');
    }

    hideLoadingOverlay() {
        setTimeout(() => {
            const overlay = document.getElementById('loading-overlay');
            overlay.classList.add('hidden');
        }, 1500);
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const busTracker = new BusTracker();
    
    // Make globally accessible for debugging
    window.busTracker = busTracker;
});

// Handle page visibility changes to pause/resume updates
document.addEventListener('visibilitychange', () => {
    if (window.busTracker) {
        if (document.hidden) {
            if (window.busTracker.updateTimer) {
                clearInterval(window.busTracker.updateTimer);
            }
        } else {
            window.busTracker.startAutoUpdate();
        }
    }
});

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
    // se mover mais de 40px para a direita, descolapsa
    if ((currentX - dragStartX) > 40) {
        sidebar.classList.remove('collapsed');
        if(document.getElementById('sidebar-toggle')) {
          document.getElementById('sidebar-toggle').textContent = '◀️';
        }
        dragging = false;
    }
}

function onDragEnd() {
    dragging = false;
    dragStartX = null;
}

// Eventos para mouse
dragHandle.addEventListener('mousedown', onDragStart);
document.addEventListener('mousemove', onDragMove);
document.addEventListener('mouseup', onDragEnd);

// Eventos para touch
dragHandle.addEventListener('touchstart', onDragStart);
document.addEventListener('touchmove', onDragMove);
document.addEventListener('touchend', onDragEnd);
