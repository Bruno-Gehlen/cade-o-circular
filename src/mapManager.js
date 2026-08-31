import { MAP_STYLES, DARK_COLOR_TWEAKS, colorTweaksForLayers } from './mapConfig.js';

// Camada de abstração do mapa, agora sobre o MapLibre GL JS (tiles vetoriais).
//
// O BusTracker conversa com o mapa APENAS por esta classe, então a API pública
// (init/on/setView/addMarker/removeMarker/addPolyline/… e os Maps `markers` e
// `polylines`) foi mantida idêntica à versão Leaflet. Os "marcadores" e as
// "polylines" devolvidos são wrappers leves que expõem os mesmos métodos que o
// BusTracker usava no Leaflet (setLatLng, setIcon, getElement, getPopup,
// setPopupContent, setStyle…), traduzindo cada chamada para o MapLibre.
//
// Diferenças internas relevantes:
//  - MapLibre usa a ordem [lng, lat]; o Leaflet usava [lat, lng]. A conversão
//    acontece toda dentro desta classe — o BusTracker segue passando [lat, lng].
//  - Marcadores continuam sendo nós DOM (como os divIcon do Leaflet), o que
//    preserva as gotas em SVG, a rotação via CSS e os popups por clique.
//  - As rotas/linhas viram camadas GeoJSON desenhadas pela GPU (mais leves que
//    as polylines SVG do Leaflet).
//  - O tema claro/escuro troca o ESTILO do mapa (dois estilos vetoriais), em vez
//    de inverter os tiles por filtro CSS.

// Converte o dashArray do Leaflet ("6 8", em px) para o formato do MapLibre
// (múltiplos da largura da linha). Ex.: "6 8" com weight 3 → [2, 2.67].
function parseDashArray(dashArray, weight = 1) {
  if (!dashArray) return null;
  const parts = String(dashArray)
    .split(/[ ,]+/)
    .map((n) => parseFloat(n))
    .filter((n) => !isNaN(n) && n >= 0);
  if (parts.length === 0) return null;
  const w = weight > 0 ? weight : 1;
  return parts.map((p) => Math.max(0.1, p / w));
}

// Wrapper de marcador: reproduz os métodos que o BusTracker chamava nos
// marcadores do Leaflet. É um objeto simples, então propriedades avulsas
// (ex.: _busRenderedDir/_busRenderedDark) continuam podendo ser gravadas nele.
class MarkerHandle {
  constructor(manager, id, mlMarker, popup, el) {
    this._manager = manager;
    this.id = id;
    this._marker = mlMarker;
    this._popup = popup || null;
    this._el = el;
  }

  setLatLng(latlng) {
    const [lat, lng] = Array.isArray(latlng) ? latlng : [latlng.lat, latlng.lng];
    this._marker.setLngLat([lng, lat]);
    return this;
  }

  // Recebe o descritor devolvido por createDivIcon ({ html }) ou uma string HTML.
  setIcon(icon) {
    const html = icon && icon.html != null ? icon.html : typeof icon === 'string' ? icon : '';
    this._el.innerHTML = html;
    return this;
  }

  // Devolve o nó DOM do marcador (a gota/ponto vive dentro dele), para o
  // BusTracker aplicar a rotação via a variável CSS --rotation.
  getElement() {
    return this._el;
  }

  getPopup() {
    return this._popup;
  }

  setPopupContent(html) {
    if (this._popup) this._popup.setHTML(html);
    return this;
  }

  remove() {
    try { this._marker.remove(); } catch (e) {}
  }
}

// Wrapper de polyline: guarda os pontos e o estilo e materializa uma fonte
// GeoJSON + uma camada `line` no MapLibre. Reexpõe setStyle({ color, weight,
// opacity }) como o Leaflet.
class PolylineHandle {
  constructor(manager, id, latlngs, options = {}) {
    this._manager = manager;
    this.id = id;
    this.sourceId = `poly-src::${id}`;
    this.layerId = `poly-lyr::${id}`;
    this._latlngs = Array.isArray(latlngs) ? latlngs : [];
    this.options = {
      color: options.color || '#3388ff',
      weight: options.weight != null ? options.weight : 3,
      opacity: options.opacity != null ? options.opacity : 1,
      dashArray: options.dashArray || null,
    };
  }

