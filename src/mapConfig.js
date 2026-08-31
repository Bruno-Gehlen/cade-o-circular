/**
 * Configuração do provedor de mapa (MapLibre GL JS).
 *
 * Provedor pretendido: MapTiler (tiles vetoriais OpenMapTiles). Para usá-lo,
 * cadastre-se em https://www.maptiler.com/ (há plano gratuito) e cole a sua
 * chave em MAPTILER_KEY abaixo.
 *
 * Sem chave, o mapa recorre a um provedor OpenMapTiles SEM chave (CARTO) para
 * que a aplicação funcione imediatamente. Basta preencher MAPTILER_KEY para
 * passar a usar o MapTiler — nenhuma outra mudança é necessária.
 *
 * Por que vetorial: os tiles são desenhados pela GPU (zoom suave, rótulos
 * nítidos em telas retina, menos "engasgo" ao arrastar) e a troca de tema
 * claro/escuro passa a usar um estilo próprio para cada tema, em vez do filtro
 * de inversão que era aplicado aos tiles raster do Leaflet.
 */

// Cole aqui a sua chave do MapTiler para usá-lo como provedor.
// Ex.: export const MAPTILER_KEY = 'AbCdEf123456';
export const MAPTILER_KEY = '';

const maptilerStyle = (name) =>
  `https://api.maptiler.com/maps/${name}/style.json?key=${MAPTILER_KEY}`;

// Estilo por tema. Com chave → MapTiler; sem chave → CARTO (OpenMapTiles, keyless).
// Ambos os pares (claro/escuro) são estilos completos e autossuficientes.
export const MAP_STYLES = MAPTILER_KEY
  ? {
      light: maptilerStyle('streets-v2'),
      dark: maptilerStyle('streets-v2-dark'),
    }
  : {
      light: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
      dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    };

// Centro/zoom padrão são passados pelo BusTracker (USP Butantã); estes ficam
// aqui apenas como referência/fallback.
export const MAP_DEFAULTS = {
  center: [-23.561, -46.733], // [lat, lng]
  zoom: 15,
};

// "Um pouco de cor" no tema escuro: estilos escuros como o CARTO dark-matter são
// quase monocromáticos. Recolorimos água e áreas verdes logo após o estilo
// carregar, para o mapa ganhar vida sem ficar berrante. Defina como null para
// desligar, ou ajuste as cores. Só se aplica ao tema escuro.
export const DARK_COLOR_TWEAKS = {
  water: '#1c3a5e', // azul de água (rio Pinheiros, represas) sobre o mapa escuro
  green: '#23402c', // verde de parques/vegetação (campus da USP, praças)
};

// Monta a lista de ajustes de cor a aplicar, casando pelas source-layers do
// esquema OpenMapTiles (funciona em qualquer provedor OpenMapTiles: dark-matter,
// MapTiler, OpenFreeMap…). Função pura — recebe as camadas do estilo e devolve
// { id, prop, value } para o chamador aplicar com setPaintProperty.
export function colorTweaksForLayers(layers, palette) {
  const out = [];
  if (!palette || !Array.isArray(layers)) return out;
  const isWaterFill = (sl) => sl === 'water' || sl === 'ocean';
  const isWaterLine = (sl) => sl === 'waterway';
  // Verde só em áreas comprovadamente verdes: a source-layer `park`, ou
  // landcover/landuse cujo id indique vegetação (evita pintar todo o solo).
  const greenId = /(park|wood|forest|grass|green|golf|garden|scrub|meadow|nature|vegetation|cemeter|pitch|recreation)/i;
  for (const layer of layers) {
    if (!layer || !layer.id) continue;
    const sl = layer['source-layer'];
    const id = layer.id;
    if (layer.type === 'fill' && isWaterFill(sl)) out.push({ id, prop: 'fill-color', value: palette.water });
    else if (layer.type === 'line' && isWaterLine(sl)) out.push({ id, prop: 'line-color', value: palette.water });
    else if (layer.type === 'fill' && (sl === 'park' || ((sl === 'landcover' || sl === 'landuse') && greenId.test(id))))
      out.push({ id, prop: 'fill-color', value: palette.green });
  }
  return out;
}
