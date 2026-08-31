// UI helper functions for rendering HTML snippets used by BusTracker
import { getThemeAwareColor, minutesBetweenTimes } from './utils.js';

export function markerIconHtml(lineConfig, lineCode, direction = 0) {
  const shortCode = lineCode.split('-')[0].slice(-2);
  // No tema escuro usa a versão vibrante da cor da linha
  const lineColor = getThemeAwareColor(lineConfig.color);

  // Texto preto no tema escuro (sobre a cor vibrante clara do marcador).
  // A borda é sempre branca: no mapa escuro ela destaca o marcador e no
  // claro mantém a aparência original.
  const isDark = typeof document !== 'undefined' && document.body?.getAttribute('data-color-scheme') === 'dark';
  const textColor = isDark ? '#000' : '#fff';
  const strokeColor = '#fff';

  // A rotação é aplicada pela variável CSS --rotation (lida por .bus-rotator e,
  // com o sinal invertido, por .bus-label). O valor inicial vai embutido aqui
  // para o primeiro paint sair correto; depois o BusTracker atualiza só essa
  // variável no nó existente, sem regenerar o SVG. A sombra passou a ser um
  // filtro CSS estático em .bus-marker-svg (ver style.css).
  return `
    <div class="bus-marker-svg" style="position: relative; --rotation: ${direction}deg;">
      <div class="bus-rotator">
        <svg width="27" height="32" viewBox="0 0 65 65" xmlns="http://www.w3.org/2000/svg">
          <path d="M31.993 2C20.563 17.624 14 32.007 14 43.827C14 53.859 22.064 62 32.001 62C41.946 62 50 53.859 50 43.827C50 32.007 43.245 17.383 31.993 2z"
                fill="${lineColor}"
                stroke="${strokeColor}"
                stroke-width="2"/>
        </svg>
        <p class="bus-label" style="color: ${textColor};">${shortCode}</p>
      </div>
    </div>
  `;
}

