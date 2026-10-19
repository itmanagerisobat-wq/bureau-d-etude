-- =====================================================================
-- ISO BAT — Devis & factures déstratification (BAT-TH-142 / IND-BA-110)
-- Schéma Supabase : à exécuter une fois dans SQL Editor, puis seed.sql
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Utilisateurs
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nom text,
  email text,
  role text not null default 'gestionnaire' check (role in ('admin','gestionnaire')),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nom, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nom', split_part(new.email,'@',1)),
          case when (select count(*) from public.profiles) = 0 then 'admin' else 'gestionnaire' end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- mise à niveau d'une base créée avec l'ancienne version (rôle « commercial »)
alter table public.profiles add column if not exists actif boolean not null default true;
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'gestionnaire' where role not in ('admin','gestionnaire');
alter table public.profiles alter column role set default 'gestionnaire';
alter table public.profiles add constraint profiles_role_check check (role in ('admin','gestionnaire'));

-- Rôles : admin = tout (paramètres, utilisateurs, fiches CEE) ; gestionnaire = gère et saisit les devis/factures
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and actif);
$$;

create or replace function public.est_actif()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and actif and role in ('admin','gestionnaire'));
$$;

-- ---------------------------------------------------------------------
-- Paramètres (équivalent de l'onglet « Paramètres »)
-- ---------------------------------------------------------------------
create table if not exists public.parametres (
  cle text primary key,
  valeur text,
  libelle text,
  ordre int default 0
);

create table if not exists public.fiches_montants (
  id uuid primary key default gen_random_uuid(),
  type_batiment text not null check (type_batiment in ('Tertiaire','Industriel')),
  zone text not null check (zone in ('H1','H2','H3')),
  kwhc_conv numeric not null,
  kwhc_rad numeric not null default 0,
  fiche text not null,
  version text not null,
  date_effet date not null default '2000-01-01',
  unique (type_batiment, zone, version)
);

create table if not exists public.delegataires (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  siren text,
  valorisation numeric not null,          -- €/MWh cumac
  texte_cee text,                         -- vide = texte CEE par défaut
  actif boolean not null default true
);

create table if not exists public.equipements (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  marque text,
  libelle text,
  actif boolean not null default true
);

create table if not exists public.zones (
  departement text primary key,
  zone text not null check (zone in ('H1','H2','H3'))
);

-- Textes et seuils extraits des fiches officielles (onglet « Fiches CEE »)
create table if not exists public.fiches_textes (
  id uuid primary key default gen_random_uuid(),
  fiche text not null,
  version text not null,
  date_effet date,
  statut text not null default 'Importée',   -- Importée | Importée partiellement (...) | NON LUE
  importee_le date default current_date,
  titre text,
  denomination text,
  exclusions text,
  h_min numeric,
  c_min numeric,
  limite date,
  vertical text,
  preuve text,
  modifications text,
  pdf_path text,
  texte_complet text,
  partiel text,
  unique (fiche, version)
);

-- Compteurs de numérotation (remis à zéro chaque année)
create table if not exists public.compteurs (
  type text primary key check (type in ('devis','facture')),
  annee int not null,
  dernier int not null default 0
);

-- ---------------------------------------------------------------------
-- Dossiers (un devis = un dossier, une ou plusieurs lignes/locaux)
-- ---------------------------------------------------------------------
create table if not exists public.dossiers (
  id uuid primary key default gen_random_uuid(),
  ref_dossier text not null,
  numero_devis text unique,
  date_devis date,
  delegataire text,
  type_batiment text check (type_batiment in ('Tertiaire','Industriel')),
  raison_sociale text,
  siret text,
  adresse_siege text,
  cp_siege text,
  ville_siege text,
  telephone text,
  mail text,
  rep_nom text,
  rep_prenom text,
  fonction text,
  secteur text,
  statut text not null default 'Brouillon' check (statut in ('Brouillon','Généré','Erreur')),
  type_client text not null default 'BtoB' check (type_client in ('BtoB','BtoC')),
  civilite text,
  facture_directe boolean not null default false,
  controles text,
  a_verifier boolean not null default false,
  kwh numeric,
  prime numeric,
  genere_le timestamptz,
  pdf_devis text,
  statut_facture text check (statut_facture in ('Générée','Erreur')),
  date_facture date,
  numero_facture text unique,
  pdf_facture text,
  id_delegataire text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dossiers_statut_idx on public.dossiers(statut);
-- mise à niveau (bases créées avant l'ajout BtoB/BtoC et factures directes)
alter table public.dossiers add column if not exists type_client text not null default 'BtoB';
alter table public.dossiers add column if not exists civilite text;
alter table public.dossiers add column if not exists facture_directe boolean not null default false;

create table if not exists public.lignes (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  ordre int not null default 0,
  nom_site text,
  adresse_travaux text,
  cp_travaux text,
  ville_travaux text,
  p_conv numeric,
  p_rad numeric,
  hauteur numeric,
  reference text,
  nb int,
  consigne numeric,
  surface numeric,
  volume numeric,
  clos boolean not null default true,
  entrepot boolean not null default false,
  version_fiche text,       -- figée à la 1re génération
  kwh numeric,
  prime numeric,
  pu numeric
);
create index if not exists lignes_dossier_idx on public.lignes(dossier_id);

-- Gestion commerciale : lignes libres (produits / prestations) et aide déduite saisie à la main
alter table public.dossiers add column if not exists aide_libelle text;
alter table public.dossiers add column if not exists aide_montant numeric;
alter table public.dossiers add column if not exists total_ht numeric;
alter table public.dossiers add column if not exists total_ttc numeric;

create table if not exists public.lignes_libres (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  ordre int not null default 0,
  designation text,
  quantite numeric not null default 1,
  pu_ht numeric not null default 0,
  tva numeric not null default 0.2
);
create index if not exists lignes_libres_dossier_idx on public.lignes_libres(dossier_id);
alter table public.lignes_libres add column if not exists unite text default 'U';
alter table public.lignes_libres add column if not exists detail text;

-- BtoC (particuliers) : logement, précarité, adresse des travaux, opérations CEE résidentielles (BAR-TH-171…)
alter table public.dossiers add column if not exists precarite text;
alter table public.dossiers add column if not exists type_chauffage text;
alter table public.dossiers add column if not exists type_logement text;
alter table public.dossiers add column if not exists travaux_adresse text;
alter table public.dossiers add column if not exists travaux_cp text;
alter table public.dossiers add column if not exists travaux_ville text;
alter table public.dossiers add column if not exists operations jsonb not null default '[]'::jsonb;
alter table public.dossiers add column if not exists soustraitant_id uuid;

-- Sous-traitants RGE (mention obligatoire sur les devis BtoC)
create table if not exists public.soustraitants (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  adresse text,
  representant text,
  siret text,
  rge_numero text,
  rge_date date,
  rge_validite date,
  actif boolean not null default true
);
alter table public.delegataires add column if not exists valorisation_btoc numeric;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid references public.dossiers(id) on delete cascade,
  type text not null check (type in ('devis','facture')),
  numero text,
  fichier text not null,
  storage_path text not null,
  archive boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.journal (
  id bigint generated always as identity primary key,
  dossier_id uuid references public.dossiers(id) on delete cascade,
  action text not null,
  detail text,
  user_id uuid references auth.users(id),
  at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists dossiers_touch on public.dossiers;
create trigger dossiers_touch before update on public.dossiers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Numérotation atomique : <préfixe><année>-0001 (même règle que l'exe :
-- max(dernier attribué si même année, plus grand n° déjà utilisé) + 1)
-- ---------------------------------------------------------------------
create or replace function public.prochain_numero(p_type text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_annee int := extract(year from (now() at time zone 'Europe/Paris'))::int;
  v_prefixe text;
  v_base text;
  v_dernier int;
  v_utilise int;
  v_c record;
begin
  if p_type not in ('devis','facture') then raise exception 'type inconnu'; end if;
  select coalesce(valeur, case when p_type='facture' then 'F' else '' end) into v_prefixe
    from parametres where cle = case when p_type='devis' then 'prefixe_devis' else 'prefixe_facture' end;
  v_prefixe := coalesce(v_prefixe, case when p_type='facture' then 'F' else '' end);
  v_base := v_prefixe || v_annee || '-';

  insert into compteurs(type, annee, dernier) values (p_type, v_annee, 0) on conflict (type) do nothing;
  select * into v_c from compteurs where type = p_type for update;

  v_dernier := case when v_c.annee = v_annee then v_c.dernier else 0 end;

  select coalesce(max(substring(n from length(v_base)+1)::int), 0) into v_utilise
    from (select case when p_type = 'devis' then numero_devis else numero_facture end as n from dossiers) s
   where left(n, length(v_base)) = v_base and substring(n from length(v_base)+1) ~ '^\d+$';

  v_dernier := greatest(v_dernier, v_utilise) + 1;
  update compteurs set annee = v_annee, dernier = v_dernier where type = p_type;
  return v_base || lpad(v_dernier::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------
-- Sécurité (RLS)
--  - tout utilisateur connecté lit tout et gère les dossiers
--  - seuls les admins (« la responsable ») modifient les paramètres
-- ---------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.parametres      enable row level security;
alter table public.fiches_montants enable row level security;
alter table public.delegataires    enable row level security;
alter table public.equipements     enable row level security;
alter table public.zones           enable row level security;
alter table public.fiches_textes   enable row level security;
alter table public.compteurs       enable row level security;
alter table public.dossiers        enable row level security;
alter table public.lignes          enable row level security;
alter table public.lignes_libres   enable row level security;
alter table public.soustraitants   enable row level security;
alter table public.documents       enable row level security;
alter table public.journal         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['parametres','fiches_montants','delegataires','equipements','zones','fiches_textes','compteurs','soustraitants'] loop
    execute format('drop policy if exists "lecture" on public.%I', t);
    execute format('create policy "lecture" on public.%I for select to authenticated using (public.est_actif())', t);
    execute format('drop policy if exists "admin ecriture" on public.%I', t);
    execute format('create policy "admin ecriture" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
  foreach t in array array['dossiers','lignes','lignes_libres','documents','journal'] loop
    execute format('drop policy if exists "equipe" on public.%I', t);
    execute format('create policy "equipe" on public.%I for all to authenticated using (public.est_actif()) with check (public.est_actif())', t);
  end loop;
end $$;

-- un gestionnaire ne peut pas supprimer un devis déjà généré (numéro attribué) : réservé à l'admin
drop policy if exists "equipe" on public.dossiers;
drop policy if exists "dossiers lecture" on public.dossiers;
drop policy if exists "dossiers creation" on public.dossiers;
drop policy if exists "dossiers modification" on public.dossiers;
drop policy if exists "dossiers suppression" on public.dossiers;
create policy "dossiers lecture" on public.dossiers for select to authenticated using (public.est_actif());
create policy "dossiers creation" on public.dossiers for insert to authenticated with check (public.est_actif());
create policy "dossiers modification" on public.dossiers for update to authenticated using (public.est_actif()) with check (public.est_actif());
create policy "dossiers suppression" on public.dossiers for delete to authenticated
  using (public.is_admin() or (public.est_actif() and numero_devis is null));

drop policy if exists "profil lecture" on public.profiles;
create policy "profil lecture" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "profil admin" on public.profiles;
create policy "profil admin" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant execute on function public.prochain_numero(text) to authenticated;

-- ---------------------------------------------------------------------
-- Stockage des PDF (devis, factures, fiches CEE archivées)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('documents','documents', false)
  on conflict (id) do nothing;

drop policy if exists "documents equipe" on storage.objects;
create policy "documents equipe" on storage.objects for all to authenticated
  using (bucket_id = 'documents' and public.est_actif()) with check (bucket_id = 'documents' and public.est_actif());

drop policy if exists "profil admin insert" on public.profiles;
create policy "profil admin insert" on public.profiles for insert to authenticated with check (public.is_admin());
-- ---------------------------------------------------------------------
-- Notes de dimensionnement (NDD) : une note par opération, modèles modifiables
-- ---------------------------------------------------------------------
alter table public.dossiers add column if not exists ndd jsonb not null default '{}'::jsonb;
alter table public.dossiers add column if not exists pdf_ndd text;
alter table public.equipements add column if not exists debit numeric;  -- m³/h (déstratificateurs)
update public.equipements set debit = 6500 where reference ilike 'ONSEN-DS7%' and debit is null;

alter table public.documents drop constraint if exists documents_type_check;
alter table public.documents add constraint documents_type_check check (type in ('devis','facture','ndd'));
alter table public.documents add column if not exists fiche text;

-- un modèle de note par fiche d'opération (BAT-TH-142, IND-BA-110, puis les nouvelles opérations)
create table if not exists public.ndd_modeles (
  fiche text primary key,
  moteur text not null default 'generique' check (moteur in ('destratification','generique')),
  titre text not null default 'NOTE DE DIMENSIONNEMENT',
  sous_titre text not null default '',
  libelle_batiment text not null default '',
  taux_brassage numeric,
  intro text not null default '',
  texte_calcul text not null default '',
  texte_conclusion text not null default '',
  champs jsonb not null default '[]'::jsonb,
  exigences jsonb not null default '[]'::jsonb,
  pdf_reference text,          -- NDD d'exemple déposée (stockage « documents »)
  actif boolean not null default true,
  updated_at timestamptz not null default now()
);

-- zone de température extérieure de base (A…I, NF EN 12831) par département, complétée au fil des dossiers
create table if not exists public.temperatures_base (
  departement text primary key,
  zone text not null check (zone in ('A','B','C','D','E','F','G','H','I'))
);

alter table public.ndd_modeles enable row level security;
alter table public.temperatures_base enable row level security;
drop policy if exists "lecture" on public.ndd_modeles;
create policy "lecture" on public.ndd_modeles for select to authenticated using (public.est_actif());
drop policy if exists "admin ecriture" on public.ndd_modeles;
create policy "admin ecriture" on public.ndd_modeles for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "lecture" on public.temperatures_base;
create policy "lecture" on public.temperatures_base for select to authenticated using (public.est_actif());
drop policy if exists "equipe ecriture" on public.temperatures_base;
create policy "equipe ecriture" on public.temperatures_base for all to authenticated using (public.est_actif()) with check (public.est_actif());

insert into public.ndd_modeles (fiche, moteur, sous_titre, libelle_batiment, taux_brassage) values
  ('BAT-TH-142', 'destratification', 'Système de déstratification d’air', 'bâtiment tertiaire', 1),
  ('IND-BA-110', 'destratification', 'Système de déstratification d’air', 'local industriel', 1.3)
on conflict (fiche) do nothing;

-- relevées sur les NDD 2026-0005 (Ariège, 377 m → -6 °C) et 2026-0006 (Loiret, 129 m → -7 °C)
insert into public.temperatures_base (departement, zone) values ('09','C'), ('45','D')
on conflict (departement) do nothing;
-- ---------------------------------------------------------------------
-- Notes de dimensionnement autonomes : document à part (ni devis, ni facture), numérotation propre
-- ---------------------------------------------------------------------
create table if not exists public.ndd_documents (
  id uuid primary key default gen_random_uuid(),
  numero text unique,                 -- 2026-0001 (compteur « ndd »), attribué à la 1re génération
  version int not null default 0,     -- dernière version générée (V1, V2…)
  fiche text not null,                -- BAT-TH-142, IND-BA-110…
  type_client text not null default 'BtoB' check (type_client in ('BtoB','BtoC')),
  date_etude date,
  raison_sociale text, siret text, adresse text, cp text, ville text,
  civilite text, rep_nom text, rep_prenom text, fonction text, telephone text, mail text,
  nom_site text, site_adresse text, site_cp text, site_ville text,
  locaux jsonb not null default '[]'::jsonb,
  saisie jsonb not null default '{}'::jsonb,
  dossier_id uuid references public.dossiers(id) on delete set null,
  pdf text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ndd_documents enable row level security;
drop policy if exists "ndd lecture" on public.ndd_documents;
drop policy if exists "ndd ecriture" on public.ndd_documents;
drop policy if exists "ndd modification" on public.ndd_documents;
drop policy if exists "ndd suppression" on public.ndd_documents;
create policy "ndd lecture" on public.ndd_documents for select to authenticated using (public.est_actif());
create policy "ndd ecriture" on public.ndd_documents for insert to authenticated with check (public.est_actif());
create policy "ndd modification" on public.ndd_documents for update to authenticated using (public.est_actif()) with check (public.est_actif());
create policy "ndd suppression" on public.ndd_documents for delete to authenticated using (public.is_admin() or (public.est_actif() and numero is null));

alter table public.documents add column if not exists ndd_id uuid references public.ndd_documents(id) on delete cascade;
alter table public.documents add column if not exists fiche text;
alter table public.documents drop constraint if exists documents_type_check;
alter table public.documents add constraint documents_type_check check (type in ('devis','facture','ndd'));

alter table public.compteurs drop constraint if exists compteurs_type_check;
alter table public.compteurs add constraint compteurs_type_check check (type in ('devis','facture','ndd'));

-- numéro suivant des NDD : <préfixe><année>-0001, remis à zéro chaque année (préfixe : paramètre prefixe_ndd)
create or replace function public.prochain_numero_ndd()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_annee int := extract(year from (now() at time zone 'Europe/Paris'))::int;
  v_base text;
  v_dernier int;
  v_utilise int;
  v_c record;
begin
  if not public.est_actif() then raise exception 'accès refusé'; end if;
  select coalesce((select valeur from parametres where cle = 'prefixe_ndd'), '') || v_annee || '-' into v_base;
  insert into compteurs(type, annee, dernier) values ('ndd', v_annee, 0) on conflict (type) do nothing;
  select * into v_c from compteurs where type = 'ndd' for update;
  v_dernier := case when v_c.annee = v_annee then v_c.dernier else 0 end;
  select coalesce(max(substring(numero from length(v_base)+1)::int), 0) into v_utilise
    from ndd_documents where left(numero, length(v_base)) = v_base and substring(numero from length(v_base)+1) ~ '^\d+$';
  v_dernier := greatest(v_dernier, v_utilise) + 1;
  update compteurs set annee = v_annee, dernier = v_dernier where type = 'ndd';
  return v_base || lpad(v_dernier::text, 4, '0');
end $$;
grant execute on function public.prochain_numero_ndd() to authenticated;
-- ---------------------------------------------------------------------
-- Modèles de devis / facture par opération et type de client, avec date d'effet
-- ---------------------------------------------------------------------
create table if not exists public.modeles_documents (
  id uuid primary key default gen_random_uuid(),
  document text not null check (document in ('devis','facture')),
  type_client text not null check (type_client in ('BtoB','BtoC')),
  fiche text not null default '*',          -- code opération (BAR-TH-171…) ou * = toutes
  libelle text not null default '',
  mise_en_page text not null,               -- btob-exe, btoc-word… (mises en page programmées)
  date_effet date not null default current_date,
  fichier_reference text,                   -- modèle fourni (PDF / Word) conservé pour mémoire
  textes jsonb not null default '{}'::jsonb,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.modeles_documents enable row level security;
drop policy if exists "lecture" on public.modeles_documents;
create policy "lecture" on public.modeles_documents for select to authenticated using (public.est_actif());
drop policy if exists "admin ecriture" on public.modeles_documents;
create policy "admin ecriture" on public.modeles_documents for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- modèle utilisé, figé à la 1re génération (une régénération garde le même modèle)
alter table public.dossiers add column if not exists modele_devis_id uuid;
alter table public.dossiers add column if not exists modele_facture_id uuid;

-- nom du produit imprimé sur la ligne des prix (modèle BtoC 2026-3076)
alter table public.lignes_libres add column if not exists nom text;

-- modèle de départ : devis particulier BAR-TH-171 (PAC air/eau) d'après le devis 2026-3076
insert into public.modeles_documents (document, type_client, fiche, libelle, mise_en_page, date_effet, textes)
select 'devis', 'BtoC', 'BAR-TH-171', 'Devis PAC air/eau — modèle 2026-3076 (VILLAUME)', 'btoc-pac-2026', current_date, '{"libelle_prime":"Prime CEE"}'::jsonb
where not exists (select 1 from public.modeles_documents where mise_en_page = 'btoc-pac-2026');

-- =====================================================================
-- Mise à jour n°5 — cadre de contribution CEE (document à part, généré depuis le devis).
-- À exécuter UNE FOIS dans Supabase → SQL Editor (sans risque si relancée).

-- nouveau type de document
alter table public.documents drop constraint if exists documents_type_check;
alter table public.documents add constraint documents_type_check check (type in ('devis','facture','ndd','cadre'));

-- coordonnées du délégataire imprimées sur le cadre (« Où se renseigner », médiateur)
alter table public.delegataires add column if not exists contact_site text;
alter table public.delegataires add column if not exists contact_tel text;
alter table public.delegataires add column if not exists mediateur_adresse text;
alter table public.delegataires add column if not exists mediateur_site text;
alter table public.delegataires add column if not exists mediateur_mail text;
update public.delegataires set
  contact_site = coalesce(contact_site, 'https://www.premiumenergyfrance.fr/service/'),
  contact_tel = coalesce(contact_tel, '0805 696 722'),
  mediateur_adresse = coalesce(mediateur_adresse, 'DEVIGNY MEDIATION, 9 Avenue René Gasnier 49100 Angers'),
  mediateur_site = coalesce(mediateur_site, 'https://www.devignymediation.fr'),
  mediateur_mail = coalesce(mediateur_mail, 'contact@devignymediation.fr')
where upper(nom) = 'PREMIUM ENERGY';

-- « Nature des travaux » imprimée pour chaque opération
create table if not exists public.cadre_natures (
  fiche text primary key,
  nature text not null default ''
);
alter table public.cadre_natures enable row level security;
drop policy if exists "lecture" on public.cadre_natures;
create policy "lecture" on public.cadre_natures for select to authenticated using (public.est_actif());
drop policy if exists "admin ecriture" on public.cadre_natures;
create policy "admin ecriture" on public.cadre_natures for all to authenticated using (public.is_admin()) with check (public.is_admin());
insert into public.cadre_natures (fiche, nature) values
  ('BAT-TH-142', 'Mise en place d’un système de déstratification d’air pour l’homogénéisation de la température de l’air d’un local de grande hauteur chauffé par un système convectif et/ou radiatif'),
  ('IND-BA-110', 'Mise en place d’un système de déstratification d’air pour l’homogénéisation de la température de l’air d’un local industriel de grande hauteur chauffé par un système convectif et/ou radiatif'),
  ('BAR-TH-171', 'Mise en place d’une pompe à chaleur (PAC) de type air/eau')
on conflict (fiche) do nothing;

-- Mise à jour n°6 — NDD : quantité nécessaire = volume déstratifié / débit du déstratificateur (toutes opérations).
-- À exécuter UNE FOIS dans Supabase → SQL Editor (sans risque si relancée).
update public.ndd_modeles set taux_brassage = 1 where fiche = 'IND-BA-110' and taux_brassage = 1.3;
-- ancien texte de calcul (« débit minimal requis = volume × taux exigé ») : on reprend le nouveau texte par défaut
update public.ndd_modeles set texte_calcul = null where texte_calcul like 'Le débit minimal requis est égal au volume du local multiplié%';

-- Mise à jour n°7 — calepinage en couleurs, détail des versions PDF, dossiers ignorés, zones de température.
-- À exécuter UNE FOIS dans Supabase → SQL Editor (sans risque si relancée).

-- couleur de chaque modèle de déstratificateur sur le plan (vide = automatique : DS3 bleu, DS7 rouge)
alter table public.equipements add column if not exists couleur text;

-- détail de chaque version de PDF (contenu + motif saisi à la régénération)
alter table public.documents add column if not exists detail text;

-- dossier ignoré (erreur, doublon…) : gardé pour mémoire, retiré des listes et des totaux
alter table public.dossiers add column if not exists ignore boolean not null default false;
alter table public.dossiers add column if not exists ignore_motif text;

-- zone de température de base par département (remplissage automatique depuis l'adresse ; vos zones déjà saisies sont gardées)
insert into public.temperatures_base (departement, zone) values
  ('01','G'),
  ('02','D'),
  ('03','E'),
  ('04','E'),
  ('05','G'),
  ('08','G'),
  ('09','C'),
  ('10','G'),
  ('11','C'),
  ('12','E'),
  ('13','C'),
  ('14','D'),
  ('15','E'),
  ('16','C'),
  ('17','C'),
  ('18','D'),
  ('19','E'),
  ('20','A'),
  ('21','G'),
  ('22','B'),
  ('23','E'),
  ('24','C'),
  ('25','H'),
  ('27','D'),
  ('28','D'),
  ('29','B'),
  ('2A','A'),
  ('2B','A'),
  ('30','C'),
  ('31','C'),
  ('32','C'),
  ('33','C'),
  ('34','C'),
  ('35','B'),
  ('36','D'),
  ('37','D'),
  ('38','G'),
  ('39','G'),
  ('40','C'),
  ('41','D'),
  ('42','E'),
  ('43','E'),
  ('44','C'),
  ('45','D'),
  ('47','C'),
  ('48','E'),
  ('49','D'),
  ('50','B'),
  ('51','G'),
  ('52','H'),
  ('53','D'),
  ('54','I'),
  ('55','H'),
  ('56','B'),
  ('57','I'),
  ('58','G'),
  ('59','F'),
  ('60','D'),
  ('61','D'),
  ('62','F'),
  ('63','E'),
  ('64','C'),
  ('65','C'),
  ('66','C'),
  ('67','I'),
  ('68','I'),
  ('69','G'),
  ('70','H'),
  ('71','G'),
  ('72','D'),
  ('73','G'),
  ('74','G'),
  ('75','C'),
  ('76','D'),
  ('77','D'),
  ('78','D'),
  ('79','D'),
  ('80','F'),
  ('81','C'),
  ('82','C'),
  ('83','C'),
  ('85','C'),
  ('86','D'),
  ('87','E'),
  ('88','I'),
  ('89','G'),
  ('90','I'),
  ('91','D'),
  ('92','D'),
  ('93','D'),
  ('94','D'),
  ('95','D')
on conflict (departement) do nothing;
