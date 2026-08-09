-- ═══════════════════════════════════════════════════════
--  genshin.sql — Caché servidor para la card de Genshin
--
--  La Edge Function `genshin-notes` guarda aquí las
--  respuestas de HoYoLAB y Enka para no golpear sus APIs
--  en cada recarga. El cliente NUNCA toca esta tabla:
--  RLS está activo y no hay políticas, así que solo la
--  service role (que las bypassa) puede leer/escribir.
--
--  Ejecutar en Supabase → SQL Editor (una sola vez).
-- ═══════════════════════════════════════════════════════

create table if not exists public.genshin_cache (
  cache_key   text primary key,          -- p. ej. 'notes_presidente', 'enka_ministro'
  payload     jsonb not null,            -- respuesta ya mapeada (o error tipado)
  fetched_at  timestamptz not null default now(),
  ttl_seconds integer not null default 300
);

alter table public.genshin_cache enable row level security;

-- Sin políticas a propósito: deny-all para anon/authenticated.
