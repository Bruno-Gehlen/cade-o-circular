import shapesData from './shapesData.js';
import routeShapes from './routeShapes.js';

const baseLines = [
  { code: '8082', name: 'Metrô Butantã - Cid. Universit.', color: '#FF6B6B', operating_hours: '04:00-01:13' },
  { code: '8083', name: 'Metrô Butantã - Cid. Universit.', color: '#4ECDC4', operating_hours: '04:30-01:55' },
  { code: '8084', name: 'Metrô Butantã Circular USP', color: '#45B7D1', operating_hours: '05:00-00:40' },
  { code: '8085', name: 'P3 Circular USP', color: '#96CEB4', operating_hours: '04:00-01:30' },
  { code: '8086', name: 'Jaguaré - Pinheiros', color: '#c4ff6b', operating_hours: '05:00-23:32' },
  { code: '8012', name: 'Metrô Butantã - Cid. Universit.', color: '#FECA57', operating_hours: '24 horas' },
  { code: '8022', name: 'Metrô Butantã - Cid. Universit.', color: '#FF9FF3', operating_hours: '24 horas' },
  { code: '177H', name: 'Metrô Santana - Cid. Universit.', color: '#7579c7', operating_hours: '04:10-00:00' },
  { code: '701U', name: 'Metrô Santana - Cid. Universit.', color: '#914948', operating_hours: '04:20-23:50' },
  { code: '702U', name: 'Cid. Universit. - Term. Parque Dom Pedro II', color: '#BB8FCE', operating_hours: '04:00-23:45' },
  { code: '809U', name: 'Cid. Universit. - Metrô Barra Funda', color: '#c52fe3', operating_hours: '05:00-23:55' },
  { code: '7181', name: 'Cid. Universit. - Term. Princesa Isabel', color: '#a5ae21', operating_hours: '05:55-23:25' },
  { code: '7411', name: 'Cid. Universit. - Praça da Sé', color: '#1db365', operating_hours: '05:30-23:20' },
  { code: '7725', name: 'Rio Pequeno - Term. Lapa', color: '#4c10ce', operating_hours: '05:00-23:40' },
];

const busLines = baseLines.map(line => {
  const shapeIds = routeShapes[line.code] || [];
  const shapes = shapeIds.map(sid => ({ id: sid, points: shapesData[sid] || [] }));
  return Object.assign({}, line, { shapes });
});

export default busLines;
