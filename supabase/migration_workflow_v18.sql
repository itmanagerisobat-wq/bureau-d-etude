-- ============================================================
-- Migration V18 — Comptes personnels (ingénieurs, Qualité, Responsables)
--   · profiles.fonction : libellé affiché (ex. « Responsable » pour un compte admin)
--   · comptes_mots_de_passe : mot de passe en cours de chaque compte créé par l'application,
--     consultable UNIQUEMENT par l'admin via Paramètres → Comptes (aucune lecture depuis le navigateur :
--     RLS activée sans politique, seule la clé service_role du serveur y accède)
--   · dossiers : un ingénieur avec un compte personnel voit et traite ses dossiers
--     (nom sans tenir compte des majuscules, y compris comme ingénieur de modif) ;
--     le compte partagé (sans ingenieur_ref) garde son accès actuel.
-- À exécuter UNE fois dans Supabase → SQL Editor → Run. Additif.
-- Puis : notify pgrst, 'reload schema';
-- ============================================================

alter table profiles add column if not exists fonction text;

create table if not exists comptes_mots_de_passe (
  id uuid primary key references auth.users(id) on delete cascade,
  mot_de_passe text not null,
  updated_at timestamptz not null default now()
);
alter table comptes_mots_de_passe enable row level security;
revoke all on comptes_mots_de_passe from anon, authenticated;

drop policy if exists "dossiers_lecture" on dossiers;
create policy "dossiers_lecture" on dossiers for select using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin', 'qualite')
        or p.ingenieur_ref is null
        or lower(p.ingenieur_ref) = lower(dossiers.ingenieur)
        or lower(p.ingenieur_ref) = lower(dossiers.ingenieur_modif)
      )
  )
);

drop policy if exists "dossiers_maj" on dossiers;
create policy "dossiers_maj" on dossiers for update using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin', 'qualite')
        or p.ingenieur_ref is null
        or lower(p.ingenieur_ref) = lower(dossiers.ingenieur)
        or lower(p.ingenieur_ref) = lower(dossiers.ingenieur_modif)
      )
  )
);

notify pgrst, 'reload schema';
