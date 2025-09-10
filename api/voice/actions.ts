// Vercel Serverless Function: Log voice assistant user actions to Supabase
// Self-contained to avoid ESM/CJS issues and to keep parity with other API routes.

type Action = 'session_start' | 'add_to_basket' | 'booking_created' | 'rating' | 'session_end';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Parse JSON body
  let body: any = {};
  try {
    body = await parseJson(req);
  } catch (err: any) {
    return res.status(400).json({ error: 'invalid_json', details: String(err) });
  }

  const action: Action = String(body?.action || '').toLowerCase() as Action;
  const sessionId = String(body?.sessionId || body?.session_id || '').trim();
  const delta = Number.isFinite(Number(body?.delta)) ? Number(body?.delta) : 1;
  const rating = Number(body?.rating);

  if (!sessionId) return res.status(400).json({ error: 'missing_session_id' });
  if (!action || !['session_start', 'add_to_basket', 'booking_created', 'rating', 'session_end'].includes(action)) {
    return res.status(400).json({ error: 'invalid_action' });
  }
  if (action === 'rating' && !(rating >= 1 && rating <= 5)) {
    return res.status(400).json({ error: 'invalid_rating', details: 'rating must be 1..5' });
  }

  try {
    const supabase = await getServiceClient();

    // Ensure a row exists for this session when we first see it
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
        return res.status(selStatus || 500).json({ error: 'db_select_failed', details: selErr.message });
      }
      if (!existing) {
        const { error, status } = await supabase
          .from('voice_sessions')
          .insert({ session_id: sessionId, user_agent: ua, started_at: now });
        if (error) return res.status(status || 500).json({ error: 'db_insert_failed', details: error.message });
      } else {
        const { error, status } = await supabase
          .from('voice_sessions')
          .update({ user_agent: ua, started_at: now })
          .eq('session_id', sessionId);
        if (error) return res.status(status || 500).json({ error: 'db_update_failed', details: error.message });
      }
      return res.status(200).json({ ok: true });
    }

    // Read the current counters (simple and reliable for low volume)
    const { data: existing, error: selErr, status: selStatus } = await supabase
      .from('voice_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .limit(1)
      .maybeSingle();
    if (selErr && selStatus !== 406) {
      return res.status(selStatus || 500).json({ error: 'db_select_failed', details: selErr.message });
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
      if (error) return res.status(status || 500).json({ error: 'db_upsert_failed', details: error.message });
      return res.status(200).json({ ok: true, basket_add_count: next.basket_add_count });
    }

    if (action === 'booking_created') {
      const next = {
        session_id: sessionId,
        booking_count: Number(base.booking_count || 0) + Math.max(1, delta),
      };
      const { error, status } = existing
        ? await supabase.from('voice_sessions').update(next).eq('session_id', sessionId)
        : await supabase.from('voice_sessions').insert(next);
      if (error) return res.status(status || 500).json({ error: 'db_upsert_failed', details: error.message });
      return res.status(200).json({ ok: true, booking_count: next.booking_count });
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
      if (error) return res.status(status || 500).json({ error: 'db_upsert_failed', details: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'session_end') {
      const patch = {
        session_id: sessionId,
        ended_at: new Date().toISOString(),
      };
      const { error, status } = existing
        ? await supabase.from('voice_sessions').update(patch).eq('session_id', sessionId)
        : await supabase.from('voice_sessions').insert(patch);
      if (error) return res.status(status || 500).json({ error: 'db_upsert_failed', details: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'unhandled_action' });
  } catch (err: any) {
    return res.status(500).json({ error: 'server_error', details: String(err?.message || err) });
  }
}

// Local helpers
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
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
