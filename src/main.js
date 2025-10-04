import BusTracker from './busTracker.js';
import busLines from './presetLines.js';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize with preset lines
  window.busTracker = new BusTracker({ busLines });
  console.log('🚌 Cade-o-circular iniciado!');
});

export default window.busTracker;