  _geojson() {
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        // [lat, lng] (Leaflet/BusTracker) → [lng, lat] (MapLibre/GeoJSON)
        coordinates: this._latlngs
          .filter((p) => Array.isArray(p) && p.length >= 2)
          .map(([lat, lng]) => [lng, lat]),
      },
    };
  }

  _paint() {
    const paint = {
      'line-color': this.options.color,
      'line-width': this.options.weight,
      'line-opacity': this.options.opacity,
    };
    const dash = parseDashArray(this.options.dashArray, this.options.weight);
    if (dash) paint['line-dasharray'] = dash;
    return paint;
  }

  // Adiciona (ou re-adiciona, após uma troca de estilo) a fonte e a camada.
  // Idempotente: se a fonte já existe, não faz nada.
  addToMap() {
    const map = this._manager.map;
    // Usa a flag _styleReady (ligada no primeiro style.load) em vez de
    // isStyleLoaded(): esta última fica FALSA por instantes logo após adicionar
    // uma fonte, o que fazia a 2ª rota de uma linha (ida+volta), adicionada em
    // sequência, ser descartada — só um sentido aparecia. Depois que o estilo
    // carregou, addSource/addLayer funcionam mesmo com outra fonte ainda
    // processando; antes disso, a rota é (re)adicionada em _onStyleReady.
    if (!map || !this._manager._styleReady) return;
    if (map.getSource(this.sourceId)) return;
    try {
      map.addSource(this.sourceId, { type: 'geojson', data: this._geojson() });
      map.addLayer({
        id: this.layerId,
        type: 'line',
        source: this.sourceId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: this._paint(),
      });
    } catch (e) {
      console.error('Erro ao adicionar camada de linha:', e);
    }
  }

  setStyle({ color, weight, opacity } = {}) {
    if (color != null) this.options.color = color;
    if (weight != null) this.options.weight = weight;
    if (opacity != null) this.options.opacity = opacity;
    const map = this._manager.map;
    if (map && map.getLayer(this.layerId)) {
      try {
        if (color != null) map.setPaintProperty(this.layerId, 'line-color', color);
        if (weight != null) map.setPaintProperty(this.layerId, 'line-width', weight);
        if (opacity != null) map.setPaintProperty(this.layerId, 'line-opacity', opacity);
      } catch (e) {}
    }
    return this;
  }

  remove() {
    const map = this._manager.map;
    if (!map) return;
    try { if (map.getLayer(this.layerId)) map.removeLayer(this.layerId); } catch (e) {}
    try { if (map.getSource(this.sourceId)) map.removeSource(this.sourceId); } catch (e) {}
  }
}

export default class MapManager {
  constructor() {
    this.map = null;
    this.markers = new Map();
    this.polylines = new Map();

    // Relay de eventos de popup (o MapLibre não tem eventos popupopen/popupclose
    // no mapa como o Leaflet — emitimos os nossos a partir dos eventos do popup).
    this._listeners = new Map(); // eventName -> Set(cb)
    this._openPopup = null;      // popup atualmente aberto (UX de 1 popup por vez)

    this._theme = 'dark';
    this._styleUrls = MAP_STYLES;
    // Vira true no primeiro style.load e volta a false durante uma troca de
    // estilo (tema). Enquanto false, as rotas ficam pendentes e são
    // materializadas em _onStyleReady quando o estilo termina de carregar.
    this._styleReady = false;
  }

