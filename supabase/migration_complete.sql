-- ============================================================
-- Hill Solution — MIGRATION COMPLÈTE (v2 à v8 fusionnées)
-- À exécuter UNE SEULE FOIS, en entier, après le schema.sql initial.
-- Sans danger : toutes les commandes sont idempotentes
-- (IF NOT EXISTS / DROP puis CREATE), rejouables sans casser de données.
-- ============================================================


-- ============================================================
-- Origine : migration_workflow_v2.sql
-- ============================================================
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

drop policy if exists "evenements_lecture" on dossier_evenements;
create policy "evenements_lecture" on dossier_evenements for select using (
  exists (select 1 from profiles p where p.id = auth.uid())
);
drop policy if exists "evenements_insertion" on dossier_evenements;
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

drop policy if exists "config_lecture" on parametres_config;
create policy "config_lecture" on parametres_config for select using (
  exists (select 1 from profiles p where p.id = auth.uid())
);
drop policy if exists "config_ecriture" on parametres_config;
create policy "config_ecriture" on parametres_config for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- (Vues v_file_verification / v_dossiers_audites déplacées à la fin de ce
-- fichier, pour être créées une seule fois après toutes les colonnes ajoutées)


-- ============================================================
-- Origine : migration_workflow_v3.sql
-- ============================================================
-- ============================================================
-- Migration V3 — Cycle enrichi (soumission + prise en charge) + PIN ingénieurs
-- À exécuter APRÈS migration_workflow_v2.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Nouveaux horodatages + prise en charge sur dossiers
-- ------------------------------------------------------------
alter table dossiers add column if not exists date_soumission timestamptz;
alter table dossiers add column if not exists pris_en_charge_par text;
alter table dossiers add column if not exists date_prise_en_charge timestamptz;

-- ------------------------------------------------------------
-- 2. PIN personnel par ingénieur (accès à "Mes dossiers")
-- ------------------------------------------------------------
alter table parametres_ingenieurs add column if not exists pin text;

-- ------------------------------------------------------------
-- 3. Nouveaux états du cycle (si pas déjà présents)
-- ------------------------------------------------------------
insert into parametres_etats (libelle, couleur, ordre) values
  ('En attente de vérification', '#D4A017', 25),
  ('En cours de vérification', '#1B2A4A', 26)
on conflict (libelle) do nothing;

-- ------------------------------------------------------------
-- 4. Nouveaux types d'événements (élargit la contrainte check)
-- ------------------------------------------------------------
alter table dossier_evenements drop constraint if exists dossier_evenements_type_check;
alter table dossier_evenements add constraint dossier_evenements_type_check check (type in (
  'assignation',
  'soumission_verification',
  'prise_en_charge',
  'verification_ok',
  'retour_interne_avant_audit',
  'retour_interne_apres_audit',
  'retour_client',
  'reassignation'
));

-- ------------------------------------------------------------
-- 5. Vue file d'attente : sera (re)créée une seule fois, à la toute fin
--    de ce fichier, une fois toutes les colonnes de toutes les migrations
--    en place (évite tout conflit de colonnes sur les CREATE OR REPLACE VIEW)
-- ------------------------------------------------------------


-- ============================================================
-- Origine : migration_workflow_v4.sql
-- ============================================================
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

drop policy if exists "objectifs_journaliers_lecture" on objectifs_journaliers;
create policy "objectifs_journaliers_lecture" on objectifs_journaliers for select using (
  exists (select 1 from profiles p where p.id = auth.uid())
);
drop policy if exists "objectifs_journaliers_ecriture" on objectifs_journaliers;
create policy "objectifs_journaliers_ecriture" on objectifs_journaliers for all using (
  exists (select 1 from profiles p where p.id = auth.uid())
);


-- ============================================================
-- Origine : migration_workflow_v5.sql
-- ============================================================
-- ============================================================
-- Migration V5 — L'ingénieur accepte le dossier avant qu'il passe "En cours"
-- ============================================================

alter table dossiers add column if not exists date_acceptation timestamptz;

