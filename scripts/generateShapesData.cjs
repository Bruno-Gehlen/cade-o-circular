const fs = require('fs');
const path = require('path');

const circPath = path.resolve(__dirname, '../IDsCirculares.txt');
const shapesPath = path.resolve(__dirname, '../IDsShapes.txt');
const outShapes = path.resolve(__dirname, '../src/shapesData.js');
const outRoute = path.resolve(__dirname, '../src/routeShapes.js');

function readFile(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }
const circText = readFile(circPath);
const shapesText = readFile(shapesPath);

// parse circulars -> set of shape ids and route->shape mapping (route prefix)
const routeShapes = {};
const shapeIdsSet = new Set();
if (circText) {
  const rows = circText.split(/\r?\n/).filter(Boolean);
  for (let i = 1; i < rows.length; i++) {
    const line = rows[i].replace(/"/g, '');
    if (!line) continue;
    const parts = line.split(',');
    const route = parts[0];
    const shapeId = parts[5];
    if (!route || !shapeId) continue;
    const prefix = route.split('-')[0];
    if (!routeShapes[prefix]) routeShapes[prefix] = [];
    if (!routeShapes[prefix].includes(shapeId)) routeShapes[prefix].push(shapeId);
    shapeIdsSet.add(shapeId);
  }
}

// If circ file empty, we will still collect any shape ids we find later for common lines

// parse shapes and collect points only for shapeIdsSet (if empty, collect for shape ids that appear for our busLines in presetLines?)
const shapesMap = new Map();
if (shapesText) {
  const rows = shapesText.split(/\r?\n/).filter(Boolean);
  const header = rows[0] ? rows[0].split(',').map(h => h.replace(/"/g, '').trim()) : [];
  const idx = {
    shape_id: header.indexOf('shape_id'),
    lat: header.indexOf('shape_pt_lat'),
    lon: header.indexOf('shape_pt_lon'),
    seq: header.indexOf('shape_pt_sequence')
  };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.startsWith('/*')) continue;
    const parts = row.split(',').map(p => p.replace(/"/g, '').trim());
    const sid = parts[idx.shape_id];
    const lat = parseFloat(parts[idx.lat]);
    const lon = parseFloat(parts[idx.lon]);
    const seq = parseInt(parts[idx.seq]) || 0;
    if (!sid || !isFinite(lat) || !isFinite(lon)) continue;
    // If we have a circ mapping, filter to only those ids; otherwise collect all and later we'll filter by routeShapes
    if (shapeIdsSet.size > 0 && !shapeIdsSet.has(sid)) continue;
    if (!shapesMap.has(sid)) shapesMap.set(sid, []);
    shapesMap.get(sid).push({ seq, lat, lon });
  }
}

// sort and convert
const shapesObj = {};
for (const [sid, pts] of shapesMap.entries()) {
  pts.sort((a,b)=>a.seq-b.seq);
  shapesObj[sid] = pts.map(p => [p.lat, p.lon]);
}

// write shapesData.js
const shapesContent = `// Auto-generated from IDsShapes.txt
// Export: { "shape_id": [[lat, lon], ...], ... }
export default ${JSON.stringify(shapesObj, null, 2)};
`;
fs.writeFileSync(outShapes, shapesContent, 'utf8');
console.log('Wrote', outShapes);

// write routeShapes.js
const routeContent = `// Auto-generated from IDsCirculares.txt
// Export: { "lineCode": ["shapeId", ...], ... }
export default ${JSON.stringify(routeShapes, null, 2)};
`;
fs.writeFileSync(outRoute, routeContent, 'utf8');
console.log('Wrote', outRoute);

