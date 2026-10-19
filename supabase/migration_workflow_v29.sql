-- ============================================================
-- Migration V29 — Le temps de traitement s'arrête pendant une pause
--   · dossiers.temps_traitement_s : secondes déjà passées par l'ingénieur sur le dossier,
--     figées à chaque pause, attente d'info ou envoi au contrôle ; le chrono reprend à la reprise
--   · « Prendre le suivant » repart de zéro pour une nouvelle prise en charge
-- À exécuter UNE fois dans Supabase → SQL Editor → Run (après la V28). Additif.
-- ============================================================

alter table dossiers add column if not exists temps_traitement_s integer not null default 0;

create or replace function fn_prendre_suivant(p_ingenieur text)
returns setof dossiers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_moi text := lower(trim(p_ingenieur));
begin
  if not exists (select 1 from profiles p where p.id = auth.uid()) then
    raise exception 'non_authentifie';
  end if;

  -- Le dossier appartient à celui qui doit le traiter : l'ingénieur de modif s'il y en a un, sinon l'ingénieur
  if exists (
    select 1 from dossiers
    where lower(trim(coalesce(nullif(ingenieur_modif, ''), ingenieur))) = v_moi and etat = 'Encours'
  ) then
    raise exception 'deja_en_cours';
  end if;

  select id into v_id
  from dossiers
  where lower(trim(coalesce(nullif(ingenieur_modif, ''), ingenieur))) = v_moi
    and etat = 'En attente de traitement'
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
      and d.client in (select e.client from equipes_clients e where lower(e.ingenieur) = v_moi)
    order by d.prioritaire desc, coalesce(d.date_mise_en_file, d.created_at) asc
    limit 1
    for update skip locked;
  end if;

  if v_id is null then
    select d.id into v_id
    from dossiers d
    where d.etat = 'Dans la file'
      and d.nom_operation in (select h.operation from ingenieur_habilitations h where lower(h.ingenieur) = v_moi)
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
      ingenieur = coalesce(ingenieur, p_ingenieur),
      date_acceptation = now(),
      temps_traitement_s = 0,
      date_assignation = coalesce(date_assignation, now())
  where id = v_id;

  insert into dossier_evenements (dossier_id, type, effectue_par, effectue_par_nom)
  values (v_id, 'prise_file', auth.uid(), p_ingenieur);

  return query select * from dossiers where id = v_id;
end;
$$;

grant execute on function fn_prendre_suivant(text) to authenticated;

notify pgrst, 'reload schema';
