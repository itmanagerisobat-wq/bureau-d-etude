-- ============================================================
-- Hill Solution — Suivi Qualité Bureau d'Études
-- Schéma Supabase (PostgreSQL)
-- ============================================================

-- Extension utile pour les UUID
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. Profils utilisateurs + rôles
-- ------------------------------------------------------------
create type user_role as enum ('admin', 'ingenieur', 'qualite');

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nom_complet text not null,
  role user_role not null default 'ingenieur',
  ingenieur_ref text, -- lie le compte au nom "Ingénieur" utilisé dans les dossiers (pour les ingénieurs)
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 2. Paramètres (listes déroulantes éditables par l'Admin)
-- ------------------------------------------------------------
create table if not exists parametres_causes_retour (
  id uuid primary key default gen_random_uuid(),
  libelle text not null unique,
  type text not null check (type in ('interne', 'client', 'generique')),
  actif boolean default true
);

create table if not exists parametres_etats (
  id uuid primary key default gen_random_uuid(),
  libelle text not null unique,
  couleur text default '#0E8A3E',
  ordre int default 0,
  actif boolean default true
);

create table if not exists parametres_ingenieurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  pin text,
  actif boolean default true
);

create table if not exists parametres_operations (
  id uuid primary key default gen_random_uuid(),
  libelle text not null unique,
  actif boolean default true
);

create table if not exists parametres_clients (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  actif boolean default true
);

create table if not exists parametres_nature_production (
  id uuid primary key default gen_random_uuid(),
  libelle text not null unique, -- 'Nouveau dossier' / 'Modification'
  actif boolean default true
);

create table if not exists parametres_validateurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  pin text,
  actif boolean default true
);

