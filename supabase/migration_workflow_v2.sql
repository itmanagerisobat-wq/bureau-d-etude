-- ============================================================
-- Migration V2 — Cycle de vie en 3 étapes du dossier
-- (Saisie/Dispatching → Vérification qualité → Retours post-audit)
-- À exécuter UNE FOIS sur un projet qui a déjà le schema.sql initial.
-- Sans danger : n'écrase aucune donnée existante.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Nouvelles colonnes de suivi temporel + récurrence sur dossiers
-- ------------------------------------------------------------
alter table dossiers add column if not exists date_assignation timestamptz default now();
alter table dossiers add column if not exists date_verification timestamptz;
alter table dossiers add column if not exists nb_retours int not null default 0;

-- Un dossier qui revient 2 fois ou plus (toute cause confondue) est "récurrent"
-- → signal qu'il y a probablement un problème de fond (cadrage initial, client difficile...)
alter table dossiers add column if not exists recurrent boolean
  generated always as (nb_retours >= 2) stored;

create index if not exists idx_dossiers_date_verification on dossiers(date_verification);

-- ------------------------------------------------------------
-- 2. Historique des événements par dossier (frise chronologique)
-- ------------------------------------------------------------
create table if not exists dossier_evenements (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references dossiers(id) on delete cascade,
  type text not null check (type in (
    'assignation',
    'verification_ok',
    'retour_interne_avant_audit',
    'retour_interne_apres_audit',
    'retour_client',
    'reassignation'
  )),
  cause text,
  effectue_par uuid references profiles(id),
  effectue_par_nom text,
  created_at timestamptz default now()
);

create index if not exists idx_evenements_dossier on dossier_evenements(dossier_id);

alter table dossier_evenements enable row level security;

create policy "evenements_lecture" on dossier_evenements for select using (
  exists (select 1 from profiles p where p.id = auth.uid())
);
create policy "evenements_insertion" on dossier_evenements for insert with check (
  exists (select 1 from profiles p where p.id = auth.uid())
);

-- ------------------------------------------------------------
-- 3. Configuration : seuil d'alerte SLA pour la 1ère vérification
-- ------------------------------------------------------------
create table if not exists parametres_config (
  id uuid primary key default gen_random_uuid(),
  seuil_verification_heures numeric not null default 1
);

insert into parametres_config (seuil_verification_heures)
select 1
where not exists (select 1 from parametres_config);

alter table parametres_config enable row level security;

create policy "config_lecture" on parametres_config for select using (
  exists (select 1 from profiles p where p.id = auth.uid())
);
create policy "config_ecriture" on parametres_config for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ------------------------------------------------------------
-- 4. Vue : dossiers en attente de 1ère vérification (file d'attente)
-- ------------------------------------------------------------
create or replace view v_file_verification as
select *,
  extract(epoch from (now() - date_assignation)) / 3600 as heures_en_attente
from dossiers
where date_verification is null
  and etat = 'Encours'
order by date_assignation asc;

-- ------------------------------------------------------------
-- 5. Vue : dossiers audités pouvant recevoir un retour post-audit
-- ------------------------------------------------------------
create or replace view v_dossiers_audites as
select *
from dossiers
where etat = 'Audité'
order by date_verification desc;
