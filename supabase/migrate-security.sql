-- Palacio Presidencial — migración de seguridad (bases de datos ya existentes)
-- Ejecutar en SQL Editor si ya corriste una versión anterior de sync-tables.sql

-- ─── Helper de rol ───
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

-- ─── Mensajes: columna author_id ───
alter table public.mensajes
  add column if not exists author_id uuid references auth.users (id) on delete cascade;

-- Mensajes antiguos sin autor no se pueden atribuir; eliminar antes de exigir NOT NULL.
delete from public.mensajes where author_id is null;

do $$
begin
  alter table public.mensajes alter column author_id set not null;
exception
  when others then
    raise notice 'author_id ya es NOT NULL o la columna no existe aún';
end $$;

-- ─── Decretos: políticas estrictas ───
drop policy if exists "Gabinete: actualizar decretos" on public.decretos;
drop policy if exists "Gabinete: aprobar decretos" on public.decretos;
drop policy if exists "Gabinete: rechazar decretos" on public.decretos;
drop policy if exists "Gabinete: eliminar decretos" on public.decretos;

drop policy if exists "Gabinete: crear decretos" on public.decretos;
create policy "Gabinete: crear decretos"
  on public.decretos for insert to authenticated
  with check (
    auth.uid() = author_id
    and author_key = public.auth_user_key()
  );

create policy "Gabinete: aprobar decretos"
  on public.decretos for update to authenticated
  using (status = 'pending' and author_id <> auth.uid())
  with check (status = 'approved' and author_id <> auth.uid());

create policy "Gabinete: rechazar decretos"
  on public.decretos for update to authenticated
  using (status = 'pending')
  with check (status = 'rejected');

create policy "Gabinete: eliminar decretos"
  on public.decretos for delete to authenticated
  using (
    (status = 'pending' and author_id = auth.uid())
    or status in ('approved', 'rejected')
  );

-- ─── Mensajes: políticas estrictas ───
drop policy if exists "Gabinete: enviar mensajes" on public.mensajes;
create policy "Gabinete: enviar mensajes"
  on public.mensajes for insert to authenticated
  with check (
    auth.uid() = author_id
    and user_key = public.auth_user_key()
  );
