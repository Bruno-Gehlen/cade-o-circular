import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cors from 'cors';
import { getBusPositions, getBusRoute, getAuthStatus } from './api.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, '../../dist')));

// API routes
app.get('/api/status', (req, res) => {
  res.json(getAuthStatus());
});

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
  res.sendFile(path.join(__dirname, '../../dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
