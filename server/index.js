// Minimal token + booking server for local dev.
// Node 18+ for built-in fetch and ESM support.

import http from 'http';
import { URL, fileURLToPath } from 'url';
import path from 'path';
import { promises as fs } from 'fs';

const PORT = process.env.PORT || 8787;

// Simple CORS helper
function writeCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const sessionConfig = {
  session: {
    type: 'realtime',
    model: process.env.REALTIME_MODEL || 'gpt-realtime',
    audio: { output: { voice: process.env.REALTIME_VOICE || 'marin' } },
  },
};

async function handleToken(_req, res) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'OPENAI_API_KEY missing on server' }));
    return;
  }
  try {
    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sessionConfig),
    });
    const data = await r.json();
    const value = data?.client_secret?.value || data?.value;
    if (!value) {
      res.writeHead(r.status || 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to mint ephemeral token', raw: data }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ value }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Token generation error', details: String(err) }));
  }
}

// --- File-based persistence for local bookings ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');

async function ensureDataFile() {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch {}
  try { await fs.access(BOOKINGS_FILE); }
  catch { await fs.writeFile(BOOKINGS_FILE, '[]', 'utf-8'); }
}

async function loadBookings() {
  await ensureDataFile();
  const raw = await fs.readFile(BOOKINGS_FILE, 'utf-8');
  try { return JSON.parse(raw) || []; } catch { return []; }
}

async function saveBookings(items) {
  await ensureDataFile();
  await fs.writeFile(BOOKINGS_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

const server = http.createServer(async (req, res) => {
  writeCORS(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/api/voice/token') {
      await handleToken(req, res);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ts: Date.now() }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/bookings') {
      try {
        const items = await loadBookings();
        items.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ total: items.length, items }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'failed_to_read_bookings', details: String(err) }));
      }
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/booking') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const { date, time, partySize, name, email, phone, specialRequests } = data || {};

          // Basic validation
          const errors = [];
          if (!date) errors.push('date');
          if (!time) errors.push('time');
          if (!partySize) errors.push('partySize');
          if (!name) errors.push('name');
          if (!email && !phone) errors.push('email_or_phone');
          if (errors.length) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'missing_fields', fields: errors }));
            return;
          }

          // Business hours 08:00–18:00
          const [hhStr] = String(time).split(':');
          const hh = Number(hhStr);
          if (Number.isFinite(hh) && (hh < 8 || hh >= 18)) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'outside_business_hours' }));
            return;
          }

          // Persist booking
          const id = `rug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
          const record = {
            id,
            status: 'confirmed',
            source: 'voice',
            createdAt: new Date().toISOString(),
            venue: 'The Rug Café',
            date,
            time,
            partySize,
            name,
            email: email || null,
            phone: phone || null,
            specialRequests: specialRequests || null,
          };

          const items = await loadBookings();
          items.push(record);
          await saveBookings(items);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(record));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_json', details: String(err) }));
        }
      });
      return;
    }
  } catch {}

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[voice-token-server] listening on :${PORT}`);
});
