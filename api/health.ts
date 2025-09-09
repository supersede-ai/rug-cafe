// Health check for serverless env + Supabase configuration
import { getServiceClient } from './_supabase_client';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  try {
    // Minimal query that should succeed; limit rows to 1
    const supabase = await getServiceClient();
    const { data, error, status } = await supabase
      .from('bookings')
      .select('id')
      .limit(1);
    return res.status(error ? (status || 500) : 200).json({ ok: !error, status: status || 200, body: error ? error.message : data });
  } catch (e: any) {
    return res.status(500).json({ ok: false, where: 'query', error: e?.message || String(e) });
  }
}
