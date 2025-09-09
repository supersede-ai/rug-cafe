// Vercel Serverless Function: Create a booking for The Rug Café
// Self-contained to avoid ESM/CJS resolution issues in serverless builds.

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

  // Normalize and insert
  const id = `rug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const timeDb = toHHMM(String(time)) + ':00';

  try {
    const supabase = await getServiceClient();
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
    } as const;

    const { data, error, status } = await supabase
      .from('bookings')
      .insert(insertRow)
      .select('*')
      .limit(1)
      .single();

    if (error) {
      res.status(status || 500).json({ error: 'db_insert_failed', details: error.message });
      return;
    }

    // Shape response to match local dev server record shape
    const out = {
      id: data.id,
      status: data.status || 'confirmed',
      source: data.source || 'voice',
      createdAt: data.created_at || new Date().toISOString(),
      venue: data.venue || 'The Rug Café',
      date: String(data.date),
      time: toHHMM(String(data.time)),
      partySize: Number(data.party_size),
      name: String(data.name),
      email: data.email ?? null,
      phone: data.phone ?? null,
      specialRequests: data.special_requests ?? null,
    };

    res.status(200).json(out);
  } catch (err: any) {
    res.status(500).json({ error: 'db_error', details: String(err) });
  }
}

// Local helpers (no cross-file imports)
function toHHMM(time: string | null | undefined) {
  if (!time) return '';
  const m = String(time).match(/^(\d{2}:\d{2})(?::\d{2})?(?:[.+-].*)?$/);
  return m ? m[1] : String(time).slice(0, 5);
}

async function getServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url) throw new Error('SUPABASE_URL missing');
  if (!/^https?:\/\//i.test(url)) throw new Error('SUPABASE_URL must start with http(s)://');
  if (!key) throw new Error('Supabase key missing (SUPABASE_SERVICE_ROLE_KEY)');
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key, { auth: { persistSession: false }, global: { headers: { 'x-application-name': 'rug-cafe' } } });
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
