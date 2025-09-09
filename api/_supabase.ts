// Lightweight Supabase REST helper for Vercel serverless functions.
// Avoids adding npm deps; uses fetch against PostgREST with the service role key.
import { serverFetch } from './_fetch';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function ensureSupabaseConfigured() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  // Basic sanity check for URL format to surface clearer errors in prod
  try {
    const u = new URL(SUPABASE_URL);
    if (!/^https?:$/.test(u.protocol)) throw new Error('SUPABASE_URL must start with http(s)://');
  } catch (e: any) {
    throw new Error(`Invalid SUPABASE_URL: ${e?.message || String(e)}`);
  }
}

export function supabaseHeaders(extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...(extra || {}),
  } as Record<string, string>;
}

export async function supaFetch(path: string, init: RequestInit & { searchParams?: Record<string, string> } = {}) {
  // Ensure base ends with /rest/v1/ and that path is relative (no leading slash)
  const base = new URL('/rest/v1/', SUPABASE_URL);
  const rel = String(path).replace(/^\/+/, '');
  const url = new URL(rel, base);
  if ((init as any).searchParams) {
    const sp = (init as any).searchParams as Record<string, string>;
    for (const [k, v] of Object.entries(sp)) url.searchParams.set(k, v);
  }
  // Ensure sensible defaults
  init.headers = {
    Accept: 'application/json',
    ...(init.headers as any),
  } as any;
  const res = await serverFetch(url.toString(), init as any);
  return res;
}

export function toHHMM(time: string | null | undefined) {
  if (!time) return '';
  // normalize variants like 'HH:MM', 'HH:MM:SS', 'HH:MM:SS+TZ'
  const m = String(time).match(/^(\d{2}:\d{2})(?::\d{2})?(?:[.+-].*)?$/);
  return m ? m[1] : String(time).slice(0, 5);
}
