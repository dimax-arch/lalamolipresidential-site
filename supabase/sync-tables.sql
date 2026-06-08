-- Palacio Presidencial — decretos y mensajes compartidos + tiempo real
-- Ejecutar en: SQL Editor (después de crear usuarios en Auth)
-- Si ya ejecutaste una versión anterior, corre también supabase/migrate-security.sql

-- ─── Helpers de rol (evitan suplantación de user_key) ───
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
drop policy if exists "Gabinete: aprobar decretos" on public.decretos;
drop policy if exists "Gabinete: rechazar decretos" on public.decretos;
drop policy if exists "Gabinete: actualizar decretos" on public.decretos;
drop policy if exists "Gabinete: eliminar decretos" on public.decretos;

create policy "Gabinete: leer decretos"
  on public.decretos for select to authenticated using (true);

create policy "Gabinete: crear decretos"
  on public.decretos for insert to authenticated
  with check (
    auth.uid() = author_id
    and author_key = public.auth_user_key()
  );

-- Solo decretos ajenos pendientes → aprobados (no auto-aprobación)
create policy "Gabinete: aprobar decretos"
  on public.decretos for update to authenticated
  using (status = 'pending' and author_id <> auth.uid())
  with check (status = 'approved' and author_id <> auth.uid());

-- Cualquier miembro puede rechazar un decreto pendiente
create policy "Gabinete: rechazar decretos"
  on public.decretos for update to authenticated
  using (status = 'pending')
  with check (status = 'rejected');

-- Eliminar: propios pendientes o cualquier decreto ya resuelto
create policy "Gabinete: eliminar decretos"
  on public.decretos for delete to authenticated
  using (
    (status = 'pending' and author_id = auth.uid())
    or status in ('approved', 'rejected')
  );

-- ─── Mensajes (línea directa) ───
create table if not exists public.mensajes (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  author_id uuid not null references auth.users (id) on delete cascade,
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
  on public.mensajes for insert to authenticated
  with check (
    auth.uid() = author_id
    and user_key = public.auth_user_key()
  );

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
