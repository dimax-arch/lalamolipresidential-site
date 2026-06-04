-- Palacio Presidencial — usuarios y roles en Supabase Auth
-- Ejecutar en: SQL Editor del dashboard de Supabase

-- Perfiles vinculados a auth.users (opcional, para consultas y políticas)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('president', 'minister')),
  display_name text not null,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Usuarios leen su propio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Usuarios leen perfiles del gabinete"
  on public.profiles for select
  using (auth.role() = 'authenticated');

-- Sincronizar perfil al registrarse (si usas sign-up más adelante)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'minister'),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
