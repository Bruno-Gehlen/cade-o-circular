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