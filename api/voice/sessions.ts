// Voice sessions export/list endpoint
// GET /api/voice/sessions?days=14&format=csv|json

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const qp = req.query || {};
    const days = Math.max(1, Math.min(365, Number(qp.days || qp.d || 30)));
    const format = String(qp.format || '').toLowerCase() || 'json';
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const supabase = await getServiceClient();
    const columns = [
      'created_at','session_id','assistant_version','page_path','device_type','browser','os',
      'turn_count','connection_ms','first_response_ms','total_duration_s',
      'tool_success_count','tool_error_count','last_tool_latency_ms',
      'basket_add_count','basket_item_qty','booking_count','rating','completed','end_reason'
    ].join(',');
    const { data, error, status } = await supabase
      .from('voice_sessions')
      .select(columns)
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .order('created_at', { ascending: true });

    if (error) return res.status(status || 500).json({ error: 'db_list_failed', details: error.message });
    const rows = data || [];

    if (format === 'csv') {
      const header = ['created_at','session_id','assistant_version','page_path','device_type','browser','os','turn_count','connection_ms','first_response_ms','total_duration_s','tool_success_count','tool_error_count','last_tool_latency_ms','basket_add_count','basket_item_qty','booking_count','rating','completed','end_reason'];
      const csv = [header.join(',')]
        .concat(rows.map((r: any) => header.map((k) => csvEscape(r?.[k])).join(',')))
        .join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="voice_sessions_${from.toISOString().slice(0,10)}_${days}d.csv"`);
      return res.status(200).send(csv);
    }

    return res.status(200).json({ from: from.toISOString(), to: to.toISOString(), count: rows.length, items: rows });
  } catch (e: any) {
    return res.status(500).json({ error: 'sessions_error', details: String(e?.message || e) });
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

function csvEscape(v: any) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

