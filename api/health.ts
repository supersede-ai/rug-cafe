// Health check for serverless env + Supabase configuration

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

async function getServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url) throw new Error('SUPABASE_URL missing');
  if (!/^https?:\/\//i.test(url)) throw new Error('SUPABASE_URL must start with http(s)://');
  if (!key) throw new Error('Supabase key missing (SUPABASE_SERVICE_ROLE_KEY)');
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key, { auth: { persistSession: false }, global: { headers: { 'x-application-name': 'rug-cafe' } } });
}