export function busPopupHtml(lineConfig, lineCode, bus, sentidoInfo = '') {
  // Mapeamento de sentidos por linha
  const sentidoMapping = {
    '8082': { '1': 'Butantã', '2': 'P3' },
    '8083': { '1': 'Butantã', '2': 'P3' },
    '8084': { '1': 'Estátua', '2': 'Butantã' },
    '8085': { '1': 'PTrem', '2': 'P3' },
    '8086': { '1': 'Pinheiros', '2': 'Jaguaré' },
    '8012': { '1': 'Butantã', '2': 'P3' },
    '8022': { '1': 'Butantã', '2': 'P3' },
    '177H': { '1': 'P2', '2': 'Metr. Sant.' },
    '701U': { '1': 'P2', '2': 'Metr. Sant.' },
    '702U': { '1': 'Parq. DPII', '2': 'P2' },
    '809U': { '1': 'Barr. Fund.', '2': 'P2' },
    '7181': { '1': 'Prin. Isb.', '2': 'P2' },
    '7411': { '1': 'Sé', '2': 'P2' },
    '7725': { '1': 'Lapa', '2': 'Rio Pequeno' }
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
      <h5 class="bus-popup-title" style="color: ${getThemeAwareColor(lineConfig.color)}">
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
        <input type="checkbox" class="bus-line-checkbox" data-line="${line.code}">
        <div class="bus-line-info">
          <div class="bus-line-code">${line.code}</div>
          <div class="bus-line-name">${line.name}</div>
        </div>
        <div class="line-color-indicator" style="background-color: ${getThemeAwareColor(line.color)}"></div>
      `;
}

export function userLocationMarkerHtml() {
  return `<div class="user-location-inner"></div>`;
}

export function userLocationPopupHtml(lat, lng, accuracy) {
  return `<div class="user-location-popup"><strong><i class="ri-map-pin-fill"></i> Você está aqui!</strong><br><small>Precisão: ≈${Math.round(accuracy)}m</small><br><small>Latitude: ${lat.toFixed(2)}</small><br><small>Longitude: ${lng.toFixed(2)}</small></div>`;
}

export function stopPopupHtml(stop, stopId, pinned = false, lineCode = '', arrivalsHtml = 'Carregando previsões…') {
  const name = (stop && stop.name) ? stop.name : '';
  // O conteúdo de .stop-arrivals é injetado pelo BusTracker (previsão de chegada
  // das linhas selecionadas que atendem esta parada). Ele faz parte da string de
  // conteúdo do popup — e não de um innerHTML avulso — porque o setHTML do popup
  // (MapLibre) redefine o conteúdo a partir dessa string; escrever direto no DOM
  // seria sobrescrito na próxima atualização.
  return `<div class="stop-popup">
    <strong>${name}</strong><br>
    <small>ID: ${stopId}</small>
    <div class="stop-arrivals" data-stop-id="${stopId}">${arrivalsHtml}</div>
    <button class="stop-pin-btn" data-stop-id="${stopId}" data-line-code="${lineCode}">
      <i class="${pinned ? 'ri-pushpin-fill' : 'ri-pushpin-line'}"></i> ${pinned ? 'Desafixar parada' : 'Fixar parada'}
    </button>
  </div>`;
}

// Renderiza a previsão de chegada, uma linha por bloco, para as linhas
// selecionadas que atendem a parada. `payload` é a resposta de
// /api/stops/:id/arrivals; `servingCodes` são os códigos das linhas ativas que
// atendem a parada; `busLines` traz a configuração (para o nome no title).
// Mostra as próximas ~3 chegadas de cada linha.
export function stopArrivalsHtml(payload, servingCodes, busLines = []) {
  if (!servingCodes || servingCodes.length === 0) {
    return `<div class="stop-arrivals-empty">Nenhuma linha selecionada atende esta parada</div>`;
  }
  if (!payload || payload.success === false) {
    return `<div class="stop-arrivals-empty">Previsão indisponível</div>`;
  }

  const hr = payload.hr;
  const respLines = Array.isArray(payload.lines) ? payload.lines : [];

  const blocks = servingCodes.map((code) => {
    const cfg = busLines.find((l) => l.code === code);
    // Todas as entradas da resposta desta linha (o letreiro c vem como "8012-10")
    const entries = respLines.filter((l) => (l.c || '').split('-')[0] === code);

    const mins = [];
    let destino = '';
    for (const e of entries) {
      if (!destino && e.destino) destino = e.destino;
      for (const v of (e.veiculos || [])) {
        const m = minutesBetweenTimes(hr, v.t);
        if (m === null) continue;
        mins.push(m);
      }
    }
    mins.sort((a, b) => a - b);
    const next = mins.slice(0, 3);

    const timesText = next.length === 0
      ? '<span class="stop-arrival-none">sem previsão</span>'
      : next.map((m) => (m <= 0 ? 'chegando' : `${m} min`)).join(' · ');

    const destHtml = destino ? `<span class="stop-arrival-dest"></span>` : '';
    const titleAttr = cfg && cfg.name ? ` title="${cfg.name}"` : '';

    return `<div class="stop-arrival-line">
      <div class="stop-arrival-head"${titleAttr}>
        <span class="stop-arrival-code">${code}</span>${destHtml}
      </div>
      <div class="stop-arrival-times">${timesText}</div>
    </div>`;
  });

  return `<div class="stop-arrivals-list">${blocks.join('')}</div>`;
}

export function stopMarkerHtml(stop, lineColor) {
  // small dot; a cor já vem adaptada ao tema pelo caller
  const color = lineColor || '#333';
  const name = (stop && stop.name) ? stop.name : '';
  return `<div class="stop-marker-outer"><div class="stop-marker-inner" style="background:${color};border:2px solid #fff;border-radius:50%;width:10px;height:10px;box-shadow:0 0 2px rgba(0,0,0,0.4)"></div></div><div class="stop-marker-popup">${name}</div>`;
}
