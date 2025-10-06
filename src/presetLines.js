import shapesData from './shapesData.js';
import routeShapes from './routeShapes.js';

const baseLines = [
  { code: '8082', name: 'Metrô Butantã - Cidade Universitária', color: '#FF6B6B', operating_hours: '04:00-01:13', frequency: '10 a 27 Minutos' },
  { code: '8083', name: 'Metrô Butantã - Cidade Universitária', color: '#4ECDC4', operating_hours: '04:30-01:55', frequency: '12 a 34 Minutos' },
  { code: '8084', name: 'Metrô Butantã Circular USP', color: '#45B7D1', operating_hours: '05:00-00:40', frequency: '6 a 34 Minutos' },
  { code: '8085', name: 'P3 Circular USP', color: '#96CEB4', operating_hours: '04:00-01:30', frequency: '16 a 50 Minutos' },
  { code: '8012', name: 'Metrô Butantã - Cidade Universitária', color: '#FECA57', operating_hours: '24 horas', frequency: '19 a 120 Minutos' },
  { code: '8022', name: 'Metrô Butantã - Cidade Universitária', color: '#FF9FF3', operating_hours: '24 horas', frequency: '30 a 120 Minutos' }
];

const busLines = baseLines.map(line => {
  const shapeIds = routeShapes[line.code] || [];
  const shapes = shapeIds.map(sid => ({ id: sid, points: shapesData[sid] || [] }));
  return Object.assign({}, line, { shapes });
});

export default busLines;
