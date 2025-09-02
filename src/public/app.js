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

        this.uspLocation = { lat: -23.561, lng: -46.733 };
        this.apiConfig = {
            baseUrl: '/api',
            updateInterval: 30000,
            retryAttempts: 3
        };

        // State management
        this.map = null;
        this.authenticated = false;
        this.activeBusLines = new Set();
        this.busMarkers = new Map();
        this.routeLayers = new Map();
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
        this.checkBackendStatus(); // Check status on page load
        this.startAutoUpdate();
    }

    async checkBackendStatus() {
        try {
            const response = await fetch(`${this.apiConfig.baseUrl}/status`);
            if (response.ok) {
                const data = await response.json();
                this.authenticated = data.authenticated;
                if (this.authenticated) {
                    this.updateConnectionStatus('success', 'Conectado');
                } else {
                    this.updateConnectionStatus('error', 'Falha na autenticação');
                }
            } else {
                this.authenticated = false;
                this.updateConnectionStatus('error', 'Falha na conexão');
            }
        } catch (error) {
            this.authenticated = false;
            this.updateConnectionStatus('error', 'Erro de conexão');
            console.error('Error checking backend status:', error);
        }
    }

    async fetchBusPositions(lineCode) {
        try {
            const response = await fetch(`${this.apiConfig.baseUrl}/lines/${lineCode}/positions`);
            if (response.ok) {
                const data = await response.json();
                this.updateBusMarkers(lineCode, data.vs || []);
            } else {
                console.error(`Failed to fetch positions for line ${lineCode}`);
            }
        } catch (error) {
            console.error(`Error fetching positions for line ${lineCode}:`, error);
        }
    }

    async refreshBusData() {
        if (this.activeBusLines.size === 0) {
            return;
        }
        for (const lineCode of this.activeBusLines) {
            await this.fetchBusPositions(lineCode);
        }
        this.updateLastUpdateTime();
        this.updateStats();
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

        // Map interaction handlers
        this.map.on('movestart', () => {
            document.getElementById('sidebar')?.classList.add('collapsed');
            document.getElementById('bottom-panel')?.classList.add('collapsed');
            document.querySelector('.top-controls')?.classList.add('collapsed');
        });

        this.map.on('moveend', () => {
            document.querySelector('.top-controls')?.classList.remove('collapsed');
        });
    }

    updateMapTiles() {
        // Remove existing tile layer
        this.map.eachLayer(layer => {
            if (layer instanceof L.TileLayer) {
                this.map.removeLayer(layer);
            }
        });

        // Sempre usa o tile claro do OpenStreetMap
        const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        L.tileLayer(tileUrl, {
            attribution: '© OpenStreetMap contributors',
            subdomains: 'abc',
            maxZoom: 19
        }).addTo(this.map);
    }

    setupUI() {
        // Load theme preference
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            this.isDarkMode = savedTheme === 'dark';
            document.body.setAttribute('data-color-scheme', this.isDarkMode ? 'dark' : 'light');
        }

        // Initialize connection status
        this.updateConnectionStatus('info', 'Inicializando...');
        
        // Set initial theme
        this.updateThemeIcon();
        
        // Initialize stats
        this.updateStats();
    }

    renderBusLines() {
        const container = document.getElementById('bus-lines-container');
        if (!container) {
            console.error('Bus lines container not found');
            return;
        }

        container.innerHTML = '';

        this.busLines.forEach(line => {
            const lineItem = document.createElement('div');
            lineItem.className = 'bus-line-item';
            lineItem.innerHTML = `
                <label class="bus-line-checkbox" for="data-line">
                    <input id="check-line" type="checkbox" data-line="${line.code}">
                </label>
                <div class="bus-line-info">
                    <div class="bus-line-code">${line.code}</div>
                    <div class="bus-line-name">${line.name}</div>
                    <div class="bus-line-details">
                        <span>⏰ ${line.operating_hours}</span>
                        <span>🔄 ${line.frequency}</span>
                    </div>
                </div>
                <div class="line-color-indicator" style="background-color: ${line.color}"></div>
            `;

            container.appendChild(lineItem);
        });
    }

    bindEvents() {
        // Theme toggle
        document.getElementById('theme-toggle')?.addEventListener('click', () => {
            this.toggleTheme();
        });

        // Location buttons  
        document.getElementById('find-location')?.addEventListener('click', () => {
            this.findUserLocation();
        });

        document.getElementById('center-usp')?.addEventListener('click', () => {
            this.centerOnUSP();
        });

        // Sidebar toggle
        document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Bottom panel toggle
        document.getElementById('panel-toggle')?.addEventListener('click', () => {
            this.toggleBottomPanel();
        });

        // Line selection actions
        document.getElementById('select-all-btn')?.addEventListener('click', () => {
            this.selectAllLines(true);
        });

        document.getElementById('select-none-btn')?.addEventListener('click', () => {
            this.selectAllLines(false);
        });

        document.getElementById('refresh-btn')?.addEventListener('click', () => {
            this.refreshBusData();
        });

        // Bus line checkboxes
        document.addEventListener('change', (e) => {
            if (e.target.matches('.bus-line-checkbox input')) {
                const lineCode = e.target.dataset.line;
                const isChecked = e.target.checked;
                this.toggleBusLine(lineCode, isChecked);
            }
        });

        // Toast close buttons
        document.getElementById('close-error')?.addEventListener('click', () => {
            this.hideToast('error');
        });

        document.getElementById('close-success')?.addEventListener('click', () => {
            this.hideToast('success');
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 't':
                        e.preventDefault();
                        this.toggleTheme();
                        break;
                    case 'l':
                        e.preventDefault();
                        this.findUserLocation();
                        break;
                    case 'u':
                        e.preventDefault();
                        this.centerOnUSP();
                        break;
                }
            }
        });
    }

    updateBusMarkers(lineCode, buses) {
        // Remove existing markers for this line
        const markersToRemove = [];
        this.busMarkers.forEach((marker, key) => {
            if (key.startsWith(lineCode + '-')) {
                this.map.removeLayer(marker);
                markersToRemove.push(key);
            }
        });
        markersToRemove.forEach(key => this.busMarkers.delete(key));

        // Find line configuration
        const lineConfig = this.busLines.find(line => line.code === lineCode);
        if (!lineConfig) return;

        // Add new markers
        buses.forEach(bus => {
            const markerId = `${lineCode}-${bus.p}`;
            
            // Create custom marker
            const markerIcon = L.divIcon({
                className: 'bus-marker',
                html: `<div style="background-color: ${lineConfig.color}; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${lineCode.split('-')[0].slice(-2)}</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            const marker = L.marker([bus.py, bus.px], { icon: markerIcon })
                .bindPopup(`
                    <div style="min-width: 200px;">
                        <h4 style="margin: 0 0 8px 0; color: ${lineConfig.color};">${lineConfig.name}</h4>
                        <p style="margin: 4px 0;"><strong>Linha:</strong> ${lineCode}</p>
                        <p style="margin: 4px 0;"><strong>Prefixo:</strong> ${bus.p}</p>
                        <p style="margin: 4px 0;"><strong>Horário:</strong> ${lineConfig.operating_hours}</p>
                        ${bus.hr ? `<p style="margin: 4px 0;"><strong>Última atualização:</strong> ${bus.hr}</p>` : ''}
                    </div>
                `)
                .addTo(this.map);

            this.busMarkers.set(markerId, marker);
        });
    }

    clearBusMarkers() {
        this.busMarkers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.busMarkers.clear();
    }

    async fetchBusRoute(lineCode) {
        try {
            const response = await fetch(`${this.apiConfig.baseUrl}/lines/${lineCode}/route`);
            if (response.ok) {
                const routeData = await response.json();
                this.drawBusRoute(lineCode, routeData);
            } else {
                console.error(`Failed to fetch route for line ${lineCode}`);
            }
        } catch (error) {
            console.error(`Error fetching route for line ${lineCode}:`, error);
        }
    }

    drawBusRoute(lineCode, routeData) {
        if (this.routeLayers.has(lineCode)) {
            this.map.removeLayer(this.routeLayers.get(lineCode));
        }

        const lineConfig = this.busLines.find(line => line.code === lineCode);
        if (!lineConfig) return;

        const latlngs = routeData.map(point => [point.lat, point.lon]);
        const polyline = L.polyline(latlngs, { color: lineConfig.color }).addTo(this.map);
        this.routeLayers.set(lineCode, polyline);
    }

    clearBusRoute(lineCode) {
        if (this.routeLayers.has(lineCode)) {
            this.map.removeLayer(this.routeLayers.get(lineCode));
            this.routeLayers.delete(lineCode);
        }
    }

    toggleBusLine(lineCode, isActive) {
        const lineItem = document.querySelector(`[data-line="${lineCode}"]`)?.closest('.bus-line-item');
        
        if (isActive) {
            this.activeBusLines.add(lineCode);
            lineItem?.classList.add('active');
            this.fetchBusPositions(lineCode);
            this.fetchBusRoute(lineCode);
        } else {
            this.activeBusLines.delete(lineCode);
            lineItem?.classList.remove('active');
            
            // Remove markers for this line
            const markersToRemove = [];
            this.busMarkers.forEach((marker, key) => {
                if (key.startsWith(lineCode + '-')) {
                    this.map.removeLayer(marker);
                    markersToRemove.push(key);
                }
            });
            markersToRemove.forEach(key => this.busMarkers.delete(key));
            this.clearBusRoute(lineCode);
        }

        this.updateStats();
    }

    selectAllLines(select) {
        const checkboxes = document.querySelectorAll('.bus-line-checkbox input');
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
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span>📍</span><span class="btn-text">Localizando...</span>';
        }

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
                    html: '',
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                });

                this.userMarker = L.marker([latitude, longitude], { icon: userIcon })
                    .addTo(this.map)
                    .bindPopup('📍 Você está aqui!');

                // Center map on user location
                this.map.setView([latitude, longitude], 16);

                if (button) {
                    button.disabled = false;
                    button.innerHTML = '<span>📍</span><span class="btn-text">Minha Localização</span>';
                }

                this.showToast('success', 'Localização encontrada!');
            },
            (error) => {
                if (button) {
                    button.disabled = false;
                    button.innerHTML = '<span>📍</span><span class="btn-text">Minha Localização</span>';
                }

                let errorMessage = 'Não foi possível obter sua localização';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = 'Permissão de localização negada';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = 'Localização não disponível';
                        break;
                    case error.TIMEOUT:
                        errorMessage = 'Timeout ao obter localização';
                        break;
                }

                console.error('Geolocation error:', error);
                this.showToast('error', errorMessage);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000
            }
        );
    }

    centerOnUSP() {
        this.map.setView([this.uspLocation.lat, this.uspLocation.lng], 15);
        this.showToast('success', 'Centralizado na USP Butantã');
    }

    toggleTheme() {
        this.isDarkMode = !this.isDarkMode;
        document.body.setAttribute('data-color-scheme', this.isDarkMode ? 'dark' : 'light');
        
        // Save theme preference
        localStorage.setItem('theme', this.isDarkMode ? 'dark' : 'light');
        
        this.updateThemeIcon();
        this.updateMapTiles();
        
        this.showToast('success', `Tema alterado para ${this.isDarkMode ? 'escuro' : 'claro'}!`);
    }

    updateThemeIcon() {
        const icon = document.querySelector('.theme-icon');
        if (icon) {
            icon.textContent = this.isDarkMode ? '☀️' : '🌙';
        }
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        sidebar?.classList.toggle('collapsed');
    }

    toggleBottomPanel() {
        const panel = document.getElementById('bottom-panel');
        panel?.classList.toggle('collapsed');
    }

    updateConnectionStatus(status, message) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            const statusClass = {
                'success': 'status--success',
                'error': 'status--error',
                'info': 'status--info'
            };
            
            statusElement.className = `status ${statusClass[status] || 'status--info'}`;
            statusElement.textContent = message;
        }
    }

    updateLastUpdateTime() {
        const now = new Date().toLocaleTimeString('pt-BR');
        const lastUpdateElement = document.getElementById('last-update');
        
        if (lastUpdateElement) {
            lastUpdateElement.textContent = `Atualizado às ${now}`;
        }
    }

    updateStats() {
        const activeLines = document.getElementById('active-lines');
        const totalBuses = document.getElementById('total-buses');
        
        if (activeLines) {
            activeLines.textContent = this.activeBusLines.size;
        }
        
        if (totalBuses) {
            totalBuses.textContent = this.busMarkers.size;
        }
    }

    startAutoUpdate() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }

        this.updateTimer = setInterval(() => {
            this.checkBackendStatus();
            if (this.authenticated) {
                this.refreshBusData();
            }
        }, this.apiConfig.updateInterval);

        console.log(`Auto-update started with ${this.apiConfig.updateInterval}ms interval`);
    }

    showToast(type, message) {
        const toast = document.getElementById(`${type}-toast`);
        const messageElement = document.getElementById(type === 'error' ? 'toast-message' : 'success-message');
        if (toast && messageElement) {
            messageElement.textContent = message;
            toast.classList.remove('hidden');
            toast.classList.add('visible');
            // Auto-hide after 4s
            clearTimeout(toast._hideTimeout);
            toast._hideTimeout = setTimeout(() => {
                this.hideToast(type);
            }, 3000);
        }
    }

    hideToast(type) {
        const toast = document.getElementById(`${type}-toast`);
        if (toast) {
            toast.classList.remove('visible');
            toast.classList.add('hidden');
        }
    }

    hideLoadingOverlay() {
        setTimeout(() => {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) {
                overlay.classList.add('hidden');
            }
        }, 1500);
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const busTracker = new BusTracker();
    
    // Make globally accessible for debugging
    window.busTracker = busTracker;
    console.log('🚌 USP Butantã Bus Tracker initialized');
});

// Handle page visibility changes to pause/resume updates
document.addEventListener('visibilitychange', () => {
    if (window.busTracker) {
        if (document.hidden) {
            if (window.busTracker.updateTimer) {
                clearInterval(window.busTracker.updateTimer);
                console.log('Updates paused - page hidden');
            }
        } else {
            window.busTracker.startAutoUpdate();
            console.log('Updates resumed - page visible');
        }
    }
});

// Handle online/offline events
window.addEventListener('offline', () => {
    if (window.busTracker) {
        window.busTracker.updateConnectionStatus('error', 'Sem conexão');
        window.busTracker.showToast('error', 'Conexão perdida - modo offline');
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