// Vercel Serverless Function: Accepts lightweight analytics events.
// In production, wire this to your analytics store (e.g., Supabase, Segment).

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  try {
    const data = req.body || {};
    // Minimal validation + console logging (stateless in serverless)
    const event = {
      ts: Date.now(),
      ...data,
    };
    console.log('[voice/event]', event);
    res.status(200).json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: 'invalid_json', details: String(err) });
  }
}

