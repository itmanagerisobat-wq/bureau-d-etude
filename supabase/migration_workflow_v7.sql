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
