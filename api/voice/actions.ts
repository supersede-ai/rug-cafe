// Vercel Serverless Function: Log voice assistant user actions to Supabase
// Self-contained to avoid ESM/CJS issues and to keep parity with other API routes.

type Action =
  | 'session_start'
  | 'status' // e.g., ready/timeout/error
  | 'first_response'
  | 'turn'
  | 'tool_result'
  | 'add_to_basket'
  | 'booking_created'
  | 'rating'
  | 'session_end';

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
  const state = (body?.state || '').toString();
  const assistantVersion = (body?.assistant_version || '').toString() || undefined;
  const pagePath = (body?.page_path || '').toString() || undefined;
  const utm_source = (body?.utm_source || '').toString() || undefined;
  const utm_medium = (body?.utm_medium || '').toString() || undefined;
  const utm_campaign = (body?.utm_campaign || '').toString() || undefined;
  const connectionMs = Number.isFinite(Number(body?.connection_ms)) ? Number(body?.connection_ms) : undefined;
  const firstResponseMs = Number.isFinite(Number(body?.first_response_ms)) ? Number(body?.first_response_ms) : undefined;
  const toolName = (body?.name || '').toString() || undefined;
  const toolSuccess = typeof body?.success === 'boolean' ? (body.success as boolean) : undefined;
  const toolLatency = Number.isFinite(Number(body?.latency_ms)) ? Number(body?.latency_ms) : undefined;
  const endReason = (body?.end_reason || '').toString() || undefined;
  const itemQtyDelta = Number.isFinite(Number(body?.item_qty_delta)) ? Number(body?.item_qty_delta) : undefined;

  if (!sessionId) return res.status(400).json({ error: 'missing_session_id' });
  if (!action || !['session_start', 'add_to_basket', 'booking_created', 'rating', 'session_end'].includes(action)) {
    // Allow new analytics actions as well
    const ok = ['status', 'first_response', 'turn', 'tool_result'].includes(action);
    if (!ok) return res.status(400).json({ error: 'invalid_action' });
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
      const { device_type, browser, os } = parseUserAgent(ua);
      const { data: existing, error: selErr, status: selStatus } = await supabase
        .from('voice_sessions')
        .select('session_id')
        .eq('session_id', sessionId)
        .limit(1)
        .maybeSingle();
      if (selErr && selStatus !== 406) {
        return res.status(selStatus || 500).json({ error: 'db_select_failed', details: selErr.message });
      }
      const basePatch: any = {
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
        if (error) return res.status(status || 500).json({ error: 'db_insert_failed', details: error.message });
      } else {
        const { error, status } = await supabase
          .from('voice_sessions')
          .update(basePatch)
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

    if (action === 'status') {
      const patch: any = {};
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
      if (error) return res.status(status || 500).json({ error: 'db_status_failed', details: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'first_response') {
      const patch: any = {};
      if (typeof firstResponseMs === 'number') patch.first_response_ms = firstResponseMs;
      const { error, status } = existing
        ? await supabase.from('voice_sessions').update(patch).eq('session_id', sessionId)
        : await supabase.from('voice_sessions').insert({ session_id: sessionId, ...patch });
      if (error) return res.status(status || 500).json({ error: 'db_first_response_failed', details: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'turn') {
      const next = {
        session_id: sessionId,
        turn_count: Number(existing?.turn_count || 0) + Math.max(1, delta),
      } as any;
      const { error, status } = existing
        ? await supabase.from('voice_sessions').update(next).eq('session_id', sessionId)
        : await supabase.from('voice_sessions').insert(next);
      if (error) return res.status(status || 500).json({ error: 'db_turn_failed', details: error.message });
      return res.status(200).json({ ok: true, turn_count: next.turn_count });
    }

    if (action === 'tool_result') {
      const patch: any = { session_id: sessionId };
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
      if (error) return res.status(status || 500).json({ error: 'db_tool_result_failed', details: error.message });
      return res.status(200).json({ ok: true });
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
        completed: true,
        end_reason: 'rating_done',
        total_duration_s: calcDurationSeconds(existing?.started_at, new Date().toISOString()),
      };
      const { error, status } = existing
        ? await supabase.from('voice_sessions').update(patch).eq('session_id', sessionId)
        : await supabase.from('voice_sessions').insert(patch);
      if (error) return res.status(status || 500).json({ error: 'db_upsert_failed', details: error.message });
      return res.status(200).json({ ok: true });
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

function parseUserAgent(ua: string) {
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

function calcDurationSeconds(startIso?: string, endIso?: string) {
  if (!startIso || !endIso) return null;
  const t0 = Date.parse(startIso);
  const t1 = Date.parse(endIso);
  if (!isFinite(t0) || !isFinite(t1)) return null;
  return Math.max(0, Math.round((t1 - t0) / 1000));
}
