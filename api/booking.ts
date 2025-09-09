// Vercel Serverless Function: Create a booking for The Rug Café
// Production path persists to Supabase via REST. Local dev keeps using server/index.js via Vite proxy.

import { ensureSupabaseConfigured, supaFetch, supabaseHeaders, toHHMM } from './_supabase';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Validate input JSON
  let body: any = {};
  try {
    body = await parseJson(req);
  } catch (err: any) {
    res.status(400).json({ error: 'invalid_json', details: String(err) });
    return;
  }

  const { date, time, partySize, name, email, phone, specialRequests } = body || {};

  const errors: string[] = [];
  if (!date) errors.push('date');
  if (!time) errors.push('time');
  if (!partySize) errors.push('partySize');
  if (!name) errors.push('name');
  if (!email && !phone) errors.push('email_or_phone');
  if (errors.length) {
    res.status(400).json({ error: 'missing_fields', fields: errors });
    return;
  }

  const [hhStr] = String(time).split(':');
  const hh = Number(hhStr);
  if (Number.isFinite(hh) && (hh < 8 || hh >= 18)) {
    res.status(409).json({ error: 'outside_business_hours' });
    return;
  }

  // If Supabase env is missing, indicate not configured (keeps local dev safe)
  try {
    ensureSupabaseConfigured();
  } catch (e: any) {
    res.status(501).json({ error: 'supabase_not_configured', message: e?.message || String(e) });
    return;
  }

  // Normalize and insert
  const id = `rug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const timeDb = toHHMM(String(time)) + ':00';

  try {
    const insRes = await supaFetch('/bookings', {
      method: 'POST',
      headers: supabaseHeaders({ 'Prefer': 'return=representation' }),
      body: JSON.stringify({
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
      }),
      // No searchParams; PostgREST returns the inserted row because of Prefer header
    });

    if (!insRes.ok) {
      let text = '';
      try { text = await insRes.text(); } catch {}
      res.status(insRes.status || 500).json({ error: 'db_insert_failed', details: text || `status ${insRes.status}` });
      return;
    }

    const rows = (await insRes.json()) as any[];
    const row = rows && rows[0];
    if (!row) {
      res.status(500).json({ error: 'db_insert_no_row' });
      return;
    }

    // Shape response to match local dev server record shape
    const out = {
      id: row.id,
      status: row.status || 'confirmed',
      source: row.source || 'voice',
      createdAt: row.created_at || new Date().toISOString(),
      venue: row.venue || 'The Rug Café',
      date: String(row.date),
      time: toHHMM(String(row.time)),
      partySize: Number(row.party_size),
      name: String(row.name),
      email: row.email ?? null,
      phone: row.phone ?? null,
      specialRequests: row.special_requests ?? null,
    };

    res.status(200).json(out);
  } catch (err: any) {
    res.status(500).json({ error: 'db_error', details: String(err) });
  }
}

async function parseJson(req: any) {
  try {
    if (req.body && typeof req.body === 'object') return req.body;
  } catch {}
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c: any) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}
