class BusTracker {
    constructor() {

        this.apiConfig = {
            baseUrl: window.location.origin + '/api', 
            updateInterval: 30000,
            retryAttempts: 3
        };
        
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
                name: "Metrô Butantã - Cidade Universitária",
                color: "#FF9FF3",
                operating_hours: "24 horas",
                frequency: "30 a 120 Minutos"
            }
        ];

        this.uspLocation = { lat: -23.561, lng: -46.733 };
        this.map = null;
        this.busMarkers = new Map();
        this.activeBusLines = new Set();
        this.authenticated = false;
        this.markers = [];
        this.userLocationMarker = null;
        this.updateTimer = null;

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
        // Alternar tema
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

        // Localização
        document.getElementById('find-location')?.addEventListener('click', () => {
            this.findUserLocation();
        });

        // document.getElementById('find-location')?.addEventListener('click', () => {
        //     if (navigator.geolocation) {
        //         navigator.geolocation.getCurrentPosition(
        //             pos => {
        //                 this.map.setView([pos.coords.latitude, pos.coords.longitude], 16);
        //                 this.showToast('success', 'Localização encontrada! 📍'); 
        //             },
        //             () => this.showToast('error', 'Erro ao obter localização 📍') 
        //         );
        //     } else {
        //         // Tratamento quando geolocalização não é suportada
        //         this.showToast('error', 'Geolocalização não suportada pelo navegador');
        //     }
        // });
        

        // Centralizar USP
        document.getElementById('center-usp')?.addEventListener('click', () => {
            this.map.setView([this.uspLocation.lat, this.uspLocation.lng], 15);
            this.showToast('success', 'Centralizado na USP Butantã! 🎓');
        });

        // Toggle sidebar
        document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
            document.getElementById('sidebar')?.classList.toggle('collapsed');
        });

        // Toggle bottom panel
        document.getElementById('panel-toggle')?.addEventListener('click', () => {
            document.getElementById('bottom-panel')?.classList.toggle('collapsed');
        });

        // Seleção de linhas
        // Select All
        document.getElementById('select-all-btn')?.addEventListener('click', () => {
            this.selectAllLines(true);
            this.showToast('success', 'Todas as linhas selecionadas! 🚌'); 
        });

        // Select None  
        document.getElementById('select-none-btn')?.addEventListener('click', () => {
            this.selectAllLines(false);
            this.showToast('success', 'Todas as linhas desmarcadas'); 
        });

        // Refresh
        document.getElementById('refresh-btn')?.addEventListener('click', () => {
            this.refreshBusData();
            this.showToast('success', 'Dados atualizados! 🔄'); 
        });

        // Checkboxes das linhas
        document.addEventListener('change', (e) => {
            if (e.target.matches('input[data-line]')) {
                this.toggleBusLine(e.target.dataset.line, e.target.checked);
            }
        });

        // Fechar toasts
        document.getElementById('close-error')?.addEventListener('click', () => {
            document.getElementById('error-toast')?.classList.add('hidden');
        });

        document.getElementById('close-success')?.addEventListener('click', () => {
            document.getElementById('success-toast')?.classList.add('hidden');
        });
    }

    // Método melhorado para encontrar localização do usuário
    async findUserLocation() {
        const button = document.getElementById('find-location');

        // 1. ✅ VERIFICAÇÃO PRÉVIA - Evita tentativas desnecessárias
        if (!navigator.geolocation) {
            this.showToast('error', 'Geolocalização não suportada pelo navegador');
            return;
        }

        // 2. ✅ FEEDBACK IMEDIATO - UX melhorada
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span>📍</span><span class="btn-text">Localizando...</span>';
            button.classList.add('loading');
        }

        // 3. ✅ OPÇÕES OTIMIZADAS para melhor precisão e performance
        const options = {
            enableHighAccuracy: true,    // Máxima precisão disponível
            timeout: 10000,             // 10 segundos timeout (era infinito)
            maximumAge: 300000          // Cache por 5 min (evita requisições repetidas)
        };

        try {
            // 4. ✅ PROMISE WRAPPER - Melhor controle de erros
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, options);
            });

            const { latitude, longitude, accuracy } = position.coords;

            // 5. ✅ VALIDAÇÃO DE COORDENADAS
            if (!this.isValidCoordinate(latitude, longitude)) {
                throw new Error('Coordenadas inválidas recebidas');
            }

            // 6. ✅ REMOÇÃO DE MARCADOR ANTERIOR
            if (this.userLocationMarker) {
                this.map.removeLayer(this.userLocationMarker);
            }

            // 7. ✅ MARCADOR PERSONALIZADO mais visível
            const userIcon = L.divIcon({
                className: 'user-location-marker',
                html: `
                    <div style="
                        width: 20px; height: 20px; 
                        background: #3fba99ff; 
                        border: 3px solid white; 
                        border-radius: 50%; 
                        box-shadow: 0 0 0 3px rgba(0,123,255,0.3);
                        animation: pulse 2s infinite;
                    "></div>
                `,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            // 8. ✅ ADICIONAR MARCADOR COM POPUP INFORMATIVO
            this.userLocationMarker = L.marker([latitude, longitude], { icon: userIcon })
                .addTo(this.map)
                .bindPopup(`
                    <div style="text-align: center;">
                        <strong>📍 Você está aqui!</strong><br>
                        <small>Precisão: ≈${Math.round(accuracy)}m</small><br>
                        <small>Lat: ${latitude.toFixed(2)}</small><br>
                        <small>Lng: ${longitude.toFixed(2)}</small>
                    </div>
                `);

            // 9. ✅ ZOOM INTELIGENTE baseado na precisão
            const zoom = this.calculateOptimalZoom(accuracy);
            this.map.setView([latitude, longitude], zoom);

            // 10. ✅ FEEDBACK DETALHADO de sucesso
            const accuracyText = accuracy < 50 ? 'Alta precisão' : accuracy < 200 ? 'Boa precisão' : 'Precisão aproximada';
            this.showToast('success', `Te achei! ${accuracyText}! 📍`);

            // 11. ✅ ANALYTICS/LOG (opcional)
            console.log(`🎯 Localização obtida: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${Math.round(accuracy)}m)`);

        } catch (error) {
            // 12. ✅ TRATAMENTO ESPECÍFICO DE ERROS
            let errorMessage = 'Erro ao obter localização 📍';

            switch (error.code) {
                case 1: // PERMISSION_DENIED
                    errorMessage = 'Permissão de localização negada. Verifique as configurações do navegador 🔒';
                    break;
                case 2: // POSITION_UNAVAILABLE
                    errorMessage = 'Localização indisponível. Verifique GPS/Wi-Fi 📡';
                    break;
                case 3: // TIMEOUT
                    errorMessage = 'Timeout na localização. Tente novamente ⏰';
                    break;
                default:
                    errorMessage = `Erro na localização: ${error.message}`;
            }

            this.showToast('error', errorMessage);
            console.error('❌ Erro geolocalização:', error);

        } finally {
            // 13. ✅ RESTORE BUTTON sempre executado
            if (button) {
                button.disabled = false;
                button.innerHTML = '<span>📍</span><span class="btn-text">Minha Localização</span>';
                button.classList.remove('loading');
            }
        }
    }

    // ✅ MÉTODO AUXILIAR - Validação de coordenadas
    isValidCoordinate(lat, lng) {
        return (
            typeof lat === 'number' && 
            typeof lng === 'number' &&
            lat >= -90 && lat <= 90 &&
            lng >= -180 && lng <= 180 &&
            !isNaN(lat) && !isNaN(lng)
        );
    }

    // ✅ MÉTODO AUXILIAR - Zoom baseado na precisão
    calculateOptimalZoom(accuracy) {
        if (accuracy < 20) return 18;      // Muito preciso - zoom máximo
        if (accuracy < 50) return 17;      // Boa precisão
        if (accuracy < 100) return 16;     // Precisão média  
        if (accuracy < 500) return 15;     // Baixa precisão
        return 14;                         // Muito impreciso
    }

    // ✅ MÉTODO ADICIONAL - Verificar se localização está próxima da USP
    isNearUSP(lat, lng) {
        const uspLat = -23.561;
        const uspLng = -46.733;
        const distance = this.calculateDistance(lat, lng, uspLat, uspLng);
        return distance < 5; // Dentro de 5km da USP
    }

    // ✅ MÉTODO AUXILIAR - Calcular distância entre pontos
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Raio da Terra em km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    async checkStatus() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            this.authenticated = data.authenticated;

            const status = document.getElementById('connection-status');
            if (status) {
                status.className = `status ${this.authenticated ? 'status--success' : 'status--error'}`;
                status.textContent = this.authenticated ? 'Conectado' : 'Desconectado';
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
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error(`❌ Erro HTTP ${response.status}:`, errorData);
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`✅ Dados recebidos para ${lineCode}:`, data);

      return data;
    } catch (error) {
      console.error(`❌ Erro ao buscar posições da linha ${lineCode}:`, error);
      this.showNotification(`Erro ao carregar linha ${lineCode}: ${error.message}`, 'error');
      return { buses: [], error: error.message };
    }
    }

    updateBusMarkers(lineCode, buses) {
        // Remove marcadores antigos desta linha
        this.busMarkers.forEach((marker, key) => {
            if (key.startsWith(lineCode + '-')) {
                this.map.removeLayer(marker);
                this.busMarkers.delete(key);
            }
        });

        // Encontra configuração da linha
        const lineConfig = this.busLines.find(line => line.code === lineCode);
        if (!lineConfig) return;

        // Adiciona novos marcadores
        buses.forEach(bus => {
            const markerId = `${lineCode}-${bus.p}`;

            const markerIcon = L.divIcon({
                className: 'bus-marker',
                html: `<div style="background-color: ${lineConfig.color}; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${lineCode.split('-')[0].slice(-2)}</div>`,
                iconSize: [24, 24]
            });

            const marker = L.marker([bus.py, bus.px], { icon: markerIcon })
                .bindPopup(`
                    <div>
                        <h4 style="color: ${lineConfig.color};">${lineConfig.name}</h4>
                        <p><strong>Linha:</strong> ${lineCode}</p>
                        <p><strong>Prefixo:</strong> ${bus.p}</p>
                        ${bus.hr ? `<p><strong>Horário:</strong> ${bus.hr}</p>` : ''}
                    </div>
                `)
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
            // Remove marcadores desta linha
            this.busMarkers.forEach((marker, key) => {
                if (key.startsWith(lineCode + '-')) {
                    this.map.removeLayer(marker);
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
        if (lastUpdate) {
            lastUpdate.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;
        }

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

    // Toast notifications
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
    // showToast(type, message) {
    //     const toast = document.getElementById(`${type}-toast`);
    //     const messageElement = document.getElementById(type === 'error' ? 'toast-message' : 'success-message');

    //     if (toast && messageElement) {
    //         messageElement.textContent = message;
    //         toast.classList.remove('hidden');
    //         setTimeout(() => toast.classList.add('hidden'), 3000);
    //     }
    // }

    hideLoadingOverlay() {
        setTimeout(() => {
            document.getElementById('loading-overlay')?.classList.add('hidden');
        }, 1500);
    }

    startAutoUpdate() {
        setInterval(() => {
            this.checkStatus();
            if (this.authenticated && this.activeBusLines.size > 0) {
                this.refreshBusData();
            }
        }, 30000); // A cada 30 segundos
    }
}

// Inicializar quando DOM carregar
document.addEventListener('DOMContentLoaded', () => {
    window.busTracker = new BusTracker();
    console.log('🚌 Cade-o-circular iniciado!');
});
