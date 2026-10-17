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
-- 5. Vue file d'attente mise à jour (basée sur soumission, pas assignation)
-- ------------------------------------------------------------
-- On DROP avant de recréer : "create or replace view" refuse de changer
-- l'ensemble/l'ordre des colonnes (ce que fait ce script en ajoutant
-- date_soumission à la table juste avant), donc CREATE OR REPLACE plante.
drop view if exists v_file_verification;

create view v_file_verification as
select *,
  extract(epoch from (now() - date_soumission)) / 3600 as heures_en_attente
from dossiers
where etat = 'En attente de vérification'
order by date_soumission asc;
