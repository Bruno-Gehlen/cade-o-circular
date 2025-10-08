import BusTracker from './busTracker.js';
import busLines from './presetLines.js';

// Checa que a DOM foi iniciada então inicia o BusTracker
document.addEventListener('DOMContentLoaded', () => {
  window.busTracker = new BusTracker({ busLines });
  console.log('🚌 Cade-o-circular iniciado!');
});

export default window.busTracker;