insert into parametres_etats (libelle, couleur, ordre) values
  ('En attente de traitement', '#9AA0A6', 0)
on conflict (libelle) do nothing;

alter table dossier_evenements drop constraint if exists dossier_evenements_type_check;
alter table dossier_evenements add constraint dossier_evenements_type_check check (type in (
  'assignation',
  'acceptation',
  'soumission_verification',
  'prise_en_charge',
  'verification_ok',
  'retour_interne_avant_audit',
  'retour_interne_apres_audit',
  'retour_client',
  'reassignation'
));


-- ============================================================
-- Origine : migration_workflow_v6.sql
-- ============================================================
-- ============================================================
-- Migration V6 — PIN pour Admin/Qualité (table validateurs)
-- ============================================================

alter table parametres_validateurs add column if not exists pin text;


-- ============================================================
-- Origine : migration_workflow_v7.sql
-- ============================================================
-- ============================================================
-- Migration V7 — Objectif journalier PAR OPÉRATION (équipe entière,
-- plus par ingénieur) + statut manuel à tout moment
-- ============================================================

-- ------------------------------------------------------------
-- 1. Restructurer objectifs_journaliers : ingénieur → opération
-- ------------------------------------------------------------
alter table objectifs_journaliers drop constraint if exists objectifs_journaliers_ingenieur_date_key;
alter table objectifs_journaliers drop column if exists ingenieur;
alter table objectifs_journaliers add column if not exists operation text
  references parametres_operations(libelle) on update cascade;
alter table objectifs_journaliers drop constraint if exists objectifs_journaliers_operation_date_key;
alter table objectifs_journaliers add constraint objectifs_journaliers_operation_date_key
  unique (operation, date);

-- ------------------------------------------------------------
-- 2. Nouveau type d'événement : changement de statut manuel
-- ------------------------------------------------------------
alter table dossier_evenements drop constraint if exists dossier_evenements_type_check;
alter table dossier_evenements add constraint dossier_evenements_type_check check (type in (
  'assignation',
  'acceptation',
  'soumission_verification',
  'prise_en_charge',
  'verification_ok',
  'retour_interne_avant_audit',
  'retour_interne_apres_audit',
  'retour_client',
  'reassignation',
  'changement_statut_manuel'
));


-- ============================================================
-- Origine : migration_workflow_v8.sql
-- ============================================================
-- ============================================================
-- Migration V8 — Alerte urgence + échéance de traitement + export nocturne
-- ============================================================

-- ------------------------------------------------------------
-- 1. Nouveaux réglages dans la config
-- ------------------------------------------------------------
alter table parametres_config add column if not exists seuil_urgence_heures numeric default 24;
alter table parametres_config add column if not exists delai_max_traitement_heures numeric default 24;

-- ------------------------------------------------------------
-- 2. Sauvegarde/export automatique NOCTURNE (en plus de l'hebdo existante)
-- ------------------------------------------------------------
create or replace function fn_backup_nocturne()
returns void as $$
begin
  insert into backups (contenu, nb_dossiers, declenche_par)
  select jsonb_agg(to_jsonb(d)), count(*), 'auto-nocturne'
  from dossiers d;
end;
$$ language plpgsql security definer;

-- Dans Supabase > Database > Cron Jobs, planifier (chaque nuit à 2h) :
-- select cron.schedule('backup_nocturne', '0 2 * * *', 'select fn_backup_nocturne();');


-- ============================================================
-- VUES FINALES — créées une seule fois ici, après que toutes les colonnes
-- de toutes les migrations ci-dessus soient en place. Évite tout conflit
-- de type "cannot change name of view column" lié à l'ordre d'exécution.
-- ============================================================
drop view if exists v_file_verification;
create view v_file_verification as
select *,
  extract(epoch from (now() - date_soumission)) / 3600 as heures_en_attente
from dossiers
where etat = 'En attente de vérification'
order by date_soumission asc;

drop view if exists v_dossiers_audites;
create view v_dossiers_audites as
select *
from dossiers
where etat = 'Audité'
order by date_verification desc;
