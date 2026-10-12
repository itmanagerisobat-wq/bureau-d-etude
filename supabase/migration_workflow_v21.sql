-- ============================================================
-- Migration V21 — Ingénieurs libres / occupés et connectés
--   · fn_presence_ingenieurs : connexion de chaque ingénieur (pour la Saisie, admin et Qualité)
--   · Annuaire de la Messagerie : indique si un ingénieur est occupé (dossier en cours)
-- À exécuter UNE fois dans Supabase → SQL Editor → Run (après la V20). Additif.
-- ============================================================

create or replace function fn_presence_ingenieurs()
returns table (ingenieur text, derniere_activite timestamptz, presence_active boolean)
language sql stable security definer set search_path = public as $$
  select p.ingenieur_ref, p.derniere_activite, p.presence_active
  from profiles p
  where exists (select 1 from profiles moi where moi.id = auth.uid() and moi.role in ('admin', 'qualite'))
    and p.role = 'ingenieur'
    and p.ingenieur_ref is not null;
$$;

drop function if exists fn_chat_annuaire();
create or replace function fn_chat_annuaire()
returns table (id uuid, nom text, role text, fonction text, derniere_activite timestamptz, presence_active boolean, equipes text[], occupe boolean)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.nom_complet, ''), 'Sans nom'), p.role::text, p.fonction, p.derniere_activite, p.presence_active,
         coalesce((select array_agg(e.nom order by e.nom) from msg_equipe_membres m join msg_equipes e on e.id = m.equipe_id where m.user_id = p.id), '{}'),
         p.role = 'ingenieur' and exists (select 1 from dossiers d where lower(d.ingenieur) = lower(p.ingenieur_ref) and d.etat = 'Encours')
  from profiles p
  join auth.users u on u.id = p.id
  where exists (select 1 from profiles moi where moi.id = auth.uid())
    and p.chat_actif
    and (u.banned_until is null or u.banned_until < now())
    and not (p.role = 'admin' and coalesce(p.fonction, '') <> 'Responsable')
    and fn_msg_voit(p.id)
  order by 2;
$$;

drop function if exists fn_chat_personnes_admin();
create or replace function fn_chat_personnes_admin()
returns table (id uuid, nom text, role text, fonction text, chat_actif boolean, derniere_activite timestamptz, presence_active boolean, equipes text[], occupe boolean)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.nom_complet, ''), 'Sans nom'), p.role::text, p.fonction, p.chat_actif, p.derniere_activite, p.presence_active,
         coalesce((select array_agg(e.nom order by e.nom) from msg_equipe_membres m join msg_equipes e on e.id = m.equipe_id where m.user_id = p.id), '{}'),
         p.role = 'ingenieur' and exists (select 1 from dossiers d where lower(d.ingenieur) = lower(p.ingenieur_ref) and d.etat = 'Encours')
  from profiles p
  where exists (select 1 from profiles moi where moi.id = auth.uid() and moi.role = 'admin')
  order by 2;
$$;

grant execute on function fn_presence_ingenieurs(), fn_chat_annuaire(), fn_chat_personnes_admin() to authenticated;

notify pgrst, 'reload schema';
