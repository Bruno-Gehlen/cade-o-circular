// UI helper functions for rendering HTML snippets used by BusTracker
export function markerIconHtml(lineConfig, lineCode, compensateFilter = '') {
  const shortCode = lineCode.split('-')[0].slice(-2);
  // inner element carries the per-line background color; outer has general marker styles
  return `<div class="bus-marker-inner" style="background-color: ${lineConfig.color}; ${compensateFilter}">${shortCode}</div>`;
}

export function busPopupHtml(lineConfig, lineCode, bus, compensateFilter = '') {
  const timeHtml = bus.hr ? `<p><strong>Horário:</strong> ${bus.hr}</p>` : '';
  // keep the title colored per-line via inline style (single property)
  return `<div class="bus-popup"><h5 class="bus-popup-title" style="color: ${lineConfig.color}; ${compensateFilter}">${lineConfig.name}</h5><p><strong>Linha:</strong> ${lineCode}</p><p><strong>Prefixo:</strong> ${bus.p}</p>${timeHtml}</div>`;
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

export function userLocationPopupHtml(lat, lng, accuracy) {
  return `<div class="user-location-popup"><strong>📍 Você está aqui!</strong><br><small>Precisão: ≈${Math.round(accuracy)}m</small><br><small>Latitude: ${lat.toFixed(2)}</small><br><small>Longitude: ${lng.toFixed(2)}</small></div>`;
}

export function stopMarkerHtml(stop, lineColor) {
  // small dot with optional tooltip color
  const color = lineColor || '#333';
  const name = (stop && stop.name) ? stop.name : '';
  return `<div class="stop-marker-outer"><div class="stop-marker-inner" style="background:${color};border:2px solid #fff;border-radius:50%;width:10px;height:10px;box-shadow:0 0 2px rgba(0,0,0,0.4)"></div></div><div class="stop-marker-popup">${name}</div>`;
}
