// Minimal server-side fetch wrapper for Vercel Node functions.
// Uses global fetch if available (Node >=18). Falls back to https request otherwise.

import http from 'node:http';
import https from 'node:https';

type HeadersLike = Record<string, string | string[] | undefined>;

class SimpleHeaders {
  private map: Record<string, string> = {};
  constructor(src?: HeadersLike) {
    if (src) {
      for (const [k, v] of Object.entries(src)) {
        if (typeof v === 'string') this.map[k.toLowerCase()] = v;
        else if (Array.isArray(v)) this.map[k.toLowerCase()] = v.join(', ');
        else if (typeof v !== 'undefined') this.map[k.toLowerCase()] = String(v);
      }
    }
  }
  get(name: string) {
    return this.map[name.toLowerCase()] ?? null;
  }
}

export async function serverFetch(input: string | URL, init: any = {}) {
  if (typeof (globalThis as any).fetch === 'function') {
    return (globalThis as any).fetch(input as any, init);
  }

  const url = typeof input === 'string' ? new URL(input) : input;
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;

  const method = (init?.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {};
  if (init?.headers) {
    for (const [k, v] of Object.entries(init.headers as Record<string, any>)) {
      headers[k] = Array.isArray(v) ? v.join(', ') : String(v);
    }
  }
  const body = init?.body ? (typeof init.body === 'string' || Buffer.isBuffer(init.body) ? init.body : Buffer.from(String(init.body))) : undefined;

  const options: https.RequestOptions = {
    method,
    headers,
  };

  return new Promise<any>((resolve, reject) => {
    const req = client.request(url, options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');
        const status = res.statusCode || 0;
        const headersObj = new SimpleHeaders(res.headers as HeadersLike);
        resolve({
          ok: status >= 200 && status < 300,
          status,
          headers: headersObj,
          text: async () => text,
          json: async () => JSON.parse(text || 'null'),
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

