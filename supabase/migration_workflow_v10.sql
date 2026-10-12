-- ============================================================
-- Migration V10 — Pièces jointes des dossiers
--   · Pièces reçues (déposées par la Qualité) et livrables (déposés par l'ingénieur, versionnés)
--   · Stockage privé Supabase (bucket « dossiers-fichiers »), accessible aux seuls utilisateurs connectés
--   · Conservation configurable (par défaut 90 jours après validation du dossier)
-- À exécuter UNE fois dans Supabase → SQL Editor → Run (après la V9). Additif.
-- ============================================================

-- 1. Espace de stockage privé (50 Mo max par fichier = limite de l'offre gratuite)
insert into storage.buckets (id, name, public, file_size_limit)
values ('dossiers-fichiers', 'dossiers-fichiers', false, 52428800)
on conflict (id) do nothing;

-- Accès aux fichiers : uniquement les utilisateurs connectés ayant un profil
drop policy if exists "fichiers_lecture" on storage.objects;
create policy "fichiers_lecture" on storage.objects for select using (
  bucket_id = 'dossiers-fichiers' and exists (select 1 from public.profiles p where p.id = auth.uid())
);
drop policy if exists "fichiers_depot" on storage.objects;
create policy "fichiers_depot" on storage.objects for insert with check (
  bucket_id = 'dossiers-fichiers' and exists (select 1 from public.profiles p where p.id = auth.uid())
);
drop policy if exists "fichiers_suppression" on storage.objects;
create policy "fichiers_suppression" on storage.objects for delete using (
  bucket_id = 'dossiers-fichiers' and exists (select 1 from public.profiles p where p.id = auth.uid())
);

-- 2. Registre des fichiers de chaque dossier
create table if not exists dossier_fichiers (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references dossiers(id) on delete cascade,
  categorie text not null check (categorie in ('piece', 'livrable')),
  nom_fichier text not null,
  chemin text not null unique,
  taille bigint,
  type_mime text,
  version int not null default 1,
  depose_par_nom text,
  created_at timestamptz default now()
);
create index if not exists idx_fichiers_dossier on dossier_fichiers(dossier_id);

alter table dossier_fichiers enable row level security;
drop policy if exists "fichiers_registre_lecture" on dossier_fichiers;
create policy "fichiers_registre_lecture" on dossier_fichiers for select using (
  exists (select 1 from profiles p where p.id = auth.uid())
);
drop policy if exists "fichiers_registre_ajout" on dossier_fichiers;
create policy "fichiers_registre_ajout" on dossier_fichiers for insert with check (
  exists (select 1 from profiles p where p.id = auth.uid())
);
drop policy if exists "fichiers_registre_suppression" on dossier_fichiers;
create policy "fichiers_registre_suppression" on dossier_fichiers for delete using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'qualite'))
);

-- 3. Durée de conservation (jours après validation du dossier)
alter table parametres_config add column if not exists conservation_fichiers_jours int not null default 90;

-- Fichiers arrivés en fin de conservation (utilisé par la purge automatique de l'app)
create or replace view v_fichiers_a_purger as
select f.id, f.chemin, f.dossier_id
from dossier_fichiers f
join dossiers d on d.id = f.dossier_id
cross join lateral (select coalesce(max(conservation_fichiers_jours), 90) as jours from parametres_config) c
where d.etat in ('Audité', 'Dossier vérifié', 'Annulé')
  and coalesce(d.date_verification, d.updated_at, d.created_at) < now() - make_interval(days => c.jours);

-- 4. Couleurs des statuts (modifiables ensuite dans Paramètres → Statuts)
--    Harmonisées avec la charte de l'app ; remplace les anciennes couleurs.
update parametres_etats set couleur = v.couleur
from (values
  ('Dans la file', '#8A96A3'),
  ('En attente de traitement', '#6B7C93'),
  ('Encours', '#1F6FA8'),
  ('En attente d''info', '#D09A2E'),
  ('En attente de vérification', '#E07B1F'),
  ('En cours de vérification', '#E07B1F'),
  ('Audité', '#4E9F3D'),
  ('Dossier vérifié', '#4E9F3D'),
  ('Suspendue', '#D33A3A'),
  ('en pause', '#A77BCA'),
  ('Annulé', '#5E6670')
) as v(libelle, couleur)
where parametres_etats.libelle = v.libelle;

-- Ajoute les statuts éventuellement absents (pour qu'ils apparaissent dans Paramètres → Statuts)
insert into parametres_etats (libelle, couleur, ordre)
select v.libelle, v.couleur, v.ordre
from (values
  ('Dans la file', '#8A96A3', 0),
  ('En attente d''info', '#D09A2E', 25),
  ('Annulé', '#5E6670', 90)
) as v(libelle, couleur, ordre)
where not exists (select 1 from parametres_etats e where e.libelle = v.libelle);

-- Les statuts se lisent/écrivent : lecture pour tous, modification de la couleur par l'admin
alter table parametres_etats enable row level security;
drop policy if exists "etats_lecture" on parametres_etats;
create policy "etats_lecture" on parametres_etats for select using (true);
drop policy if exists "etats_ecriture" on parametres_etats;
create policy "etats_ecriture" on parametres_etats for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
