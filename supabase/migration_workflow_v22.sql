-- ============================================================
-- Migration V22 — Suppression d'un dossier avec traçabilité
--   · Seuls l'admin et les Responsables peuvent supprimer un dossier (motif obligatoire)
--   · Avant suppression, une copie complète est archivée : le dossier, son historique,
--     ses retours, ses commentaires et la liste de ses fichiers (les fichiers restent dans le stockage)
--   · Le journal des suppressions n'est visible que par l'admin (pas par les Responsables),
--     qui peut restaurer un dossier supprimé
-- À exécuter UNE fois dans Supabase → SQL Editor → Run. Additif.
-- ============================================================

create table if not exists dossiers_supprimes (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null,
  nom_dossier text,
  nom_operation text,
  etat text,
  ingenieur text,
  motif text not null,
  supprime_par uuid references auth.users(id) on delete set null,
  supprime_par_nom text,
  supprime_par_fonction text,
  supprime_le timestamptz not null default now(),
  donnees jsonb not null,            -- copie complète (dossier + historique + retours + commentaires + fichiers)
  restaure_le timestamptz,
  restaure_par_nom text
);
create index if not exists idx_dossiers_supprimes_date on dossiers_supprimes(supprime_le desc);

alter table dossiers_supprimes enable row level security;
-- Lecture : admin uniquement (les Responsables suppriment mais ne voient pas le journal)
drop policy if exists "supprimes_lecture" on dossiers_supprimes;
create policy "supprimes_lecture" on dossiers_supprimes for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.fonction, '') <> 'Responsable')
);
-- Aucune écriture directe : tout passe par les fonctions ci-dessous (le journal ne peut pas être modifié ni effacé)

create or replace function fn_supprimer_dossier(p_id uuid, p_motif text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_profil profiles;
  v_d dossiers;
  v_trace uuid;
begin
  select * into v_profil from profiles where id = auth.uid();
  if v_profil.role is distinct from 'admin' then raise exception 'reserve_admin'; end if;
  if coalesce(trim(p_motif), '') = '' then raise exception 'motif_obligatoire'; end if;
  select * into v_d from dossiers where id = p_id;
  if v_d.id is null then raise exception 'dossier_introuvable'; end if;

  insert into dossiers_supprimes (dossier_id, nom_dossier, nom_operation, etat, ingenieur, motif,
                                  supprime_par, supprime_par_nom, supprime_par_fonction, donnees)
  values (
    v_d.id, v_d.nom_dossier, v_d.nom_operation, v_d.etat, v_d.ingenieur, trim(p_motif),
    auth.uid(), v_profil.nom_complet, coalesce(v_profil.fonction, 'Admin'),
    jsonb_build_object(
      'dossier', to_jsonb(v_d),
      'evenements', coalesce((select jsonb_agg(to_jsonb(e)) from dossier_evenements e where e.dossier_id = p_id), '[]'::jsonb),
      'retours', coalesce((select jsonb_agg(to_jsonb(r)) from dossier_retours r where r.dossier_id = p_id), '[]'::jsonb),
      'commentaires', coalesce((select jsonb_agg(to_jsonb(c)) from dossier_commentaires c where c.dossier_id = p_id), '[]'::jsonb),
      'fichiers', coalesce((select jsonb_agg(to_jsonb(f)) from dossier_fichiers f where f.dossier_id = p_id), '[]'::jsonb)
    )
  )
  returning id into v_trace;

  delete from dossiers where id = p_id; -- historique, retours, commentaires et registre des fichiers suivent (cascade)
  return v_trace;
end;
$$;

-- Restauration (admin uniquement) : remet le dossier et tout ce qui l'accompagnait
create or replace function fn_restaurer_dossier(p_trace uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_t dossiers_supprimes;
  v_nom text;
begin
  if not exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.fonction, '') <> 'Responsable') then
    raise exception 'reserve_admin';
  end if;
  select * into v_t from dossiers_supprimes where id = p_trace;
  if v_t.id is null then raise exception 'trace_introuvable'; end if;
  if v_t.restaure_le is not null then raise exception 'deja_restaure'; end if;
  if exists (select 1 from dossiers where id = v_t.dossier_id) then raise exception 'deja_present'; end if;

  insert into dossiers select * from jsonb_populate_record(null::dossiers, v_t.donnees->'dossier');
  insert into dossier_evenements select * from jsonb_populate_recordset(null::dossier_evenements, v_t.donnees->'evenements');
  insert into dossier_retours select * from jsonb_populate_recordset(null::dossier_retours, v_t.donnees->'retours');
  insert into dossier_commentaires select * from jsonb_populate_recordset(null::dossier_commentaires, v_t.donnees->'commentaires');
  insert into dossier_fichiers select * from jsonb_populate_recordset(null::dossier_fichiers, v_t.donnees->'fichiers');

  select nom_complet into v_nom from profiles where id = auth.uid();
  update dossiers_supprimes set restaure_le = now(), restaure_par_nom = v_nom where id = p_trace;
  return v_t.dossier_id;
end;
$$;

grant execute on function fn_supprimer_dossier(uuid, text), fn_restaurer_dossier(uuid) to authenticated;

notify pgrst, 'reload schema';
