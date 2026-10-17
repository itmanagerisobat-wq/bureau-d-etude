-- ============================================================
-- Migration V26 — Listes de Paramètres visibles (correctif « Liste vide »)
--
-- Symptôme : Paramètres → Listes (Ingénieurs, Service qualité…) affiche « Liste vide » alors que les dossiers
-- portent bien des noms d'ingénieurs. Cause habituelle : la sécurité « RLS » a été activée sur ces tables
-- (par exemple via l'avertissement de sécurité de Supabase) sans règle de lecture : les données existent
-- mais l'application ne peut plus les lire.
--
-- Ce script ajoute les règles qui manquaient (lecture : tout utilisateur connecté ; écriture : admin et Qualité)
-- sur chaque table de liste. Il ne supprime ni ne modifie aucune donnée. Sans danger à relancer.
-- À exécuter dans Supabase → SQL Editor → Run.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'parametres_ingenieurs', 'parametres_operations', 'parametres_clients', 'parametres_validateurs',
    'parametres_causes_retour', 'parametres_nature_production', 'parametres_etats',
    'ingenieur_habilitations', 'equipes_clients', 'objectifs', 'objectifs_journaliers'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "v26_lecture" on %I', t);
    execute format('create policy "v26_lecture" on %I for select using (exists (select 1 from profiles p where p.id = auth.uid()))', t);
    execute format('drop policy if exists "v26_ecriture" on %I', t);
    execute format(
      'create policy "v26_ecriture" on %I for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in (''admin'', ''qualite''))) with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in (''admin'', ''qualite'')))',
      t
    );
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Vérification (facultatif) : nombre réel de lignes dans chaque liste
select 'Ingénieurs' as liste, count(*) from parametres_ingenieurs
union all select 'Service qualité', count(*) from parametres_validateurs
union all select 'Opérations', count(*) from parametres_operations
union all select 'Clients', count(*) from parametres_clients;
