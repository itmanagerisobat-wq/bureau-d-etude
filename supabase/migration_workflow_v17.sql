-- ============================================================
-- Migration V17 — Rapport qualité : grille de lecture paramétrable
-- À exécuter UNE fois dans Supabase → SQL Editor → Run. Additif.
-- Puis : notify pgrst, 'reload schema';
-- ============================================================

alter table parametres_config add column if not exists grille_excellent numeric not null default 10;
alter table parametres_config add column if not exists grille_bon numeric not null default 30;
alter table parametres_config add column if not exists grille_surveiller numeric not null default 50;
-- En dessous de ce nombre de dossiers, un ingénieur n'entre pas dans le « taux moyen simple »
alter table parametres_config add column if not exists seuil_min_dossiers int not null default 5;
-- En-tête du rapport (modifiable)
alter table parametres_config add column if not exists rapport_redige_par text not null default 'Contrôle Qualité — Hill Solution';
alter table parametres_config add column if not exists rapport_diffusion text not null default 'Direction';
