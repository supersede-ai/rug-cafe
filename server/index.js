// Minimal token + booking server for local dev.
// Node 18+ for built-in fetch and ESM support.
// Load local .env vars for convenience in dev.
import 'dotenv/config';

import http from 'http';
import { URL, fileURLToPath } from 'url';
import path from 'path';
import { promises as fs } from 'fs';
import { createClient } from '@supabase/supabase-js';

const PORT_ENV = Number(process.env.PORT) || 8787;

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
    if (req.method === 'POST' && url.pathname === '/api/voice/actions') {
      await handleVoiceActions(req, res);
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

async function writePortFile(port) {
  try {
    const portFile = path.join(__dirname, '.port');
    await fs.writeFile(portFile, String(port), 'utf-8');
  } catch {}
}

function listenWithFallback(server, startPort, attempts = 10) {
  return new Promise((resolve, reject) => {
    let port = startPort;
    const tryListen = () => {
      server.once('error', (err) => {
        if ((err && err.code) === 'EADDRINUSE' && attempts > 0) {
          port += 1;
          attempts -= 1;
          setTimeout(() => {
            server.listen(port);
          }, 50);
        } else {
          reject(err);
        }
      });
      server.once('listening', async () => {
        const addr = server.address();
        const actual = typeof addr === 'object' && addr ? addr.port : port;
        await writePortFile(actual);
        console.log(`[voice-token-server] listening on :${actual}`);
        resolve(actual);
      });
      server.listen(port);
    };
    tryListen();
  });
}

listenWithFallback(server, PORT_ENV).catch((err) => {
  console.error('[voice-token-server] failed to start', err);
  process.exit(1);
});

// ---- Voice actions → Supabase logging (local dev path) ----
async function handleVoiceActions(req, res) {
  try {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      try {
        const body = raw ? JSON.parse(raw) : {};
        const action = String(body?.action || '').toLowerCase();
        const sessionId = String(body?.sessionId || body?.session_id || '').trim();
        const delta = Number.isFinite(Number(body?.delta)) ? Number(body?.delta) : 1;
        const rating = Number(body?.rating);
        if (!sessionId) return sendJson(res, 400, { error: 'missing_session_id' });
        if (!['session_start', 'add_to_basket', 'booking_created', 'rating', 'session_end'].includes(action)) {
          return sendJson(res, 400, { error: 'invalid_action' });
        }
        if (action === 'rating' && !(rating >= 1 && rating <= 5)) {
          return sendJson(res, 400, { error: 'invalid_rating', details: 'rating must be 1..5' });
        }

        const supabase = getServiceClient();

        if (action === 'session_start') {
          const now = new Date().toISOString();
          const ua = String(req.headers['user-agent'] || '');
          const { data: existing, error: selErr, status: selStatus } = await supabase
            .from('voice_sessions')
            .select('session_id')
            .eq('session_id', sessionId)
            .limit(1)
            .maybeSingle();
          if (selErr && selStatus !== 406) {
            return sendJson(res, selStatus || 500, { error: 'db_select_failed', details: selErr.message });
          }
          if (!existing) {
            const { error, status } = await supabase
              .from('voice_sessions')
              .insert({ session_id: sessionId, user_agent: ua, started_at: now });
            if (error) return sendJson(res, status || 500, { error: 'db_insert_failed', details: error.message });
          } else {
            const { error, status } = await supabase
              .from('voice_sessions')
              .update({ user_agent: ua, started_at: now })
              .eq('session_id', sessionId);
            if (error) return sendJson(res, status || 500, { error: 'db_update_failed', details: error.message });
          }
          return sendJson(res, 200, { ok: true });
        }

        const { data: existing, error: selErr, status: selStatus } = await supabase
          .from('voice_sessions')
          .select('*')
          .eq('session_id', sessionId)
          .limit(1)
          .maybeSingle();
        if (selErr && selStatus !== 406) {
          return sendJson(res, selStatus || 500, { error: 'db_select_failed', details: selErr.message });
        }
        const base = existing || { session_id: sessionId, basket_add_count: 0, booking_count: 0 };

        if (action === 'add_to_basket') {
          const next = {
            session_id: sessionId,
            basket_add_count: Number(base.basket_add_count || 0) + Math.max(1, delta),
          };
          const { error, status } = existing
            ? await supabase.from('voice_sessions').update(next).eq('session_id', sessionId)
            : await supabase.from('voice_sessions').insert(next);
          if (error) return sendJson(res, status || 500, { error: 'db_upsert_failed', details: error.message });
          return sendJson(res, 200, { ok: true, basket_add_count: next.basket_add_count });
        }

        if (action === 'booking_created') {
          const next = {
            session_id: sessionId,
            booking_count: Number(base.booking_count || 0) + Math.max(1, delta),
          };
          const { error, status } = existing
            ? await supabase.from('voice_sessions').update(next).eq('session_id', sessionId)
            : await supabase.from('voice_sessions').insert(next);
          if (error) return sendJson(res, status || 500, { error: 'db_upsert_failed', details: error.message });
          return sendJson(res, 200, { ok: true, booking_count: next.booking_count });
        }

        if (action === 'rating') {
          const patch = {
            session_id: sessionId,
            rating: rating,
            ended_at: new Date().toISOString(),
          };
          const { error, status } = existing
            ? await supabase.from('voice_sessions').update(patch).eq('session_id', sessionId)
            : await supabase.from('voice_sessions').insert(patch);
          if (error) return sendJson(res, status || 500, { error: 'db_upsert_failed', details: error.message });
          return sendJson(res, 200, { ok: true });
        }

        if (action === 'session_end') {
          const patch = { session_id: sessionId, ended_at: new Date().toISOString() };
          const { error, status } = existing
            ? await supabase.from('voice_sessions').update(patch).eq('session_id', sessionId)
            : await supabase.from('voice_sessions').insert(patch);
          if (error) return sendJson(res, status || 500, { error: 'db_upsert_failed', details: error.message });
          return sendJson(res, 200, { ok: true });
        }

        return sendJson(res, 400, { error: 'unhandled_action' });
      } catch (e) {
        return sendJson(res, 400, { error: 'invalid_json', details: String(e) });
      }
    });
  } catch (err) {
    return sendJson(res, 500, { error: 'server_error', details: String(err) });
  }
}

function getServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url) throw new Error('SUPABASE_URL missing');
  if (!/^https?:\/\//i.test(url)) throw new Error('SUPABASE_URL must start with http(s)://');
  if (!key) throw new Error('Supabase key missing (SUPABASE_SERVICE_ROLE_KEY)');
  return createClient(url, key, { auth: { persistSession: false }, global: { headers: { 'x-application-name': 'rug-cafe-dev' } } });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
