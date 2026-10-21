-- ============================================================
-- Migration V32 — Historique complet et mise à jour en direct
--   · Types d'événements : la liste autorisée datait de la V9. Les événements « mis en pause »,
--     « corrigé et validé par l'ingénieur », « pas de modif à faire » et « retour annulé »
--     étaient refusés par la base et n'apparaissaient pas dans l'historique. Ils sont maintenant acceptés.
--   · Mise à jour en direct (Realtime) de la table dossiers : la page Qualité, la Saisie,
--     le tableau de bord et la pastille du menu se mettent à jour sans actualiser la page.
-- À exécuter UNE fois dans Supabase → SQL Editor → Run (après la V31). Additif.
-- ============================================================

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
  'changement_statut_manuel',
  'mise_en_file',
  'prise_file',
  'attente_info',
  'reprise',
  'validation_ingenieur',
  'mise_en_pause',
  'pas_de_modif',
  'retour_annule'
));

-- Index pour compter les vérifications par jour (chaque audit compte, même si le dossier revient)
create index if not exists idx_evenements_type_date on dossier_evenements(type, created_at);

-- Realtime sur la table dossiers
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dossiers') then
    execute 'alter publication supabase_realtime add table public.dossiers';
  end if;
end $$;

notify pgrst, 'reload schema';
