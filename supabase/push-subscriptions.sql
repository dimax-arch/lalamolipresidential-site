-- Palacio Presidencial — suscripciones Web Push
-- Ejecutar en SQL Editor después de sync-tables.sql

create table if not exists public.push_subscriptions (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  user_key   text not null check (user_key in ('presidente', 'ministro')),
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_key_idx
  on public.push_subscriptions (user_key);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Usuario: leer su suscripción push" on public.push_subscriptions;
drop policy if exists "Usuario: guardar su suscripción push" on public.push_subscriptions;
drop policy if exists "Usuario: eliminar su suscripción push" on public.push_subscriptions;

create policy "Usuario: leer su suscripción push"
  on public.push_subscriptions for select to authenticated
  using (auth.uid() = user_id);

create policy "Usuario: guardar su suscripción push"
  on public.push_subscriptions for insert to authenticated
  with check (
    auth.uid() = user_id
    and user_key = public.auth_user_key()
  );

create policy "Usuario: actualizar su suscripción push"
  on public.push_subscriptions for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and user_key = public.auth_user_key()
  );

create policy "Usuario: eliminar su suscripción push"
  on public.push_subscriptions for delete to authenticated
  using (auth.uid() = user_id);
