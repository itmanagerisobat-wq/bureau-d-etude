-- ============================================================
-- Migration V12 — Équipes par client, 3 types de retour,
-- statuts renommables, droits du service Qualité
-- À exécuter UNE fois dans Supabase → SQL Editor → Run (après la V11). Additif.
-- Puis : notify pgrst, 'reload schema';
-- ============================================================

-- ------------------------------------------------------------
-- 1. Équipes par client : les dossiers d'un client qui a une équipe
--    ne vont qu'aux ingénieurs de cette équipe.
-- ------------------------------------------------------------
create table if not exists equipes_clients (
  client text not null,
  ingenieur text not null,
  created_at timestamptz default now(),
  primary key (client, ingenieur)
);

alter table equipes_clients enable row level security;
drop policy if exists "equipes_lecture" on equipes_clients;
create policy "equipes_lecture" on equipes_clients for select using (
  exists (select 1 from profiles p where p.id = auth.uid())
);
drop policy if exists "equipes_ecriture" on equipes_clients;
create policy "equipes_ecriture" on equipes_clients for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'qualite'))
);

-- « Prendre le suivant » tient compte des équipes :
--   1. ses retours puis ses dossiers assignés
--   2. la file des clients dont il fait partie de l'équipe (ses dossiers réservés)
--   3. la file commune de ses fiches habilitées, SANS les clients qui ont une équipe
--      (ces dossiers attendent un ingénieur de l'équipe)
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

-- ------------------------------------------------------------
-- 2. Trois types de retour : interne (pendant la vérification),
--    qualité (erreur découverte chez le client), modif client
-- ------------------------------------------------------------
alter table dossier_retours drop constraint if exists dossier_retours_type_check;
alter table dossier_retours add constraint dossier_retours_type_check
  check (type in ('interne', 'qualite', 'client'));

alter table dossiers drop constraint if exists chk_dernier_retour_type;
alter table dossiers add constraint chk_dernier_retour_type
  check (dernier_retour_type is null or dernier_retour_type in ('interne', 'qualite', 'client'));

-- ------------------------------------------------------------
-- 3. Statuts : nom affiché modifiable (la valeur en base ne change pas)
-- ------------------------------------------------------------
alter table parametres_etats add column if not exists libelle_affiche text;

-- ------------------------------------------------------------
-- 4. Le service Qualité peut régler les paramètres métier
--    (habilitations, équipes, statuts, objectifs, délais)
-- ------------------------------------------------------------
drop policy if exists "habilitations_ecriture" on ingenieur_habilitations;
create policy "habilitations_ecriture" on ingenieur_habilitations for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'qualite'))
);

drop policy if exists "etats_ecriture" on parametres_etats;
create policy "etats_ecriture" on parametres_etats for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'qualite'))
);

drop policy if exists "objectifs_ecriture" on objectifs;
create policy "objectifs_ecriture" on objectifs for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'qualite'))
);

drop policy if exists "config_ecriture" on parametres_config;
create policy "config_ecriture" on parametres_config for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'qualite'))
);
