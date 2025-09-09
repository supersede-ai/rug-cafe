// Vercel Serverless Function: List bookings (Supabase)
// Production path queries Supabase via REST. Local dev uses server/index.js via Vite proxy.

import { ensureSupabaseConfigured, supaFetch, supabaseHeaders, toHHMM } from './_supabase';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    ensureSupabaseConfigured();
  } catch (e: any) {
    res.status(501).json({ error: 'supabase_not_configured', message: e?.message || String(e) });
    return;
  }

  try {
    // Fetch up to 500 rows, ordered by date then time, with an accurate total count
    const r = await supaFetch('/bookings?select=*&order=date.asc,time.asc', {
      method: 'GET',
      headers: supabaseHeaders({ 'Prefer': 'count=exact', Range: '0-499' }),
    });

    if (!r.ok) {
      let text = '';
      try { text = await r.text(); } catch {}
      res.status(r.status || 500).json({ error: 'db_list_failed', details: text || `status ${r.status}` });
      return;
    }

    const itemsRaw = await r.json();
    const contentRange = r.headers.get('content-range') || '*/0';
    const total = parseContentRangeTotal(contentRange);
    const items = (itemsRaw as any[]).map(toOutRow);
    res.status(200).json({ total, items });
  } catch (err: any) {
    res.status(500).json({ error: 'db_error', details: String(err) });
  }
}

function parseContentRangeTotal(v: string) {
  // Format: '0-123/456' or '*/456'
  const m = String(v).match(/\/(\d+)$/);
  return m ? Number(m[1]) : 0;
}

function toOutRow(row: any) {
  return {
    id: row.id,
    status: row.status || 'confirmed',
    source: row.source || 'voice',
    createdAt: row.created_at,
    venue: row.venue || 'The Rug Café',
    date: String(row.date),
    time: toHHMM(String(row.time)),
    partySize: Number(row.party_size),
    name: String(row.name),
    email: row.email ?? null,
    phone: row.phone ?? null,
    specialRequests: row.special_requests ?? null,
  };
}
