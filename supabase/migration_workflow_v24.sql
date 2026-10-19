-- ============================================================
-- Migration V24 — Distribution de la file d'attente (auto / manuelle) et liste des ingénieurs à attribuer
--   · parametres_config.file_mode : 'auto' (les ingénieurs prennent dans la file avec « Prendre le suivant »)
--     ou 'manuel' (la Saisie attribue chaque dossier ; « Prendre le suivant » ne prend plus dans la file)
--   · fn_noms_non_assignables : noms à retirer des listes d'attribution (Qualité, Responsables, admin)
-- À exécuter UNE fois dans Supabase → SQL Editor → Run. Additif.
-- ============================================================

alter table parametres_config add column if not exists file_mode text not null default 'auto';
alter table parametres_config drop constraint if exists parametres_config_file_mode_check;
alter table parametres_config add constraint parametres_config_file_mode_check check (file_mode in ('auto', 'manuel'));

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

  -- Distribution manuelle : l'ingénieur ne prend pas lui-même dans la file d'attente
  if v_id is null and coalesce((select file_mode from parametres_config order by id limit 1), 'auto') = 'manuel' then
    return;
  end if;

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

create or replace function fn_noms_non_assignables()
returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct lower(trim(n))), '{}')
  from (
    select nom as n from parametres_validateurs where actif
    union all
    select nom_complet from profiles where role in ('qualite', 'admin') and coalesce(nom_complet, '') <> ''
  ) x
  where exists (select 1 from profiles moi where moi.id = auth.uid());
$$;
grant execute on function fn_noms_non_assignables() to authenticated;

notify pgrst, 'reload schema';
