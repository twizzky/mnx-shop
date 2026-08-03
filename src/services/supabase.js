import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Only create a real client once both values have been filled in.
// Until then, `supabase` is null and the app falls back to local
// default data (see services/api.js) so the site still works while
// you finish setting up your Supabase project.
const isConfigured =
  typeof SUPABASE_URL === 'string' &&
  SUPABASE_URL.startsWith('http') &&
  typeof SUPABASE_ANON_KEY === 'string' &&
  SUPABASE_ANON_KEY.length > 20;

export const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export const isSupabaseConfigured = isConfigured;
