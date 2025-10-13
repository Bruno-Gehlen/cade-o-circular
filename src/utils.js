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