import { createClient } from '@supabase/supabase-js';

let client = null;
let configError = null;

export function getSupabaseClient() {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key || url.includes('TU_PROYECTO')) {
    configError =
      'Falta configurar Supabase. Copia .env.example → .env y añade VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.';
    return null;
  }

  client = createClient(url, key);
  return client;
}

export function getConfigError() {
  return configError;
}
