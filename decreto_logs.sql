-- ═══════════════════════════════════════════════════════
--  decreto_logs — Historial oficial del Palacio
--  Ejecutar en: Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════

create table if not exists public.decreto_logs (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  -- Qué decreto disparó el evento (puede ser null si fue eliminado)
  decreto_id   uuid references public.decretos(id) on delete set null,

  -- Datos del decreto en el momento del evento (para el historial permanente)
  decreto_title   text not null,
  decreto_type    text not null,
  decreto_priority text not null,

  -- Qué pasó
  event_type   text not null
    check (event_type in ('created', 'approved', 'rejected', 'deleted')),

  -- Quién lo hizo
  actor_key    text not null,   -- 'presidente' | 'ministro'
  actor_id     uuid not null references auth.users(id) on delete cascade
);

create index if not exists decreto_logs_created_at_idx
  on public.decreto_logs (created_at desc);

create index if not exists decreto_logs_decreto_id_idx
  on public.decreto_logs (decreto_id);

-- ── Seguridad ──
alter table public.decreto_logs enable row level security;

drop policy if exists "Gabinete: leer logs" on public.decreto_logs;
drop policy if exists "Gabinete: insertar logs" on public.decreto_logs;

create policy "Gabinete: leer logs"
  on public.decreto_logs for select to authenticated using (true);

create policy "Gabinete: insertar logs"
  on public.decreto_logs for insert to authenticated
  with check (auth.uid() = actor_id);

-- ── Realtime ──
alter table public.decreto_logs replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.decreto_logs;
exception
  when duplicate_object then null;
end $$;
