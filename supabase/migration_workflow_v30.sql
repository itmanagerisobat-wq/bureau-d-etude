-- ============================================================
-- Migration V30 — Annuler un retour interne fait par erreur
--   · Le service Qualité peut annuler un retour interne quand la faute n'est pas confirmée :
--     le retour reste dans l'historique, marqué « annulé » (motif, auteur, date),
--     et n'est plus compté dans les statistiques ; le dossier est validé.
-- À exécuter UNE fois dans Supabase → SQL Editor → Run (après la V29). Additif.
-- ============================================================

alter table dossier_retours add column if not exists annule boolean not null default false;
alter table dossier_retours add column if not exists annule_motif text;
alter table dossier_retours add column if not exists annule_par text;
alter table dossier_retours add column if not exists annule_le timestamptz;
create index if not exists idx_retours_annule on dossier_retours(annule) where annule;

notify pgrst, 'reload schema';
