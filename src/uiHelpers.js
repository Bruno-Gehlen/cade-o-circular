// UI helper functions for rendering HTML snippets used by BusTracker
export function markerIconHtml(lineConfig, lineCode, compensateFilter = '', direction = 0) {
  const shortCode = lineCode.split('-')[0].slice(-2);
  const rotationStyle = `transform: rotate(${direction}deg);`;
  
  // Cores baseadas no tema
  const isDark = typeof document !== 'undefined' && document.body?.getAttribute('data-color-scheme') === 'dark';
  const textColor = isDark ? '#000' : '#fff';
  const strokeColor = isDark ? '#000' : '#fff';
  const shadowOpacity = isDark ? '0.6' : '0.3';
  
  return `
    <div class="bus-marker-svg" style="${compensateFilter}; position: relative;">
      <div style="${rotationStyle}">
        <svg width="27" height="32" viewBox="0 0 65 65" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow-${shortCode}">
              <feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-opacity="${shadowOpacity}"/>
            </filter>
          </defs>

          <!-- Corpo da gota -->
          <path d="M31.993 2C20.563 17.624 14 32.007 14 43.827C14 53.859 22.064 62 32.001 62C41.946 62 50 53.859 50 43.827C50 32.007 43.245 17.383 31.993 2z"
                fill="${lineConfig.color}" 
                stroke="${strokeColor}" 
                stroke-width="2" 
                filter="url(#shadow-${shortCode})"/>

        </svg>
        <p style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -40%) rotate(-${direction}deg);
          text-align: center;
          font-family: Inter, -apple-system, sans-serif;
          font-size: 10px;
          font-weight: 600;
          color: ${textColor};
          margin: 0;
          line-height: 1;">
          ${shortCode}
        </p>
  `;
}

export function busPopupHtml(lineConfig, lineCode, bus, compensateFilter = '', sentidoInfo = '') {
  // Mapeamento de sentidos por linha
  const sentidoMapping = {
    '8082': { '1': 'Butantã', '2': 'P3' },
    '8083': { '1': 'Butantã', '2': 'P3' },
    '8084': { '1': 'Estátua', '2': 'Butantã' },
    '8085': { '1': 'PTrem', '2': 'P3' },
    '8012': { '1': 'Butantã', '2': 'P3' },
    '8022': { '1': 'Butantã', '2': 'P3' }
  };

  const timeHtml = bus.hr ? `
    <p>
      <strong>Horário:</strong> ${bus.hr}
    </p>
  ` : '';
  
  const getSentidoText = () => {
    if (!bus.sl) return '';
    
    const mapping = sentidoMapping[lineCode];
    if (mapping && mapping[bus.sl]) {
      return mapping[bus.sl];
    }
    
    return bus.sl;
  };
  
  const sentidoText = getSentidoText();
  const sentidoHtml = sentidoText ? `
    <p>
      <strong>Sentido:</strong> ${sentidoText}
    </p>
  ` : '';
  
  return `
    <div class="bus-popup">
      <h5 class="bus-popup-title" style="color: ${lineConfig.color}; ${compensateFilter}">
        ${lineConfig.name}
      </h5>
      <p>
        <strong>Linha:</strong> ${lineCode}
      </p>
      <p>
        <strong>Prefixo:</strong> ${bus.p}
      </p>
      ${timeHtml}
      ${sentidoHtml}
    </div>
  `;
}

export function renderBusLineItemHtml(line) {
  return `
        <label class="bus-line-checkbox">
          <input type="checkbox" data-line="${line.code}">
        </label>
        <div class="bus-line-info">
          <div class="bus-line-code">${line.code}</div>
          <div class="bus-line-name">${line.name}</div>
        </div>
        <div class="line-color-indicator" style="background-color: ${line.color}"></div>
      `;
}

export function userLocationMarkerHtml() {
  return `<div class="user-location-inner"></div>`;
}

export function userLocationPopupHtml(lat, lng, accuracy, compensateFilter = '') {
  return `<div class="user-location-popup"><strong style="${compensateFilter}"><i class="ri-map-pin-fill"></i> Você está aqui!</strong><br><small>Precisão: ≈${Math.round(accuracy)}m</small><br><small>Latitude: ${lat.toFixed(2)}</small><br><small>Longitude: ${lng.toFixed(2)}</small></div>`;
}

export function stopMarkerHtml(stop, lineColor, compensateFilter = '') {
  // small dot with optional tooltip color
  const color = lineColor || '#333';
  const name = (stop && stop.name) ? stop.name : '';
  return `<div class="stop-marker-outer" style="${compensateFilter}"><div class="stop-marker-inner" style="background:${color};border:2px solid #fff;border-radius:50%;width:10px;height:10px;box-shadow:0 0 2px rgba(0,0,0,0.4)"></div></div><div class="stop-marker-popup">${name}</div>`;
}
