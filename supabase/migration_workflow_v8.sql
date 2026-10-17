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