  init(containerId, center = [0, 0], zoom = 13) {
    const [lat, lng] = center;
    this._theme = this._themeFromDom();

    this.map = new maplibregl.Map({
      container: containerId,
      style: this._styleUrls[this._theme] || this._styleUrls.dark,
      center: [lng, lat], // MapLibre usa [lng, lat]
      zoom,
      attributionControl: false,
      // Mapa plano, sempre voltado ao Norte — as gotas dos ônibus são alinhadas à
      // tela por CSS, então permitir rotação/inclinação descasaria as gotas das
      // rotas. Mantemos a mesma experiência "chapada" do Leaflet.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    });

    // Zoom por toque continua (pinça), mas sem rotação por dois dedos.
    if (this.map.touchZoomRotate && this.map.touchZoomRotate.disableRotation) {
      this.map.touchZoomRotate.disableRotation();
    }

    // Atribuição compacta (obrigatória para OSM/OpenMapTiles); discreta no canto.
    this.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    // As rotas (camadas GeoJSON) são apagadas a cada troca de estilo (tema);
    // re-adiciona todas quando um novo estilo termina de carregar. Também cobre
    // o primeiro carregamento. O realce de cor (água/verde) é reaplicado junto,
    // pois também é perdido na troca de estilo.
    this.map.on('style.load', () => this._onStyleReady());
    this.map.once('load', () => this._onStyleReady());

    // Troca o estilo do mapa quando o tema (data-color-scheme no <body>) muda —
    // assim o BusTracker não precisa saber nada sobre o provedor de tiles.
    this._observeTheme();

    return this.map;
  }

  _themeFromDom() {
    return document.body && document.body.getAttribute('data-color-scheme') === 'light'
      ? 'light'
      : 'dark';
  }

  _observeTheme() {
    if (typeof MutationObserver === 'undefined' || !document.body) return;
    this._themeObserver = new MutationObserver(() => {
      const theme = this._themeFromDom();
      if (theme !== this._theme) this._applyTheme(theme);
    });
    this._themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-color-scheme'],
    });
  }

  _applyTheme(theme) {
    this._theme = theme;
    const url = this._styleUrls[theme] || this._styleUrls.dark;
    if (!this.map) return;
    // setStyle apaga as fontes/camadas próprias (rotas); os marcadores (nós DOM)
    // sobrevivem. As rotas voltam no handler de style.load com a cor já atual.
    // Marca o estilo como "não pronto" até o próximo style.load para que rotas
    // adicionadas nesse meio-tempo fiquem pendentes em vez de se perderem.
    this._styleReady = false;
    this.map.setStyle(url);
  }

  _onStyleReady() {
    this._styleReady = true;
    this._applyColorTweaks();
    this._readdPolylines();
  }

  _readdPolylines() {
    for (const poly of this.polylines.values()) {
      poly.addToMap();
    }
  }

  // "Um pouco de cor" no tema escuro: recolore água e áreas verdes do basemap.
  // Casado por source-layer do OpenMapTiles (ver colorTweaksForLayers), então é
  // agnóstico de provedor e degrada em silêncio se uma camada não existir.
  _applyColorTweaks() {
    if (this._theme !== 'dark' || !DARK_COLOR_TWEAKS || !this.map) return;
    let layers;
    try { layers = this.map.getStyle().layers; } catch (e) { return; }
    for (const t of colorTweaksForLayers(layers, DARK_COLOR_TWEAKS)) {
      try { this.map.setPaintProperty(t.id, t.prop, t.value); } catch (e) {}
    }
  }

  on(eventName, cb) {
    if (!this.map) return;
    if (eventName === 'popupopen' || eventName === 'popupclose') {
      if (!this._listeners.has(eventName)) this._listeners.set(eventName, new Set());
      this._listeners.get(eventName).add(cb);
      return;
    }
    // movestart/moveend e demais eventos nativos do mapa
    this.map.on(eventName, cb);
  }

  _emit(eventName, payload) {
    const set = this._listeners.get(eventName);
    if (!set) return;
    for (const cb of set) {
      try { cb(payload); } catch (e) { console.error(e); }
    }
  }

  setView(latlng, zoom) {
    if (!this.map) return;
    const [lat, lng] = Array.isArray(latlng) ? latlng : [latlng.lat, latlng.lng];
    const opts = { center: [lng, lat] };
    if (zoom != null) opts.zoom = zoom;
    // jumpTo = reposicionamento instantâneo, equivalente ao setView do Leaflet
    // (dispara movestart/moveend, então a lógica de recolher a UI segue valendo).
    this.map.jumpTo(opts);
  }

