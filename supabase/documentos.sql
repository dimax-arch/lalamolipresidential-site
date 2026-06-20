-- ═══════════════════════════════════════════════════════
--  documentos — Archivos compartidos del Gabinete
--  (Google Sheets, Docs, Drive, enlaces…)
--  Ejecutar en: Supabase → SQL Editor
--
--  Lista compartida: ambos miembros leen todo y pueden
--  agregar/quitar. Solo se guarda el enlace y metadatos;
--  el archivo vive en Google. Sincronizado por Realtime.
-- ═══════════════════════════════════════════════════════

create table if not exists public.documentos (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       text not null,
  url         text not null,
  description text,
  added_by    text not null,   -- 'presidente' | 'ministro'
  author_id   uuid not null references auth.users(id) on delete cascade
);

create index if not exists documentos_created_at_idx
  on public.documentos (created_at desc);

-- ── Seguridad ──
alter table public.documentos enable row level security;

drop policy if exists "Gabinete: leer documentos" on public.documentos;
drop policy if exists "Gabinete: crear documentos" on public.documentos;
drop policy if exists "Gabinete: eliminar documentos" on public.documentos;

create policy "Gabinete: leer documentos"
  on public.documentos for select to authenticated using (true);

create policy "Gabinete: crear documentos"
  on public.documentos for insert to authenticated
  with check (
    auth.uid() = author_id
    and added_by = public.auth_user_key()
  );

-- Lista compartida: cualquiera del gabinete puede quitar un archivo.
create policy "Gabinete: eliminar documentos"
  on public.documentos for delete to authenticated using (true);

-- ── Realtime ──
alter table public.documentos replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.documentos;
exception
  when duplicate_object then null;
end $$;
