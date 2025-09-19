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

// Configuração CORS mais específica
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// Middleware para logs de debug
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

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