-- ------------------------------------------------------------
-- 3. Objectifs par ingénieur (objectif fixe unique, comme l'Excel)
-- ------------------------------------------------------------
create table if not exists objectifs (
  id uuid primary key default gen_random_uuid(),
  ingenieur text not null unique references parametres_ingenieurs(nom) on update cascade,
  objectif_nv_dossier numeric default 0,
  objectif_modif numeric default 0,
  updated_at timestamptz default now()
);

-- Objectif journalier optionnel, PAR OPÉRATION (partagé par toute l'équipe) —
-- utilisé seulement les jours où la Qualité veut répartir un volume précis —
-- sinon "Mes dossiers" affiche juste un compteur simple sans cible
create table if not exists objectifs_journaliers (
  id uuid primary key default gen_random_uuid(),
  operation text not null references parametres_operations(libelle) on update cascade,
  date date not null default current_date,
  objectif_nv_dossier numeric default 0,
  objectif_modif numeric default 0,
  unique (operation, date)
);

-- ------------------------------------------------------------
-- 4. Dossiers (table centrale — remplace "Saisie quotidienne")
-- ------------------------------------------------------------
create table if not exists dossiers (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  nom_dossier text not null,
  ingenieur text not null references parametres_ingenieurs(nom) on update cascade,
  nom_operation text not null references parametres_operations(libelle) on update cascade,
  client text references parametres_clients(nom) on update cascade,
  etat text not null references parametres_etats(libelle) on update cascade,
  nature_prod text not null references parametres_nature_production(libelle) on update cascade,

  retour_interne boolean default false,
  cause_retour_interne text,
  retour_client boolean default false,
  cause_retour_client text,
  date_retour_client date,
  date_nouvelle_modification date,
  ingenieur_modif text references parametres_ingenieurs(nom) on update cascade,

  commentaire text,
  valide_par text references parametres_validateurs(nom) on update cascade,

  -- Cycle de vie en 3 étapes : assignation → vérification → retours post-audit
  date_assignation timestamptz default now(),
  date_acceptation timestamptz,
  date_soumission timestamptz,
  pris_en_charge_par text,
  date_prise_en_charge timestamptz,
  date_verification timestamptz,
  nb_retours int not null default 0,
  recurrent boolean generated always as (nb_retours >= 2) stored,

  -- Champs calculés / suivi
  delai_traitement_jours numeric generated always as (
    case when date_retour_client is not null and date is not null
      then (date_retour_client - date)
      else null
    end
  ) stored,

  dossier_a_risque boolean generated always as (
    coalesce(retour_interne, false) and coalesce(retour_client, false)
  ) stored,

  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_dossiers_date on dossiers(date);
create index if not exists idx_dossiers_ingenieur on dossiers(ingenieur);
create index if not exists idx_dossiers_etat on dossiers(etat);
create index if not exists idx_dossiers_nom_dossier on dossiers(lower(nom_dossier));
create index if not exists idx_dossiers_date_verification on dossiers(date_verification);

-- Contrainte "validation à la saisie" : un dossier "Audité" doit avoir un Validé par
alter table dossiers add constraint chk_audite_valide
  check (etat <> 'Audité' or valide_par is not null);

-- ------------------------------------------------------------
-- 4bis. Historique des événements par dossier (frise chronologique)
-- ------------------------------------------------------------
create table if not exists dossier_evenements (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references dossiers(id) on delete cascade,
  type text not null check (type in (
    'assignation',
    'acceptation',
    'soumission_verification',
    'prise_en_charge',
    'verification_ok',
    'retour_interne_avant_audit',
    'retour_interne_apres_audit',
    'retour_client',
    'reassignation',
    'changement_statut_manuel'
  )),
  cause text,
  effectue_par uuid references profiles(id),
  effectue_par_nom text,
  created_at timestamptz default now()
);

create index if not exists idx_evenements_dossier on dossier_evenements(dossier_id);

-- ------------------------------------------------------------
-- 4ter. Configuration : seuil d'alerte SLA pour la 1ère vérification
-- ------------------------------------------------------------
create table if not exists parametres_config (
  id uuid primary key default gen_random_uuid(),
  seuil_verification_heures numeric not null default 1,
  seuil_urgence_heures numeric default 24,
  delai_max_traitement_heures numeric default 24
);

insert into parametres_config (seuil_verification_heures)
select 1
where not exists (select 1 from parametres_config);

-- ------------------------------------------------------------
-- 5. Commentaires en fil de discussion (par dossier)
-- ------------------------------------------------------------
create table if not exists dossier_commentaires (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references dossiers(id) on delete cascade,
  auteur_id uuid references profiles(id),
  auteur_nom text not null,
  contenu text not null,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 6. Journal d'audit (traçabilité complète)
-- ------------------------------------------------------------
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  ancien_contenu jsonb,
  nouveau_contenu jsonb,
  effectue_par uuid references profiles(id),
  effectue_par_nom text,
  created_at timestamptz default now()
);

create or replace function fn_audit_dossiers()
returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    insert into audit_log(table_name, record_id, action, nouveau_contenu, effectue_par)
    values ('dossiers', new.id, 'INSERT', to_jsonb(new), new.created_by);
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into audit_log(table_name, record_id, action, ancien_contenu, nouveau_contenu, effectue_par)
    values ('dossiers', new.id, 'UPDATE', to_jsonb(old), to_jsonb(new), new.created_by);
    new.updated_at = now();
    return new;
  elsif (tg_op = 'DELETE') then
    insert into audit_log(table_name, record_id, action, ancien_contenu, effectue_par)
    values ('dossiers', old.id, 'DELETE', to_jsonb(old), old.created_by);
    return old;
  end if;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_audit_dossiers on dossiers;
create trigger trg_audit_dossiers
  before insert or update or delete on dossiers
  for each row execute function fn_audit_dossiers();

-- ------------------------------------------------------------
-- 7. Sauvegardes automatiques (snapshot JSON hebdomadaire)
-- ------------------------------------------------------------
create table if not exists backups (
  id uuid primary key default gen_random_uuid(),
  contenu jsonb not null,
  nb_dossiers int,
  declenche_par text default 'auto', -- 'auto' (cron) ou nom de l'utilisateur
  created_at timestamptz default now()
);

-- Fonction appelée par un cron Supabase (pg_cron) chaque lundi
create or replace function fn_backup_hebdomadaire()
returns void as $$
begin
  insert into backups (contenu, nb_dossiers, declenche_par)
  select jsonb_agg(to_jsonb(d)), count(*), 'auto'
  from dossiers d;
end;
$$ language plpgsql security definer;

-- Dans Supabase > Database > Cron Jobs, planifier (chaque lundi) :
-- select cron.schedule('backup_hebdo', '0 3 * * 1', 'select fn_backup_hebdomadaire();');

-- Sauvegarde/export automatique NOCTURNE (en plus de l'hebdo)
create or replace function fn_backup_nocturne()
returns void as $$
begin
  insert into backups (contenu, nb_dossiers, declenche_par)
  select jsonb_agg(to_jsonb(d)), count(*), 'auto-nocturne'
  from dossiers d;
end;
$$ language plpgsql security definer;

-- select cron.schedule('backup_nocturne', '0 2 * * *', 'select fn_backup_nocturne();');

-- ------------------------------------------------------------
-- 8bis. Vues du cycle de vie : file d'attente et dossiers audités
-- ------------------------------------------------------------
create or replace view v_file_verification as
select *,
  extract(epoch from (now() - date_soumission)) / 3600 as heures_en_attente
from dossiers
where etat = 'En attente de vérification'
order by date_soumission asc;

create or replace view v_dossiers_audites as
select *
from dossiers
where etat = 'Audité'
order by date_verification desc;

-- ------------------------------------------------------------
-- 9. Alertes (dossiers bloqués trop longtemps)
-- ------------------------------------------------------------
create or replace view v_alertes_encours_vieux as
select *
from dossiers
where etat = 'Encours de vérif'
  and date < (current_date - interval '5 days');

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
alter table dossiers enable row level security;
alter table profiles enable row level security;
alter table dossier_commentaires enable row level security;
alter table audit_log enable row level security;
alter table backups enable row level security;
alter table objectifs enable row level security;
alter table objectifs_journaliers enable row level security;
alter table dossier_evenements enable row level security;
alter table parametres_config enable row level security;

-- Profils : chacun voit son propre profil (pas de sous-requête sur profiles elle-même,
-- pour éviter toute récursion infinie dans la politique RLS)
create policy "profils_lecture" on profiles for select using (
  auth.uid() = id
);

-- Dossiers : Admin & Qualité voient tout. Ingénieur voit seulement les siens.
create policy "dossiers_lecture" on dossiers for select using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
    and (p.role in ('admin', 'qualite') or p.ingenieur_ref = dossiers.ingenieur)
  )
);

create policy "dossiers_insertion" on dossiers for insert with check (
  exists (select 1 from profiles p where p.id = auth.uid())
);

create policy "dossiers_maj" on dossiers for update using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
    and (p.role in ('admin', 'qualite') or p.ingenieur_ref = dossiers.ingenieur)
  )
);

