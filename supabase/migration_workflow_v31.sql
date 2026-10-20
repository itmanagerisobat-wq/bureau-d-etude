-- ============================================================
-- Migration V31 — Facturation
--   · facturation_parametres : une seule ligne (id = 1) avec tous les champs paramétrables
--     (émetteur, banque, mentions légales, TVA, conditions, clients facturés, tarifs par fiche).
--   · factures : les factures enregistrées (numéro unique, période, montants, lignes et dossiers),
--     pour garder l'historique, numéroter à la suite et ne pas facturer deux fois un dossier.
--   · Accès réservé aux comptes Admin.
-- À exécuter UNE fois dans Supabase → SQL Editor → Run (après la V30). Additif.
-- ============================================================

create table if not exists facturation_parametres (
  id int primary key default 1 check (id = 1),
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  updated_by text
);

create table if not exists factures (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  client text not null,
  modele text not null default 'simple' check (modele in ('simple', 'detaillee')),
  periode_du date not null,
  periode_au date not null,
  date_facture date not null default current_date,
  date_echeance date,
  inclut_nouveaux boolean not null default true,
  inclut_modifications boolean not null default false,
  total_ht numeric(12, 2) not null default 0,
  total_tva numeric(12, 2) not null default 0,
  total_ttc numeric(12, 2) not null default 0,
  lignes jsonb not null default '[]'::jsonb,      -- lignes de la facture (désignation, TVA, PU, quantité, total)
  dossiers jsonb not null default '[]'::jsonb,    -- dossiers facturés (id, nom, fiche, nature, date)
  config jsonb not null default '{}'::jsonb,      -- émetteur, client, banque… au moment de la facture
  annulee boolean not null default false,
  annulee_motif text,
  cree_par text,
  created_at timestamptz default now()
);
create index if not exists idx_factures_client on factures(client);
create index if not exists idx_factures_periode on factures(periode_du, periode_au);

alter table facturation_parametres enable row level security;
alter table factures enable row level security;

drop policy if exists "facturation_param_admin" on facturation_parametres;
create policy "facturation_param_admin" on facturation_parametres for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "factures_admin" on factures;
create policy "factures_admin" on factures for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Valeurs de départ reprises de la facture FA2610-0002 (modifiables dans l'application)
insert into facturation_parametres (id, config) values (1, '{
  "emetteur": {"nom": "HILLSOLUTION", "adresse": "38 rue de Berri", "cp_ville": "75008 Paris", "tel": "0762664069", "email": "contact@etudeshillsolution.com", "web": "www.hill-solution.fr"},
  "banque": {"beneficiaire": "HILLSOLUTION", "iban": "FR98 3000 2006 2100 0000 7435 X64", "bic": "CRLYFRPP", "adresse": "38 RUE DE BERRI 75008 PARIS", "banque": "LCL"},
  "pied": {"forme": "Société à responsabilité limitée (SARL)", "capital": "100 000 €", "siret": "977 765 890 00024", "tva_intra": "FR28977765890"},
  "prefixe": "FA", "tva": 20, "delai_jours": 1, "conditions": "A réception",
  "categorie": "Prestation de services", "designation_defaut": "Dossier administratif {fiche}",
  "pu_nouveau_defaut": 40, "pu_modification_defaut": 0,
  "clients": {}, "tarifs": {}
}'::jsonb)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
