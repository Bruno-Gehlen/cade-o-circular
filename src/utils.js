export function isValidCoordinate(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180 &&
    !isNaN(lat) && !isNaN(lng)
  );
}

export function calculateOptimalZoom(accuracy) {
  if (accuracy < 20) return 18;
  if (accuracy < 50) return 17;
  if (accuracy < 100) return 16;
  if (accuracy < 500) return 15;
  return 14;
}

export function formatTimeLocale(date = new Date()) {
  return date.toLocaleTimeString('pt-BR');
}

// --- Cores ---

function hexToHsl(hex) {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = v => Math.round(255 * v).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

// Versão "vibrante" da cor para o tema escuro: saturação elevada (>=90%) e
// luminosidade na faixa 55–65%, para a cor se destacar no mapa sem perder
// o contraste com o texto preto do marcador.
export function vibrantColor(hex) {
  try {
    const { h, s, l } = hexToHsl(hex);
    const newS = Math.min(100, Math.max(s, 90));
    const newL = Math.min(65, Math.max(55, l));
    return hslToHex(h, newS, newL);
  } catch {
    return hex;
  }
}

// Retorna a cor original no tema claro e a versão vibrante no tema escuro.
export function getThemeAwareColor(hex) {
  const isDark = typeof document !== 'undefined' && document.body?.getAttribute('data-color-scheme') === 'dark';
  return isDark ? vibrantColor(hex) : hex;
}

// --- Alinhamento de direção com os shapes das rotas ---

const EARTH_M_PER_DEG_LAT = 110540;
const EARTH_M_PER_DEG_LNG = 111320;

// Bearing (0–360, 0 = Norte) entre dois pontos, com correção de longitude
// pela latitude (aproximação equiretangular, suficiente para curtas distâncias).
export function bearingDegrees(lat1, lng1, lat2, lng2) {
  const dx = (lng2 - lng1) * Math.cos((lat1 * Math.PI) / 180);
  const dy = lat2 - lat1;
  return (Math.atan2(dx, dy) * (180 / Math.PI) + 360) % 360;
}

// Menor diferença angular entre dois bearings (0–180).
function angularDiff(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

// Pré-computa os segmentos de uma lista de shapes (arrays [lat, lng]) com
// seus bearings, para consultas rápidas de "segmento mais próximo".
export function buildShapeSegments(shapesLatLngs) {
  const segments = [];
  for (const pts of shapesLatLngs) {
    if (!Array.isArray(pts)) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const [lat1, lng1] = pts[i];
      const [lat2, lng2] = pts[i + 1];
      if (lat1 === lat2 && lng1 === lng2) continue;
      segments.push({ lat1, lng1, lat2, lng2, bearing: bearingDegrees(lat1, lng1, lat2, lng2) });
    }
  }
  return segments;
}

// Retorna o bearing do segmento mais próximo do ponto (lat, lng), orientado
// no sentido mais compatível com `referenceBearing` (bearing do movimento ou
// a última direção exibida — evita giros de 180° quando o ônibus está parado).
// Retorna null quando o ponto está a mais de `maxDistanceMeters` de qualquer
// segmento (ex.: ônibus na garagem ou em desvio) — nesse caso o caller usa
// o fallback baseado no movimento.
export function directionFromShapeSegments(segments, lat, lng, referenceBearing = 0, maxDistanceMeters = 80) {
  if (!segments || segments.length === 0) return null;

  const cosLat = Math.cos((lat * Math.PI) / 180);
  const px = lng * EARTH_M_PER_DEG_LNG * cosLat;
  const py = lat * EARTH_M_PER_DEG_LAT;

  let best = null;
  let bestDist = Infinity;

  for (const s of segments) {
    const ax = s.lng1 * EARTH_M_PER_DEG_LNG * cosLat;
    const ay = s.lat1 * EARTH_M_PER_DEG_LAT;
    const bx = s.lng2 * EARTH_M_PER_DEG_LNG * cosLat;
    const by = s.lat2 * EARTH_M_PER_DEG_LAT;

    // Projeção do ponto no segmento (com clamp), em coordenadas planas
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    let t = len2 === 0 ? 0 : ((px - ax) * abx + (py - ay) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * abx;
    const cy = ay + t * aby;

    const dist = Math.hypot(px - cx, py - cy);
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }

  if (!best || bestDist > maxDistanceMeters) return null;

  // O segmento não tem sentido: escolhe entre o bearing e o seu oposto
  // aquele mais próximo da referência (movimento recente/última direção)
  const flipped = (best.bearing + 180) % 360;
  return angularDiff(referenceBearing, flipped) < angularDiff(referenceBearing, best.bearing)
    ? flipped
    : best.bearing;
}

export function calculateBusDirection(busPositions, busId, currentLat, currentLng) {
  const previousPos = busPositions.get(busId);
  
  if (!previousPos) {
    busPositions.set(busId, {
      lat: currentLat,
      lng: currentLng,
      timestamp: Date.now()
    });
    return 0; // Norte por padrão
  }

  const deltaLat = currentLat - previousPos.lat;
  const deltaLng = currentLng - previousPos.lng;
  
  const distance = Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng);
  if (distance < 0.0001) {
    return previousPos.direction || 0;
  }

  let angle = Math.atan2(deltaLng, deltaLat) * (180 / Math.PI);
  
  angle = (angle + 360) % 360;

  busPositions.set(busId, {
    lat: currentLat,
    lng: currentLng,
    timestamp: Date.now(),
    direction: angle
  });

  return angle;
}