create policy "dossiers_suppression" on dossiers for delete using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Commentaires : lecture/écriture pour tout utilisateur connecté ayant accès au dossier parent
create policy "commentaires_lecture" on dossier_commentaires for select using (
  exists (select 1 from profiles p where p.id = auth.uid())
);
create policy "commentaires_insertion" on dossier_commentaires for insert with check (
  auth.uid() = auteur_id
);

-- Audit log : lecture réservée Admin + Qualité
create policy "audit_lecture" on audit_log for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'qualite'))
);

-- Backups : lecture/écriture réservée Admin
create policy "backups_lecture" on backups for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Objectifs : lecture pour tous les connectés, écriture Admin uniquement
create policy "objectifs_lecture" on objectifs for select using (
  exists (select 1 from profiles p where p.id = auth.uid())
);
create policy "objectifs_ecriture" on objectifs for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "objectifs_journaliers_lecture" on objectifs_journaliers for select using (
  exists (select 1 from profiles p where p.id = auth.uid())
);
create policy "objectifs_journaliers_ecriture" on objectifs_journaliers for all using (
  exists (select 1 from profiles p where p.id = auth.uid())
);

-- Événements dossier : lecture/écriture pour tout utilisateur connecté
create policy "evenements_lecture" on dossier_evenements for select using (
  exists (select 1 from profiles p where p.id = auth.uid())
);
create policy "evenements_insertion" on dossier_evenements for insert with check (
  exists (select 1 from profiles p where p.id = auth.uid())
);

-- Config : lecture pour tous les connectés, écriture Admin uniquement
create policy "config_lecture" on parametres_config for select using (
  exists (select 1 from profiles p where p.id = auth.uid())
);
create policy "config_ecriture" on parametres_config for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ------------------------------------------------------------
-- 10. Données de référence initiales (extraites de Paramètres)
-- ------------------------------------------------------------
insert into parametres_etats (libelle, couleur, ordre) values
  ('En attente de traitement', '#9AA0A6', 0),
  ('En attente', '#9AA0A6', 1),
  ('Encours', '#1B2A4A', 2),
  ('En attente de vérification', '#D4A017', 3),
  ('En cours de vérification', '#1B2A4A', 4),
  ('Encours de vérif', '#D4A017', 5),
  ('Audité', '#0E8A3E', 6),
  ('Dossier vérifié', '#0A6830', 7),
  ('Suspendue', '#C7070A', 8),
  ('en pause', '#B08900', 9),
  ('Annulé', '#7A1F1F', 10)
on conflict (libelle) do nothing;

insert into parametres_operations (libelle) values
  ('BAR-TH-174'), ('BAR-TH-175'), ('BAR-TH-177'), ('BAR-TH-179'),
  ('LED'), ('Destrat')
on conflict (libelle) do nothing;

insert into parametres_nature_production (libelle) values
  ('Nouveau dossier'), ('Modification')
on conflict (libelle) do nothing;

insert into parametres_causes_retour (libelle, type) values
  ('Document manquant', 'generique'),
  ('Photo non conforme', 'generique'),
  ('Incohérence technique', 'generique'),
  ('Erreur DPE', 'generique'),
  ('Signature manquante', 'generique'),
  ('Non-respect réglementaire', 'generique'),
  ('MODIF CLIENT', 'client'),
  ('Faute qualité', 'client'),
  ('Erreur de saisie', 'interne'),
  ('Non-respect de la méthodologie', 'interne'),
  ('Erreur de calcul', 'interne'),
  ('Manque de rigueur', 'interne'),
  ('Document interne manquant', 'interne'),
  ('Autre', 'generique')
on conflict (libelle) do nothing;

insert into parametres_clients (nom) values ('Simone'), ('AVI')
on conflict (nom) do nothing;
