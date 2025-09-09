// Vercel Serverless Function: Mint an ephemeral token for the OpenAI Realtime API.
// Never expose your standard OPENAI_API_KEY to the browser.

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    res.status(500).json({ error: 'OPENAI_API_KEY missing on server' });
    return;
  }

  const sessionConfig = {
    session: {
      type: 'realtime',
      model: process.env.REALTIME_MODEL || 'gpt-4o-realtime-preview',
      audio: { output: { voice: process.env.REALTIME_VOICE || 'marin' } },
    },
  };

  try {
    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'realtime=v1',
      },
      body: JSON.stringify(sessionConfig),
    });

    let rawText = '';
    try { rawText = await r.text(); } catch {}
    let data: any = null;
    try { data = rawText ? JSON.parse(rawText) : null; } catch { data = rawText || null; }

    if (!r.ok) {
      console.error('[voice/token] OpenAI error', r.status, data);
      res.status(r.status || 500).json({ error: 'Failed to mint ephemeral token', status: r.status, raw: data });
      return;
    }

    const value = data?.client_secret?.value || data?.value;
    if (!value) {
      console.error('[voice/token] OpenAI no client_secret in response', data);
      res.status(502).json({ error: 'Invalid response from OpenAI', raw: data });
      return;
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(200).json({ value });
  } catch (err: any) {
    console.error('[voice/token] Function error', err);
    res.status(500).json({ error: 'Token generation error', details: String(err) });
  }
}
