// Lightweight Supabase REST helper for Vercel serverless functions.
// Avoids adding npm deps; uses fetch against PostgREST with the service role key.

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function ensureSupabaseConfigured() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
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
  const base = `${SUPABASE_URL}/rest/v1`;
  const url = new URL(path.startsWith('/') ? path : `/${path}`, base);
  if ((init as any).searchParams) {
    const sp = (init as any).searchParams as Record<string, string>;
    for (const [k, v] of Object.entries(sp)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), init);
  return res;
}

export function toHHMM(time: string | null | undefined) {
  if (!time) return '';
  // normalize variants like 'HH:MM', 'HH:MM:SS', 'HH:MM:SS+TZ'
  const m = String(time).match(/^(\d{2}:\d{2})(?::\d{2})?(?:[.+-].*)?$/);
  return m ? m[1] : String(time).slice(0, 5);
}

