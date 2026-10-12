-- ============================================================
-- Migration V9 — File de travail, bénéficiaires, habilitations,
--                retours détaillés, bibliothèque des erreurs
-- À exécuter UNE fois dans Supabase → SQL Editor → Run.
-- Additive : ne supprime aucune donnée existante.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Nouveaux statuts
--    Dans la file        : créé par la Qualité, pas encore d'ingénieur
--    En attente d'info   : bloqué côté bénéficiaire, libère l'ingénieur
--    (les statuts existants sont conservés ; leurs libellés affichés changent
--     dans l'app : « En attente de traitement » = Assigné,
--     « Encours » = En cours, « En attente de vérification » = À contrôler,
--     « Audité » = Validé)
-- ------------------------------------------------------------
insert into parametres_etats (libelle, couleur, ordre) values
  ('Dans la file', '#8A96A3', -1),
  ('En attente d''info', '#D09A2E', 11)
on conflict (libelle) do nothing;

-- L'étape « Prise en charge » disparaît : les dossiers en cours de
-- vérification repassent simplement « À contrôler ».
update dossiers set etat = 'En attente de vérification'
where etat = 'En cours de vérification';

-- ------------------------------------------------------------
-- 2. Dossiers : file, bénéficiaire, priorité
-- ------------------------------------------------------------
alter table dossiers alter column ingenieur drop not null;

alter table dossiers add column if not exists beneficiaire_nom text;
alter table dossiers add column if not exists beneficiaire_siret text;
alter table dossiers add column if not exists beneficiaire_adresse text;
alter table dossiers add column if not exists beneficiaire_email text;
alter table dossiers add column if not exists beneficiaire_telephone text;
-- Regroupement manuel des bénéficiaires (fusion / séparation par l'admin)
alter table dossiers add column if not exists beneficiaire_groupe text;
alter table dossiers add column if not exists beneficiaire_isole boolean not null default false;

alter table dossiers add column if not exists prioritaire boolean not null default false;
alter table dossiers add column if not exists hors_habilitation boolean not null default false;
alter table dossiers add column if not exists a_corriger boolean not null default false;
alter table dossiers add column if not exists motif_statut text;
alter table dossiers add column if not exists date_mise_en_file timestamptz;

alter table dossiers drop constraint if exists chk_siret_format;
alter table dossiers add constraint chk_siret_format
  check (beneficiaire_siret is null or beneficiaire_siret ~ '^[0-9]{14}$');

create index if not exists idx_dossiers_file on dossiers(etat, nom_operation) where etat = 'Dans la file';
create index if not exists idx_dossiers_benef_siret on dossiers(beneficiaire_siret);
create index if not exists idx_dossiers_benef_tel on dossiers(beneficiaire_telephone);

-- ------------------------------------------------------------
-- 3. Nouveaux types d'événements
-- ------------------------------------------------------------
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
  'reprise'
));

-- « Annuler » une action retire aussi l'événement correspondant de l'historique
drop policy if exists "evenements_suppression" on dossier_evenements;
create policy "evenements_suppression" on dossier_evenements for delete using (
  exists (select 1 from profiles p where p.id = auth.uid())
);

-- ------------------------------------------------------------
-- 4. Habilitations ingénieur × fiche CEE
-- ------------------------------------------------------------
create table if not exists ingenieur_habilitations (
  ingenieur text not null references parametres_ingenieurs(nom) on update cascade on delete cascade,
  operation text not null references parametres_operations(libelle) on update cascade on delete cascade,
  primary key (ingenieur, operation)
);
alter table ingenieur_habilitations enable row level security;

drop policy if exists "habilitations_lecture" on ingenieur_habilitations;
create policy "habilitations_lecture" on ingenieur_habilitations for select using (
  exists (select 1 from profiles p where p.id = auth.uid())
);
drop policy if exists "habilitations_ecriture" on ingenieur_habilitations;
create policy "habilitations_ecriture" on ingenieur_habilitations for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Au départ, chaque ingénieur actif est habilité sur toutes les opérations
-- (l'admin décoche ensuite dans Paramètres → Habilitations).
insert into ingenieur_habilitations (ingenieur, operation)
select i.nom, o.libelle
from parametres_ingenieurs i cross join parametres_operations o
where i.actif and o.actif
on conflict do nothing;

-- ------------------------------------------------------------
-- 5. Retours détaillés (un enregistrement par retour)
--    + bibliothèque des erreurs
-- ------------------------------------------------------------
create table if not exists dossier_retours (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references dossiers(id) on delete cascade,
  type text not null check (type in ('interne', 'client')),
  cause text not null,
  commentaire text,
  ingenieur text,
  operation text,
  effectue_par_nom text,
  bibliotheque boolean not null default false,
  explication text,
  created_at timestamptz default now()
);
create index if not exists idx_retours_dossier on dossier_retours(dossier_id);
create index if not exists idx_retours_operation on dossier_retours(operation);

alter table dossier_retours enable row level security;
drop policy if exists "retours_lecture" on dossier_retours;
create policy "retours_lecture" on dossier_retours for select using (
  exists (select 1 from profiles p where p.id = auth.uid())
);
drop policy if exists "retours_ecriture" on dossier_retours;
create policy "retours_ecriture" on dossier_retours for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'qualite'))
);

-- Reprise de l'historique : un retour par indicateur existant
insert into dossier_retours (dossier_id, type, cause, ingenieur, operation, created_at)
select d.id, 'interne', coalesce(d.cause_retour_interne, 'Non précisée'), d.ingenieur, d.nom_operation,
       coalesce(d.date_verification, d.created_at)
from dossiers d
where d.retour_interne
  and not exists (select 1 from dossier_retours r where r.dossier_id = d.id and r.type = 'interne');

insert into dossier_retours (dossier_id, type, cause, ingenieur, operation, created_at)
select d.id, 'client', coalesce(d.cause_retour_client, 'Non précisée'), d.ingenieur, d.nom_operation,
       coalesce(d.date_retour_client::timestamptz, d.created_at)
from dossiers d
where d.retour_client
  and not exists (select 1 from dossier_retours r where r.dossier_id = d.id and r.type = 'client');

-- ------------------------------------------------------------
-- 6. « Prendre le suivant » — attribution atomique
--    (deux ingénieurs qui cliquent en même temps n'obtiennent jamais
--     le même dossier). Ordre : ses retours → ses dossiers assignés →
--     file commune de ses fiches (prioritaires puis plus anciens).
-- ------------------------------------------------------------
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

  -- 1 et 2 : retours à corriger puis dossiers assignés à cet ingénieur
  select id into v_id
  from dossiers
  where ingenieur = p_ingenieur and etat = 'En attente de traitement'
  order by a_corriger desc, prioritaire desc, coalesce(date_assignation, created_at) asc
  limit 1
  for update skip locked;

  -- 3 : file commune, uniquement sur ses fiches habilitées
  if v_id is null then
    select d.id into v_id
    from dossiers d
    where d.etat = 'Dans la file'
      and d.nom_operation in (select h.operation from ingenieur_habilitations h where h.ingenieur = p_ingenieur)
    order by d.prioritaire desc, coalesce(d.date_mise_en_file, d.created_at) asc
    limit 1
    for update skip locked;
  end if;

  if v_id is null then
    return; -- file vide
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
