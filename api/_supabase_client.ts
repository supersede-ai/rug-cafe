import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Prefer server-side env vars; fall back to common names if set.
const DEFAULT_URL = 'https://otnqccmaorrmqykyhvuh.supabase.co';

const urlEnv = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
const keyEnv = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let cachedClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  if (!urlEnv) throw new Error('SUPABASE_URL missing. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.');
  if (!/^https?:\/\//i.test(urlEnv)) throw new Error('SUPABASE_URL must start with http(s)://');
  if (!keyEnv) throw new Error('Supabase key missing. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY.');
  cachedClient = createClient(urlEnv, keyEnv, {
    auth: { persistSession: false },
    global: { headers: { 'x-application-name': 'rug-cafe' } },
  });
  return cachedClient;
}

