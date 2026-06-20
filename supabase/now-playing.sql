-- ═══════════════════════════════════════════════════════
--  now_playing — Estado de Spotify "Ahora Suena"
--  Ejecutar en: Supabase → SQL Editor
--
--  Una fila por miembro del gabinete. Cada quien SOLO puede
--  escribir su propia fila (RLS atada al rol vía auth_user_key()).
--  Ambos pueden leer ambas filas. Sincronizado por Realtime.
-- ═══════════════════════════════════════════════════════

-- Helper de rol (idéntico al de migrate-security.sql). Se incluye aquí por si
-- esta es la primera migración que se ejecuta.
create or replace function public.auth_user_key()
returns text
language sql
stable
as $$
  select case (auth.jwt() -> 'user_metadata' ->> 'role')
    when 'president' then 'presidente'
    when 'minister'  then 'ministro'
    else null
  end;
$$;

create table if not exists public.now_playing (
  user_key      text primary key
    check (user_key in ('presidente', 'ministro')),
  user_id       uuid not null references auth.users(id) on delete cascade,
  is_playing    boolean not null default false,
  track_name    text,
  artist_name   text,
  album_name    text,
  album_art_url text,
  track_url     text,
  duration_ms   integer,
  progress_ms   integer,
  updated_at    timestamptz not null default now()
);

-- ── Seguridad ──
alter table public.now_playing enable row level security;

drop policy if exists "Gabinete: leer now_playing" on public.now_playing;
drop policy if exists "Gabinete: publicar now_playing (insert)" on public.now_playing;
drop policy if exists "Gabinete: publicar now_playing (update)" on public.now_playing;

-- Ambos miembros pueden leer ambas filas.
create policy "Gabinete: leer now_playing"
  on public.now_playing for select to authenticated using (true);

-- Cada quien solo puede crear/actualizar SU propia fila (atada a su rol),
-- de modo que nadie pueda falsear la tarjeta del otro.
create policy "Gabinete: publicar now_playing (insert)"
  on public.now_playing for insert to authenticated
  with check (
    auth.uid() = user_id
    and user_key = public.auth_user_key()
  );

create policy "Gabinete: publicar now_playing (update)"
  on public.now_playing for update to authenticated
  using (
    auth.uid() = user_id
    and user_key = public.auth_user_key()
  )
  with check (
    auth.uid() = user_id
    and user_key = public.auth_user_key()
  );

-- ── Realtime ──
alter table public.now_playing replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.now_playing;
exception
  when duplicate_object then null;
end $$;
