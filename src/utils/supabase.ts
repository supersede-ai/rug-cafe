import { createClient } from '@supabase/supabase-js';

// Client-side Supabase for the Vite app (uses anon key)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseKey);
export default supabase;

