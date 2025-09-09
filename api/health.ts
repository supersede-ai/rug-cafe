// Health check for serverless env + Supabase configuration
import { ensureSupabaseConfigured, supaFetch, supabaseHeaders } from './_supabase';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  try {
    ensureSupabaseConfigured();
  } catch (e: any) {
    return res.status(500).json({ ok: false, where: 'config', error: e?.message || String(e) });
  }

  try {
    // Minimal query that should succeed; limit rows to 1
    const r = await supaFetch('/bookings', {
      method: 'GET',
      headers: supabaseHeaders({ 'Prefer': 'count=exact' }),
      searchParams: { select: 'id', limit: '1' as any },
    });
    const text = await r.text();
    return res.status(r.ok ? 200 : r.status).json({ ok: r.ok, status: r.status, contentRange: r.headers.get('content-range') || null, body: safeJson(text) });
  } catch (e: any) {
    return res.status(500).json({ ok: false, where: 'query', error: e?.message || String(e) });
  }
}

function safeJson(text: string) {
  try { return JSON.parse(text); } catch { return text; }
}

