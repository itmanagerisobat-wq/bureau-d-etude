-- ============================================================
-- Migration V23 — Validation par l'ingénieur après un retour
--   · dossiers.valide_par_ingenieur : le dossier a été corrigé et validé par l'ingénieur lui-même
--   · parametres_config.validation_ingenieur_apres_retour : réglage admin (activé par défaut)
-- À exécuter UNE fois dans Supabase → SQL Editor → Run. Additif.
-- ============================================================
alter table dossiers add column if not exists valide_par_ingenieur boolean not null default false;
alter table parametres_config add column if not exists validation_ingenieur_apres_retour boolean not null default true;
notify pgrst, 'reload schema';
