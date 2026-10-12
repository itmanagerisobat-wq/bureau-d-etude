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
