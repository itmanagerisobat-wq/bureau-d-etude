-- ============================================================
-- Migration V11 — Responsable du bénéficiaire + type du dernier retour
-- À exécuter UNE fois dans Supabase → SQL Editor → Run (après la V10). Additif.
-- Puis : notify pgrst, 'reload schema';
-- ============================================================

-- Personne à contacter chez le bénéficiaire
alter table dossiers add column if not exists beneficiaire_responsable text;

-- Type du dernier retour (interne / client), affiché à l'ingénieur et dans Qualité
alter table dossiers add column if not exists dernier_retour_type text;
alter table dossiers drop constraint if exists chk_dernier_retour_type;
alter table dossiers add constraint chk_dernier_retour_type
  check (dernier_retour_type is null or dernier_retour_type in ('interne', 'client'));

-- Remplit le type pour les dossiers actuellement en retour (d'après le dernier retour enregistré)
update dossiers d set dernier_retour_type = r.type
from (
  select distinct on (dossier_id) dossier_id, type
  from dossier_retours
  order by dossier_id, created_at desc
) r
where r.dossier_id = d.id and d.dernier_retour_type is null;
