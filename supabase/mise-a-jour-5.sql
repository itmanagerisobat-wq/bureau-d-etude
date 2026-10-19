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
