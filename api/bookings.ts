// Vercel Serverless Function: List bookings (Supabase)
// Production path queries Supabase via REST. Local dev uses server/index.js via Vite proxy.

import { toHHMM } from './_supabase';
import { getServiceClient } from './_supabase_client';

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
    const supabase = await getServiceClient();
    const { data, error, count, status } = await supabase
      .from('bookings')
      .select('*', { count: 'exact' })
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (error) {
      console.error('[api/bookings] Supabase error', status, error);
      res.status(status || 500).json({ error: 'db_list_failed', status, details: error.message });
      return;
    }

    const items = (data || []).map(toOutRow);
    res.status(200).json({ total: count ?? items.length, items });
  } catch (err: any) {
    console.error('[api/bookings] Handler error', err);
    res.status(500).json({ error: 'db_error', details: String(err?.message || err) });
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
