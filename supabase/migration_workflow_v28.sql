-- ============================================================
-- Migration V28 — Dossier réassigné, statut « Pas de modif à faire », échanges
--   · Nouveau statut « Pas de modif à faire » : après un retour (souvent un retour client),
--     l'ingénieur constate que la modification est déjà faite et l'explique
--   · « Prendre le suivant » trouve aussi les dossiers réassignés (ingénieur de modif)
--     et ne tient plus compte des majuscules dans les noms
--   · L'ingénieur peut supprimer ses livrables tant que le dossier n'est pas pris en contrôle
--     (aussi quand il est « À faire », en pause ou en attente d'info)
-- Les échanges Saisie/Qualité ↔ ingénieur utilisent la table existante dossier_commentaires.
-- À exécuter UNE fois dans Supabase → SQL Editor → Run (après la V27). Additif.
-- ============================================================

-- 1. Statut « Pas de modif à faire »
insert into parametres_etats (libelle, couleur, ordre)
values ('Pas de modif à faire', '#0E8A7A', 65)
on conflict (libelle) do nothing;

-- 2. « Prendre le suivant » : dossiers réassignés + noms sans tenir compte des majuscules
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
      date_assignation = coalesce(date_assignation, now())
  where id = v_id;

  insert into dossier_evenements (dossier_id, type, effectue_par, effectue_par_nom)
  values (v_id, 'prise_file', auth.uid(), p_ingenieur);

  return query select * from dossiers where id = v_id;
end;
$$;
grant execute on function fn_prendre_suivant(text) to authenticated;

-- 3. Suppression de ses livrables par l'ingénieur (remplace la règle de la V27)
drop policy if exists "fichiers_registre_suppression_ingenieur" on dossier_fichiers;
create policy "fichiers_registre_suppression_ingenieur" on dossier_fichiers for delete using (
  categorie = 'livrable'
  and exists (
    select 1
    from profiles p
    join dossiers d on d.id = dossier_fichiers.dossier_id
    where p.id = auth.uid()
      and p.role = 'ingenieur'
      and lower(p.ingenieur_ref) in (lower(d.ingenieur), lower(coalesce(d.ingenieur_modif, '')))
      and (
        d.etat in ('Encours', 'En attente de traitement', 'En attente d''info', 'en pause')
        or (d.etat = 'En attente de vérification' and d.pris_en_charge_par is null)
      )
  )
);

notify pgrst, 'reload schema';
