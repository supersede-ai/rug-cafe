// Minimal token server to mint ephemeral keys for the Realtime API.
// No dependencies; uses Node 18+ fetch and http modules.
// Do NOT expose your standard OpenAI API key to the browser.

import http from 'http';
import { URL } from 'url';

const PORT = process.env.PORT || 8787;

// Simple CORS helper
function writeCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const sessionConfig = {
  session: {
    type: 'realtime',
    model: process.env.REALTIME_MODEL || 'gpt-realtime',
    audio: { output: { voice: process.env.REALTIME_VOICE || 'marin' } },
  },
};

async function handleToken(_req, res) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'OPENAI_API_KEY missing on server' }));
    return;
  }
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
    // Normalize to { value }
    const value = data?.client_secret?.value || data?.value;
    if (!value) {
      res.writeHead(r.status || 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to mint ephemeral token', raw: data }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ value }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Token generation error', details: String(err) }));
  }
}

const server = http.createServer(async (req, res) => {
  writeCORS(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/api/voice/token') {
      await handleToken(req, res);
      return;
    }
  } catch {}

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[voice-token-server] listening on :${PORT}`);
});
