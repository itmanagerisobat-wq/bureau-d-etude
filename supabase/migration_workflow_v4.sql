-- ============================================================
-- Migration V4 — Objectifs journaliers optionnels
-- ============================================================

create table if not exists objectifs_journaliers (
  id uuid primary key default gen_random_uuid(),
  ingenieur text not null references parametres_ingenieurs(nom) on update cascade,
  date date not null default current_date,
  objectif_nv_dossier numeric default 0,
  objectif_modif numeric default 0,
  unique (ingenieur, date)
);

alter table objectifs_journaliers enable row level security;

create policy "objectifs_journaliers_lecture" on objectifs_journaliers for select using (
  exists (select 1 from profiles p where p.id = auth.uid())
);
create policy "objectifs_journaliers_ecriture" on objectifs_journaliers for all using (
  exists (select 1 from profiles p where p.id = auth.uid())
);
