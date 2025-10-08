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