  // Mantido por compatibilidade: agora devolve apenas um descritor de ícone.
  // O setIcon do MarkerHandle lê o campo `html`.
  createDivIcon({ html = '', iconSize = [24, 24], iconAnchor } = {}) {
    return { html, iconSize, iconAnchor };
  }

  addMarker(id, lat, lng, { iconHtml = '', iconSize = [24, 24], iconAnchor = null, popupHtml = '', pane = null } = {}) {
    if (!this.map) return null;
    this.removeMarker(id);

    // Elemento-raiz do marcador: o MapLibre escreve o transform de posição AQUI;
    // a gota/ponto (com a sua própria rotação) fica nos filhos, intocada.
    const el = document.createElement('div');
    el.className = 'ml-marker';
    el.innerHTML = iconHtml;

    // Empilhamento equivalente aos panes do Leaflet: paradas ABAIXO dos ônibus,
    // usuário ACIMA de tudo. O MapLibre (v5) não sobrescreve o z-index dos
    // marcadores, então este valor é estável.
    el.style.zIndex = pane === 'stopPane' ? '590' : id === 'user-location' ? '700' : '600';

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(this.map);

    let popup = null;
    if (popupHtml) {
      popup = new maplibregl.Popup({
        offset: 16,
        closeButton: true,
        closeOnClick: true,
        maxWidth: '260px',
      }).setHTML(popupHtml);
      // Alias compatível com o Leaflet: o BusTracker chama popup.setContent(...)
      // no popup aberto (this._openStopPopup) para reescrever a previsão.
      popup.setContent = (html) => popup.setHTML(html);
      popup.on('open', () => this._onPopupOpen(popup));
      popup.on('close', () => this._onPopupClose(popup));
      marker.setPopup(popup);
    }

    const handle = new MarkerHandle(this, id, marker, popup, el);
    this.markers.set(id, handle);
    return handle;
  }

  _onPopupOpen(popup) {
    // UX de 1 popup por vez (como o Leaflet): fecha o anterior ao abrir outro.
    if (this._openPopup && this._openPopup !== popup) {
      try { this._openPopup.remove(); } catch (e) {}
    }
    this._openPopup = popup;
    this._emit('popupopen', { popup });
  }

  _onPopupClose(popup) {
    if (this._openPopup === popup) this._openPopup = null;
    this._emit('popupclose', { popup });
  }

  removeMarker(id) {
    const handle = this.markers.get(id);
    if (!handle) return;
    if (this._openPopup && handle._popup === this._openPopup) this._openPopup = null;
    handle.remove();
    this.markers.delete(id);
  }

  removeMarkersByPrefix(prefix) {
    for (const [key, handle] of Array.from(this.markers.entries())) {
      if (key.startsWith(prefix)) {
        if (this._openPopup && handle._popup === this._openPopup) this._openPopup = null;
        handle.remove();
        this.markers.delete(key);
      }
    }
  }

  addPolyline(id, latlngs = [], options = {}) {
    if (!this.map) return null;
    this.removePolyline(id);
    try {
      const handle = new PolylineHandle(this, id, latlngs, options);
      this.polylines.set(id, handle);
      // Adiciona já, se o estilo estiver pronto; senão o handler de style.load
      // (registrado no init) a materializa quando o estilo terminar de carregar.
      handle.addToMap();
      return handle;
    } catch (e) {
      console.error('Erro ao adicionar polyline:', e);
      return null;
    }
  }

  removePolyline(id) {
    const handle = this.polylines.get(id);
    if (!handle) return;
    handle.remove();
    this.polylines.delete(id);
  }

  removePolylinesByPrefix(prefix) {
    for (const [key, handle] of Array.from(this.polylines.entries())) {
      if (key.startsWith(prefix)) {
        handle.remove();
        this.polylines.delete(key);
      }
    }
  }

  clearPolylines() {
    for (const handle of this.polylines.values()) handle.remove();
    this.polylines.clear();
  }

  clearMarkers() {
    for (const handle of this.markers.values()) handle.remove();
    this.markers.clear();
    this._openPopup = null;
  }

  getMap() { return this.map; }
}
