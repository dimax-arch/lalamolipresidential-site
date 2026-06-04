-- Palacio Presidencial — decretos y mensajes compartidos + tiempo real
-- Ejecutar en: SQL Editor (después de crear usuarios en Auth)

-- ─── Decretos (agenda oficial) ───
create table if not exists public.decretos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null,
  proposed_date date,
  proposed_time time,
  description text default '',
  priority text not null default 'media',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  author_key text not null,
  author_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists decretos_created_at_idx
  on public.decretos (created_at desc);

alter table public.decretos enable row level security;

drop policy if exists "Gabinete: leer decretos" on public.decretos;
drop policy if exists "Gabinete: crear decretos" on public.decretos;
drop policy if exists "Gabinete: actualizar decretos" on public.decretos;
drop policy if exists "Gabinete: eliminar decretos" on public.decretos;

create policy "Gabinete: leer decretos"
  on public.decretos for select to authenticated using (true);

create policy "Gabinete: crear decretos"
  on public.decretos for insert to authenticated
  with check (auth.uid() = author_id);

create policy "Gabinete: actualizar decretos"
  on public.decretos for update to authenticated using (true);

create policy "Gabinete: eliminar decretos"
  on public.decretos for delete to authenticated using (true);

-- ─── Mensajes (línea directa) ───
create table if not exists public.mensajes (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists mensajes_created_at_idx
  on public.mensajes (created_at asc);

alter table public.mensajes enable row level security;

drop policy if exists "Gabinete: leer mensajes" on public.mensajes;
drop policy if exists "Gabinete: enviar mensajes" on public.mensajes;

create policy "Gabinete: leer mensajes"
  on public.mensajes for select to authenticated using (true);

create policy "Gabinete: enviar mensajes"
  on public.mensajes for insert to authenticated with check (true);

-- ─── Realtime ───
alter table public.decretos replica identity full;
alter table public.mensajes replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.decretos;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.mensajes;
exception
  when duplicate_object then null;
end $$;
