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
