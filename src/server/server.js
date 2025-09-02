import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBusPositions, getBusRoute } from './api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.get('/api/lines/:lineCode/positions', async (req, res) => {
  const { lineCode } = req.params;
  try {
    const positions = await getBusPositions(lineCode);
    res.json(positions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/lines/:lineCode/route', async (req, res) => {
  const { lineCode } = req.params;
  try {
    const route = await getBusRoute(lineCode);
    res.json(route);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Catch-all to serve index.html for any other request
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
