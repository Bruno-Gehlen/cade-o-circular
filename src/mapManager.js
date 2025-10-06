export default class MapManager {
  constructor() {
    this.map = null;
    this.markers = new Map();
    // store polylines separately
    this.polylines = new Map();
  }

  init(containerId, center = [0,0], zoom = 13) {
    this.map = L.map(containerId, { center, zoom });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);
    return this.map;
  }

  on(eventName, cb) {
    if (!this.map) return;
    this.map.on(eventName, cb);
  }

  setView(latlng, zoom) {
    if (!this.map) return;
    this.map.setView(latlng, zoom);
  }

  createDivIcon({ html = '', iconSize = [24,24], iconAnchor } = {}) {
    return L.divIcon({ html, iconSize, iconAnchor });
  }

  addMarker(id, lat, lng, { iconHtml = '', iconSize = [24,24], iconAnchor = null, popupHtml = '' } = {}) {
    if (!this.map) return null;
    // Remove existing marker with same id
    this.removeMarker(id);
    const icon = this.createDivIcon({ html: iconHtml, iconSize, iconAnchor });
    const marker = L.marker([lat, lng], { icon }).addTo(this.map);
    if (popupHtml) marker.bindPopup(popupHtml);
    this.markers.set(id, marker);
    return marker;
  }

  removeMarker(id) {
    const marker = this.markers.get(id);
    if (!marker || !this.map) return;
    try { this.map.removeLayer(marker); } catch (e) {}
    this.markers.delete(id);
  }

  removeMarkersByPrefix(prefix) {
    if (!this.map) return;
    for (const [key, marker] of Array.from(this.markers.entries())) {
      if (key.startsWith(prefix)) {
        try { this.map.removeLayer(marker); } catch (e) {}
        this.markers.delete(key);
      }
    }
  }

  addPolyline(id, latlngs = [], options = {}) {
    if (!this.map) return null;
    // Remove existing polyline with same id
    this.removePolyline(id);
    try {
      const poly = L.polyline(latlngs, options).addTo(this.map);
      this.polylines.set(id, poly);
      return poly;
    } catch (e) {
      console.error('Erro ao adicionar polyline:', e);
      return null;
    }
  }

  removePolyline(id) {
    const poly = this.polylines.get(id);
    if (!poly || !this.map) return;
    try { this.map.removeLayer(poly); } catch (e) {}
    this.polylines.delete(id);
  }

  removePolylinesByPrefix(prefix) {
    if (!this.map) return;
    for (const [key, poly] of Array.from(this.polylines.entries())) {
      if (key.startsWith(prefix)) {
        try { this.map.removeLayer(poly); } catch (e) {}
        this.polylines.delete(key);
      }
    }
  }

  clearPolylines() {
    if (!this.map) return;
    for (const poly of this.polylines.values()) {
      try { this.map.removeLayer(poly); } catch (e) {}
    }
    this.polylines.clear();
  }

  clearMarkers() {
    if (!this.map) return;
    for (const marker of this.markers.values()) {
      try { this.map.removeLayer(marker); } catch (e) {}
    }
    this.markers.clear();
  }

  getMap() { return this.map; }
}
