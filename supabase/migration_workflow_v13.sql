-- ============================================================
-- Migration V13 — Import de dossiers incomplets + suppression des données par l'admin
-- À exécuter UNE fois dans Supabase → SQL Editor → Run (après la V12). Additif.
-- Puis : notify pgrst, 'reload schema';
-- ============================================================

-- 1. Un dossier importé peut arriver sans fiche CEE : il reste dans la file (« À compléter »)
--    et n'est distribué qu'une fois la fiche renseignée.
alter table dossiers alter column nom_operation drop not null;

-- « Prendre le suivant » ignore les dossiers sans fiche (y compris pour les équipes)
create or replace function fn_prendre_suivant(p_ingenieur text)
returns setof dossiers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from profiles p where p.id = auth.uid()) then
    raise exception 'non_authentifie';
  end if;

  if exists (select 1 from dossiers where ingenieur = p_ingenieur and etat = 'Encours') then
    raise exception 'deja_en_cours';
  end if;

  select id into v_id
  from dossiers
  where ingenieur = p_ingenieur and etat = 'En attente de traitement'
  order by a_corriger desc, prioritaire desc, coalesce(date_assignation, created_at) asc
  limit 1
  for update skip locked;

  if v_id is null then
    select d.id into v_id
    from dossiers d
    where d.etat = 'Dans la file'
      and d.nom_operation is not null
      and d.client in (select e.client from equipes_clients e where e.ingenieur = p_ingenieur)
    order by d.prioritaire desc, coalesce(d.date_mise_en_file, d.created_at) asc
    limit 1
    for update skip locked;
  end if;

  if v_id is null then
    select d.id into v_id
    from dossiers d
    where d.etat = 'Dans la file'
      and d.nom_operation in (select h.operation from ingenieur_habilitations h where h.ingenieur = p_ingenieur)
      and (d.client is null or d.client not in (select e.client from equipes_clients e))
    order by d.prioritaire desc, coalesce(d.date_mise_en_file, d.created_at) asc
    limit 1
    for update skip locked;
  end if;

  if v_id is null then
    return;
  end if;

  update dossiers
  set etat = 'Encours',
      ingenieur = p_ingenieur,
      date_acceptation = now(),
      date_assignation = coalesce(date_assignation, now())
  where id = v_id;

  insert into dossier_evenements (dossier_id, type, effectue_par, effectue_par_nom)
  values (v_id, 'prise_file', auth.uid(), p_ingenieur);

  return query select * from dossiers where id = v_id;
end;
$$;

grant execute on function fn_prendre_suivant(text) to authenticated;

-- 2. Suppression des dossiers par l'admin (tous, ou datés avant p_avant).
--    Sauvegarde complète juste avant ; historique, retours, commentaires et registre des
--    pièces jointes partent en cascade. Les paramètres sont conservés.
--    (Les fichiers du stockage sont effacés par l'app juste avant l'appel.)
create or replace function fn_supprimer_dossiers(p_avant date default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nom text;
  v_nb int;
begin
  if not exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'reserve_admin';
  end if;
  select nom_complet into v_nom from profiles where id = auth.uid();

  select count(*) into v_nb from dossiers d where p_avant is null or d.date < p_avant;
  if v_nb = 0 then
    return json_build_object('supprimes', 0);
  end if;

  insert into backups (contenu, nb_dossiers, declenche_par)
  select jsonb_agg(to_jsonb(d)), count(*),
         coalesce(v_nom, 'admin') || ' — avant suppression ('
           || case when p_avant is null then 'tous les dossiers' else 'dossiers avant le ' || to_char(p_avant, 'DD/MM/YYYY') end
           || ')'
  from dossiers d
  where p_avant is null or d.date < p_avant;

  delete from dossiers d where p_avant is null or d.date < p_avant;

  return json_build_object('supprimes', v_nb);
end;
$$;

revoke all on function fn_supprimer_dossiers(date) from public;
grant execute on function fn_supprimer_dossiers(date) to authenticated;
