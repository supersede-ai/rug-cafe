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
    if (req.method === 'GET' && url.pathname === '/api/voice/metrics') {
      await handleVoiceMetrics(req, res);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/voice/sessions') {
      await handleVoiceSessions(req, res);
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
            return sendJson(res, 400, { error: 'missing_fields', fields: errors });
          }

          // Business hours 08:00–18:00
          const [hhStr] = String(time).split(':');
          const hh = Number(hhStr);
          if (Number.isFinite(hh) && (hh < 8 || hh >= 18)) {
            return sendJson(res, 409, { error: 'outside_business_hours' });
          }

          // Normalize
          const id = `rug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
          const timeDb = String(time).match(/^(\d{2}:\d{2})(?::\d{2})?$/)
            ? (String(time).length === 5 ? `${time}:00` : String(time))
            : `${String(time).slice(0,5)}:00`;

          // If Supabase env exists, persist to bookings table; otherwise fallback to file
          let persisted = null;
          try {
            const supabase = getServiceClient();
            const insertRow = {
              id,
              status: 'confirmed',
              source: 'voice',
              venue: 'The Rug Café',
              date: String(date),
              time: timeDb,
              party_size: Number(partySize),
              name: String(name),
              email: email || null,
              phone: phone || null,
              special_requests: specialRequests || null,
            };
            const { data: row, error, status } = await supabase
              .from('bookings')
              .insert(insertRow)
              .select('*')
              .limit(1)
              .single();
            if (error) throw Object.assign(new Error(error.message), { status });
            persisted = {
              id: row.id,
              status: row.status || 'confirmed',
              source: row.source || 'voice',
              createdAt: row.created_at || new Date().toISOString(),
              venue: row.venue || 'The Rug Café',
              date: String(row.date),
              time: String(row.time).slice(0,5),
              partySize: Number(row.party_size),
              name: String(row.name),
              email: row.email ?? null,
              phone: row.phone ?? null,
              specialRequests: row.special_requests ?? null,
            };
          } catch (dbErr) {
            // Fallback to local file storage when Supabase not configured
            const record = {
              id,
              status: 'confirmed',
              source: 'voice',
              createdAt: new Date().toISOString(),
              venue: 'The Rug Café',
              date: String(date),
              time: String(timeDb).slice(0,5),
              partySize: Number(partySize),
              name: String(name),
              email: email || null,
              phone: phone || null,
              specialRequests: specialRequests || null,
            };
            try {
              const items = await loadBookings();
              items.push(record);
              await saveBookings(items);
            } catch {}
            persisted = record;
          }

          return sendJson(res, 200, persisted);
        } catch (err) {
          return sendJson(res, 400, { error: 'invalid_json', details: String(err) });
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
        const state = (body?.state || '').toString();
        const assistantVersion = (body?.assistant_version || '').toString() || undefined;
        const pagePath = (body?.page_path || '').toString() || undefined;
        const utm_source = (body?.utm_source || '').toString() || undefined;
        const utm_medium = (body?.utm_medium || '').toString() || undefined;
        const utm_campaign = (body?.utm_campaign || '').toString() || undefined;
        const connectionMs = Number.isFinite(Number(body?.connection_ms)) ? Number(body?.connection_ms) : undefined;
        const firstResponseMs = Number.isFinite(Number(body?.first_response_ms)) ? Number(body?.first_response_ms) : undefined;
        const toolName = (body?.name || '').toString() || undefined;
        const toolSuccess = typeof body?.success === 'boolean' ? (body.success === true) : undefined;
        const toolLatency = Number.isFinite(Number(body?.latency_ms)) ? Number(body?.latency_ms) : undefined;
        const endReason = (body?.end_reason || '').toString() || undefined;
        const itemQtyDelta = Number.isFinite(Number(body?.item_qty_delta)) ? Number(body?.item_qty_delta) : undefined;
        if (!sessionId) return sendJson(res, 400, { error: 'missing_session_id' });
        if (!['session_start', 'status', 'first_response', 'turn', 'tool_result', 'add_to_basket', 'booking_created', 'rating', 'session_end'].includes(action)) {
          return sendJson(res, 400, { error: 'invalid_action' });
        }
        if (action === 'rating' && !(rating >= 1 && rating <= 5)) {
          return sendJson(res, 400, { error: 'invalid_rating', details: 'rating must be 1..5' });
        }

        const supabase = getServiceClient();

        if (action === 'session_start') {
          const now = new Date().toISOString();
          const ua = String(req.headers['user-agent'] || '');
          const { device_type, browser, os } = parseUserAgent(ua);
          const { data: existing, error: selErr, status: selStatus } = await supabase
            .from('voice_sessions')
            .select('session_id')
            .eq('session_id', sessionId)
            .limit(1)
            .maybeSingle();
          if (selErr && selStatus !== 406) {
            return sendJson(res, selStatus || 500, { error: 'db_select_failed', details: selErr.message });
          }
          const basePatch = {
            user_agent: ua,
            started_at: now,
            assistant_version: assistantVersion || null,
            page_path: pagePath || null,
            utm_source: utm_source || null,
            utm_medium: utm_medium || null,
            utm_campaign: utm_campaign || null,
            device_type,
            browser,
            os,
          };
          if (!existing) {
            const { error, status } = await supabase
              .from('voice_sessions')
              .insert({ session_id: sessionId, ...basePatch });
            if (error) return sendJson(res, status || 500, { error: 'db_insert_failed', details: error.message });
          } else {
            const { error, status } = await supabase
              .from('voice_sessions')
              .update(basePatch)
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

        if (action === 'status') {
          const patch = {};
          if (typeof connectionMs === 'number') patch.connection_ms = connectionMs;
          if (state === 'timeout' || state === 'error') {
            patch.ended_at = new Date().toISOString();
            patch.end_reason = state;
            patch.completed = false;
            patch.total_duration_s = calcDurationSeconds(existing?.started_at, patch.ended_at);
          }
          const { error, status } = existing
            ? await supabase.from('voice_sessions').update(patch).eq('session_id', sessionId)
            : await supabase.from('voice_sessions').insert({ session_id: sessionId, ...patch });
          if (error) return sendJson(res, status || 500, { error: 'db_status_failed', details: error.message });
          return sendJson(res, 200, { ok: true });
        }

        if (action === 'first_response') {
          const patch = {};
          if (typeof firstResponseMs === 'number') patch.first_response_ms = firstResponseMs;
          const { error, status } = existing
            ? await supabase.from('voice_sessions').update(patch).eq('session_id', sessionId)
            : await supabase.from('voice_sessions').insert({ session_id: sessionId, ...patch });
          if (error) return sendJson(res, status || 500, { error: 'db_first_response_failed', details: error.message });
          return sendJson(res, 200, { ok: true });
        }

        if (action === 'turn') {
          const next = {
            session_id: sessionId,
            turn_count: Number(existing?.turn_count || 0) + Math.max(1, delta),
          };
          const { error, status } = existing
            ? await supabase.from('voice_sessions').update(next).eq('session_id', sessionId)
            : await supabase.from('voice_sessions').insert(next);
          if (error) return sendJson(res, status || 500, { error: 'db_turn_failed', details: error.message });
          return sendJson(res, 200, { ok: true, turn_count: next.turn_count });
        }

        if (action === 'tool_result') {
          const patch = { session_id: sessionId };
          if (toolSuccess === true) patch.tool_success_count = Number(existing?.tool_success_count || 0) + 1;
          else if (toolSuccess === false) patch.tool_error_count = Number(existing?.tool_error_count || 0) + 1;
          if (typeof toolLatency === 'number') patch.last_tool_latency_ms = toolLatency;
          // Opportunistic counters based on tool name
          if (toolSuccess === true && toolName === 'add_to_basket') {
            const qty = Math.max(0, itemQtyDelta ?? delta ?? 1);
            patch.basket_add_count = Number(existing?.basket_add_count || 0) + Math.max(1, Number(delta || 1));
            patch.basket_item_qty = Number(existing?.basket_item_qty || 0) + qty;
          } else if (toolSuccess === true && toolName === 'book_table') {
            patch.booking_count = Number(existing?.booking_count || 0) + 1;
          }
          const { error, status } = existing
            ? await supabase.from('voice_sessions').update(patch).eq('session_id', sessionId)
            : await supabase.from('voice_sessions').insert(patch);
          if (error) return sendJson(res, status || 500, { error: 'db_tool_result_failed', details: error.message });
          return sendJson(res, 200, { ok: true });
        }

        if (action === 'add_to_basket') {
          const next = {
            session_id: sessionId,
            basket_add_count: Number(base.basket_add_count || 0) + Math.max(1, delta),
            basket_item_qty: Number(base.basket_item_qty || 0) + Math.max(0, itemQtyDelta ?? delta),
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
            completed: true,
            end_reason: 'rating_done',
            total_duration_s: calcDurationSeconds(existing?.started_at, new Date().toISOString()),
          };
          const { error, status } = existing
            ? await supabase.from('voice_sessions').update(patch).eq('session_id', sessionId)
            : await supabase.from('voice_sessions').insert(patch);
          if (error) return sendJson(res, status || 500, { error: 'db_upsert_failed', details: error.message });
          return sendJson(res, 200, { ok: true });
        }

        if (action === 'session_end') {
          const nowIso = new Date().toISOString();
          const newEndReason = existing?.end_reason === 'rating_done' ? 'rating_done' : (endReason || 'user_stop');
          const patch = {
            session_id: sessionId,
            ended_at: nowIso,
            end_reason: newEndReason,
            completed: existing?.completed || newEndReason === 'rating_done' || newEndReason === 'user_stop',
            total_duration_s: calcDurationSeconds(existing?.started_at, nowIso),
          };
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

function parseUserAgent(ua) {
  const s = (ua || '').toLowerCase();
  let device_type = 'desktop';
  if (/mobile|iphone|android/.test(s)) device_type = 'mobile';
  else if (/ipad|tablet/.test(s)) device_type = 'tablet';

  let browser = 'unknown';
  if (/edg\//.test(s)) browser = 'edge';
  else if (/chrome\//.test(s)) browser = 'chrome';
  else if (/safari\//.test(s) && !/chrome\//.test(s)) browser = 'safari';
  else if (/firefox\//.test(s)) browser = 'firefox';

  let os = 'unknown';
  if (/windows nt/.test(s)) os = 'windows';
  else if (/mac os x/.test(s)) os = 'macos';
  else if (/android/.test(s)) os = 'android';
  else if (/iphone|ipad|ios/.test(s)) os = 'ios';
  else if (/linux/.test(s)) os = 'linux';
  return { device_type, browser, os };
}

function calcDurationSeconds(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const t0 = Date.parse(startIso);
  const t1 = Date.parse(endIso);
  if (!isFinite(t0) || !isFinite(t1)) return null;
  return Math.max(0, Math.round((t1 - t0) / 1000));
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// ---- Voice metrics (local dev) ----
async function handleVoiceMetrics(req, res) {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const daysParam = url.searchParams.get('days') || url.searchParams.get('d');
    const days = Math.max(1, Math.min(90, Number(daysParam || 14)));
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const supabase = getServiceClient();
    const { data, error, status } = await supabase
      .from('voice_sessions')
      .select('created_at,basket_add_count,basket_item_qty,booking_count,rating,connection_ms,first_response_ms,total_duration_s,tool_success_count,tool_error_count,last_tool_latency_ms,device_type,browser,os,page_path,assistant_version,end_reason')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .order('created_at', { ascending: true });
    if (error) return sendJson(res, status || 500, { error: 'db_list_failed', details: error.message });
    const rows = data || [];
    const sessions = rows.length;
    const sum = (arr, k) => arr.reduce((a, r) => a + (Number(r?.[k]) || 0), 0);
    const collect = (k) => rows.map((r) => Number(r?.[k])).filter((v) => Number.isFinite(v) && v > 0);
    const median = (vals) => {
      if (!vals.length) return 0;
      const v = vals.slice().sort((a, b) => a - b);
      const mid = Math.floor(v.length / 2);
      return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
    };
    const basketSessions = rows.filter((r) => (Number(r?.basket_add_count) || 0) > 0).length;
    const bookingSessions = rows.filter((r) => (Number(r?.booking_count) || 0) > 0).length;
    const basketAdds = sum(rows, 'basket_add_count');
    const basketItems = sum(rows, 'basket_item_qty');
    const bookings = sum(rows, 'booking_count');
    const ratings = collect('rating');
    const avgRating = ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)) : null;
    const medConn = median(collect('connection_ms')) || 0;
    const medFirst = median(collect('first_response_ms')) || 0;
    const medTotal = median(collect('total_duration_s')) || 0;
    const toolSucc = sum(rows, 'tool_success_count');
    const toolErr = sum(rows, 'tool_error_count');
    const errorRate = toolSucc + toolErr > 0 ? Number((toolErr / (toolSucc + toolErr)).toFixed(3)) : 0;
    const keyOf = (d) => d.toISOString().slice(0, 10);
    const dailyMap = new Map();
    for (const r of rows) {
      const k = keyOf(new Date(r.created_at));
      const entry = dailyMap.get(k) || { day: k, sessions: 0, basket_sessions: 0, booking_sessions: 0, basket_adds: 0, basket_items: 0, bookings: 0, ratings: [] };
      entry.sessions += 1;
      entry.basket_sessions += (Number(r.basket_add_count) || 0) > 0 ? 1 : 0;
      entry.booking_sessions += (Number(r.booking_count) || 0) > 0 ? 1 : 0;
      entry.basket_adds += Number(r.basket_add_count) || 0;
      entry.basket_items += Number(r.basket_item_qty) || 0;
      entry.bookings += Number(r.booking_count) || 0;
      const rate = Number(r.rating) || 0; if (rate > 0) entry.ratings.push(rate);
      dailyMap.set(k, entry);
    }
    const daily = Array.from(dailyMap.values()).sort((a, b) => a.day.localeCompare(b.day)).map((e) => ({ ...e, avg_rating: e.ratings.length ? Number((e.ratings.reduce((a, b) => a + b, 0) / e.ratings.length).toFixed(2)) : null }));
    const groupCount = (k) => {
      const map = new Map();
      for (const r of rows) {
        const v = String(r?.[k] || 'unknown');
        map.set(v, (map.get(v) || 0) + 1);
      }
      return Array.from(map.entries()).map(([name, count]) => ({ [k]: name, sessions: count }));
    };
    return sendJson(res, 200, {
      range: { from: from.toISOString(), to: to.toISOString(), days },
      totals: {
        sessions,
        sessions_with_basket: basketSessions,
        sessions_with_booking: bookingSessions,
        basket_adds: basketAdds,
        basket_items: basketItems,
        bookings,
        avg_rating: avgRating,
        median_connection_ms: medConn,
        median_first_response_ms: medFirst,
        median_total_duration_s: medTotal,
        error_rate: errorRate,
      },
      daily,
      by_device: groupCount('device_type'),
      by_browser: groupCount('browser'),
    });
  } catch (e) {
    return sendJson(res, 500, { error: 'metrics_error', details: String(e) });
  }
}

async function handleVoiceSessions(req, res) {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const daysParam = url.searchParams.get('days') || url.searchParams.get('d');
    const format = (url.searchParams.get('format') || 'json').toLowerCase();
    const days = Math.max(1, Math.min(365, Number(daysParam || 30)));
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const supabase = getServiceClient();
    const columns = 'created_at,session_id,assistant_version,page_path,device_type,browser,os,turn_count,connection_ms,first_response_ms,total_duration_s,tool_success_count,tool_error_count,last_tool_latency_ms,basket_add_count,basket_item_qty,booking_count,rating,completed,end_reason';
    const { data, error, status } = await supabase
      .from('voice_sessions')
      .select(columns)
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .order('created_at', { ascending: true });
    if (error) return sendJson(res, status || 500, { error: 'db_list_failed', details: error.message });
    const rows = data || [];
    if (format === 'csv') {
      const header = ['created_at','session_id','assistant_version','page_path','device_type','browser','os','turn_count','connection_ms','first_response_ms','total_duration_s','tool_success_count','tool_error_count','last_tool_latency_ms','basket_add_count','basket_item_qty','booking_count','rating','completed','end_reason'];
      const csv = [header.join(',')]
        .concat(rows.map((r) => header.map((k) => csvEscape(r?.[k])).join(',')))
        .join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="voice_sessions_${from.toISOString().slice(0,10)}_${days}d.csv"`);
      res.writeHead(200);
      res.end(csv);
      return;
    }
    return sendJson(res, 200, { from: from.toISOString(), to: to.toISOString(), count: rows.length, items: rows });
  } catch (e) {
    return sendJson(res, 500, { error: 'sessions_error', details: String(e) });
  }
}
