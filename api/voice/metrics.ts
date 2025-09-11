// Voice analytics metrics (serverless)
// Aggregates voice_sessions into totals and daily trends.

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const days = Math.max(1, Math.min(90, Number((req.query?.days || req.query?.d || 14)) || 14));
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const supabase = await getServiceClient();
    const { data, error, status } = await supabase
      .from('voice_sessions')
      .select(
        [
          'created_at',
          'basket_add_count', 'basket_item_qty', 'booking_count', 'rating',
          'connection_ms', 'first_response_ms', 'total_duration_s',
          'tool_success_count', 'tool_error_count', 'last_tool_latency_ms',
          'device_type', 'browser', 'os', 'page_path', 'assistant_version', 'end_reason'
        ].join(', ')
      )
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .order('created_at', { ascending: true });

    if (error) return res.status(status || 500).json({ error: 'db_list_failed', details: error.message });

    type VoiceRow = {
      created_at: string;
      basket_add_count?: number;
      basket_item_qty?: number;
      booking_count?: number;
      rating?: number;
      connection_ms?: number;
      first_response_ms?: number;
      total_duration_s?: number;
      tool_success_count?: number;
      tool_error_count?: number;
      last_tool_latency_ms?: number;
      device_type?: string;
      browser?: string;
      os?: string;
      page_path?: string;
      assistant_version?: string;
      end_reason?: string;
    };
    const rows: VoiceRow[] = (data as any[]) || [];
    const sessions = rows.length;
    const sum = (arr: any[], k: string) => arr.reduce((a, r) => a + (Number(r?.[k]) || 0), 0);
    const collect = (k: string) => rows.map((r: any) => Number(r?.[k])).filter((v) => Number.isFinite(v) && v > 0);
    const median = (vals: number[]) => {
      if (!vals.length) return 0;
      const v = vals.slice().sort((a, b) => a - b);
      const mid = Math.floor(v.length / 2);
      return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
    };

    const basketSessions = rows.filter((r) => (Number(r?.basket_add_count) || 0) > 0).length;
    const bookingSessions = rows.filter((r) => (Number(r?.booking_count) || 0) > 0).length;
    const basketAdds = sum(rows, 'basket_add_count');
    const basketItems = sum(rows, 'basket_item_qty');
    const bookings = sum(rows, 'booking_count');
    const ratings = collect('rating');
    const avgRating = ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)) : null;
    const medConn = median(collect('connection_ms')) || 0;
    const medFirst = median(collect('first_response_ms')) || 0;
    const medTotal = median(collect('total_duration_s')) || 0;
    const toolSucc = sum(rows, 'tool_success_count');
    const toolErr = sum(rows, 'tool_error_count');
    const errorRate = toolSucc + toolErr > 0 ? Number((toolErr / (toolSucc + toolErr)).toFixed(3)) : 0;

    // Daily breakdown
    const keyOf = (d: Date) => d.toISOString().slice(0, 10);
    const dailyMap = new Map<string, any>();
    for (const r of rows) {
      const k = keyOf(new Date(r.created_at));
      const entry = dailyMap.get(k) || { day: k, sessions: 0, basket_sessions: 0, booking_sessions: 0, basket_adds: 0, basket_items: 0, bookings: 0, ratings: [] as number[] };
      entry.sessions += 1;
      entry.basket_sessions += (Number(r.basket_add_count) || 0) > 0 ? 1 : 0;
      entry.booking_sessions += (Number(r.booking_count) || 0) > 0 ? 1 : 0;
      entry.basket_adds += Number(r.basket_add_count) || 0;
      entry.basket_items += Number(r.basket_item_qty) || 0;
      entry.bookings += Number(r.booking_count) || 0;
      const rate = Number(r.rating) || 0; if (rate > 0) entry.ratings.push(rate);
      dailyMap.set(k, entry);
    }
    const daily = Array.from(dailyMap.values()).sort((a, b) => a.day.localeCompare(b.day)).map((e) => ({ ...e, avg_rating: e.ratings.length ? Number((e.ratings.reduce((a: number, b: number) => a + b, 0) / e.ratings.length).toFixed(2)) : null }));

    // Device/browser breakdown
    const groupCount = (k: 'device_type' | 'browser' | 'os') => {
      const map = new Map<string, number>();
      for (const r of rows) {
        const v = String(r?.[k] || 'unknown');
        map.set(v, (map.get(v) || 0) + 1);
      }
      return Array.from(map.entries()).map(([name, count]) => ({ [k]: name, sessions: count }));
    };

    const out = {
      range: { from: from.toISOString(), to: to.toISOString(), days },
      totals: {
        sessions,
        sessions_with_basket: basketSessions,
        sessions_with_booking: bookingSessions,
        basket_adds: basketAdds,
        basket_items: basketItems,
        bookings,
        avg_rating: avgRating,
        median_connection_ms: medConn,
        median_first_response_ms: medFirst,
        median_total_duration_s: medTotal,
        error_rate: errorRate,
      },
      daily,
      by_device: groupCount('device_type'),
      by_browser: groupCount('browser'),
    };

    return res.status(200).json(out);
  } catch (e: any) {
    return res.status(500).json({ error: 'metrics_error', details: String(e?.message || e) });
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
