-- Mise à jour n°4 — modèles de devis et de facture (par opération, BtoB / BtoC, date d'effet).
-- À exécuter UNE FOIS dans Supabase → SQL Editor (sans risque si relancée).
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
