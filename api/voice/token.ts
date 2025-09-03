// Vercel Serverless Function: Mint an ephemeral token for the OpenAI Realtime API.
// Never expose your standard OPENAI_API_KEY to the browser.

// Ensure we run on Node runtime with global fetch available
export const config = { runtime: 'nodejs20.x' } as const;

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
      model: process.env.REALTIME_MODEL || 'gpt-realtime',
      audio: { output: { voice: process.env.REALTIME_VOICE || 'marin' } },
    },
  };

  try {
    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sessionConfig),
    });

    const data = await r.json();
    const value = data?.client_secret?.value || data?.value;
    if (!value) {
      console.error('[voice/token] OpenAI error', r.status, data);
      res.status(r.status || 500).json({ error: 'Failed to mint ephemeral token', raw: data });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ value });
  } catch (err: any) {
    console.error('[voice/token] Function error', err);
    res.status(500).json({ error: 'Token generation error', details: String(err) });
  }
}
