-- ============================================================
-- Migration V20 — Messagerie : équipes, présence, liaison RH par e-mail
--   · Équipes de messagerie (séparées des équipes clients) : « voit tout le monde » ou « voit seulement son équipe »
--     (une équipe restreinte voit toujours les Responsables, la Qualité et le canal Général)
--   · Chaque équipe a son groupe de discussion, membres synchronisés automatiquement
--   · Présence : en ligne / absent / hors ligne (l'admin n'émet aucune présence)
--   · Conversations « RH » : un fil par personne avec les Ressources humaines, relié à l'e-mail du RH
-- À exécuter UNE fois dans Supabase → SQL Editor → Run (après la V19). Additif.
-- ============================================================

-- 1. Présence
alter table profiles add column if not exists derniere_activite timestamptz;
alter table profiles add column if not exists presence_active boolean not null default false;

create or replace function fn_presence_ping(p_actif boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if fn_chat_superviseur() then return; end if; -- l'admin reste invisible
  update profiles set derniere_activite = now(), presence_active = p_actif where id = auth.uid();
end;
$$;

-- 2. Équipes de messagerie
create table if not exists msg_equipes (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  mode text not null default 'tout' check (mode in ('tout', 'equipe')),
  created_at timestamptz not null default now()
);
create table if not exists msg_equipe_membres (
  equipe_id uuid not null references msg_equipes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (equipe_id, user_id)
);
alter table msg_equipes enable row level security;
alter table msg_equipe_membres enable row level security;
drop policy if exists "msg_equipes_lecture" on msg_equipes;
create policy "msg_equipes_lecture" on msg_equipes for select using (exists (select 1 from profiles where id = auth.uid()));
drop policy if exists "msg_equipe_membres_lecture" on msg_equipe_membres;
create policy "msg_equipe_membres_lecture" on msg_equipe_membres for select using (exists (select 1 from profiles where id = auth.uid()));

alter table chat_conversations add column if not exists equipe_id uuid references msg_equipes(id) on delete set null;

-- 3. Conversations RH + traçage e-mail
alter table chat_conversations drop constraint if exists chat_conversations_type_check;
alter table chat_conversations add constraint chat_conversations_type_check check (type in ('public', 'groupe', 'prive', 'rh'));
alter table chat_conversations add column if not exists ref text unique;
alter table chat_messages add column if not exists source text not null default 'app' check (source in ('app', 'email'));
alter table chat_messages add column if not exists email_message_id text;
alter table chat_messages add column if not exists email_statut text; -- envoyé / erreur : …
create index if not exists idx_chat_messages_email on chat_messages(email_message_id);

alter table parametres_config add column if not exists rh_actif boolean not null default false;
alter table parametres_config add column if not exists rh_emails text not null default '';
alter table parametres_config add column if not exists rh_libelle text not null default 'Ressources humaines';
alter table parametres_config add column if not exists rh_derniere_synchro timestamptz;
alter table parametres_config add column if not exists rh_synchro_statut text;

-- 4. Qui voit qui
-- Admin superviseur : tout le monde. Sinon : si je ne suis dans aucune équipe, ou dans au moins une équipe
-- « voit tout le monde » → tout le monde ; sinon les membres de mes équipes + Responsables + Qualité.
create or replace function fn_msg_voit(p_cible uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    fn_chat_superviseur()
    or not exists (select 1 from msg_equipe_membres m where m.user_id = auth.uid())
    or exists (select 1 from msg_equipe_membres m join msg_equipes e on e.id = m.equipe_id where m.user_id = auth.uid() and e.mode = 'tout')
    or exists (select 1 from profiles p where p.id = p_cible and (p.role = 'qualite' or (p.role = 'admin' and p.fonction = 'Responsable')))
    or exists (
      select 1 from msg_equipe_membres a join msg_equipe_membres b on a.equipe_id = b.equipe_id
      where a.user_id = auth.uid() and b.user_id = p_cible
    );
$$;

-- Annuaire avec présence (sans l'admin superviseur, sans les comptes coupés ou désactivés, selon les équipes)
drop function if exists fn_chat_annuaire();
create or replace function fn_chat_annuaire()
returns table (id uuid, nom text, role text, fonction text, derniere_activite timestamptz, presence_active boolean, equipes text[])
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.nom_complet, ''), 'Sans nom'), p.role::text, p.fonction, p.derniere_activite, p.presence_active,
         coalesce((select array_agg(e.nom order by e.nom) from msg_equipe_membres m join msg_equipes e on e.id = m.equipe_id where m.user_id = p.id), '{}')
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
returns table (id uuid, nom text, role text, fonction text, chat_actif boolean, derniere_activite timestamptz, presence_active boolean, equipes text[])
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.nom_complet, ''), 'Sans nom'), p.role::text, p.fonction, p.chat_actif, p.derniere_activite, p.presence_active,
         coalesce((select array_agg(e.nom order by e.nom) from msg_equipe_membres m join msg_equipes e on e.id = m.equipe_id where m.user_id = p.id), '{}')
  from profiles p
  where exists (select 1 from profiles moi where moi.id = auth.uid() and moi.role = 'admin')
  order by 2;
$$;

-- Tête-à-tête : uniquement avec une personne visible
create or replace function fn_chat_ouvrir_prive(p_autre uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_conv uuid;
  v_cfg parametres_config;
begin
  select * into v_cfg from parametres_config limit 1;
  if fn_chat_superviseur() then raise exception 'lecture_seule'; end if;
  if not v_cfg.chat_prive_actif then raise exception 'tchat_prive_desactive'; end if;
  if not exists (select 1 from profiles where id = auth.uid() and chat_actif) then raise exception 'tchat_desactive'; end if;
  if p_autre = auth.uid() then raise exception 'meme_personne'; end if;
  if not fn_msg_voit(p_autre) then raise exception 'hors_equipe'; end if;

  select c.id into v_conv
  from chat_conversations c
  where c.type = 'prive'
    and exists (select 1 from chat_membres m where m.conversation_id = c.id and m.user_id = auth.uid())
    and exists (select 1 from chat_membres m where m.conversation_id = c.id and m.user_id = p_autre)
  limit 1;
  if v_conv is not null then return v_conv; end if;

  insert into chat_conversations (type, cree_par) values ('prive', auth.uid()) returning id into v_conv;
  insert into chat_membres (conversation_id, user_id) values (v_conv, auth.uid()), (v_conv, p_autre);
  return v_conv;
end;
$$;

-- Fil RH de la personne connectée (un seul par personne)
create or replace function fn_chat_ouvrir_rh() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_conv uuid;
  v_cfg parametres_config;
begin
  select * into v_cfg from parametres_config limit 1;
  if fn_chat_superviseur() then raise exception 'lecture_seule'; end if;
  if not v_cfg.rh_actif then raise exception 'rh_desactive'; end if;
  if not exists (select 1 from profiles where id = auth.uid() and chat_actif) then raise exception 'tchat_desactive'; end if;
  select c.id into v_conv from chat_conversations c
  where c.type = 'rh' and exists (select 1 from chat_membres m where m.conversation_id = c.id and m.user_id = auth.uid())
  limit 1;
  if v_conv is not null then return v_conv; end if;
  insert into chat_conversations (type, nom, cree_par, ref)
  values ('rh', v_cfg.rh_libelle, auth.uid(), upper(substr(md5(random()::text), 1, 6)))
  returning id into v_conv;
  insert into chat_membres (conversation_id, user_id) values (v_conv, auth.uid());
  return v_conv;
end;
$$;

-- Lecture / écriture : les fils RH suivent les règles des conversations privées + liaison RH active
create or replace function fn_chat_peut_lire(p_conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select fn_chat_superviseur() or exists (
    select 1
    from chat_conversations c
    join profiles p on p.id = auth.uid()
    cross join (select * from parametres_config limit 1) cfg
    where c.id = p_conv
      and p.chat_actif
      and (
        (c.type = 'public' and cfg.chat_public_actif)
        or (c.type in ('groupe', 'prive') and cfg.chat_prive_actif
            and exists (select 1 from chat_membres m where m.conversation_id = c.id and m.user_id = auth.uid()))
        or (c.type = 'rh'
            and exists (select 1 from chat_membres m where m.conversation_id = c.id and m.user_id = auth.uid()))
      )
  );
$$;

create or replace function fn_chat_peut_ecrire(p_conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not fn_chat_superviseur()
    and fn_chat_peut_lire(p_conv)
    and (
      coalesce((select type from chat_conversations where id = p_conv), '') <> 'rh'
      or coalesce((select rh_actif from parametres_config limit 1), false)
    );
$$;

-- 5. Gestion des équipes (admin / Responsable) — le groupe de discussion suit
create or replace function fn_msg_equipe(p_action text, p_equipe uuid default null, p_nom text default null, p_mode text default null, p_user uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := p_equipe;
  v_conv uuid;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then raise exception 'non_autorise'; end if;

  if p_action = 'creer' then
    insert into msg_equipes (nom, mode) values (trim(p_nom), coalesce(p_mode, 'tout')) returning id into v_id;
    insert into chat_conversations (type, nom, cree_par, equipe_id) values ('groupe', trim(p_nom), auth.uid(), v_id);
  elsif p_action = 'modifier' then
    update msg_equipes set nom = coalesce(nullif(trim(p_nom), ''), nom), mode = coalesce(p_mode, mode) where id = v_id;
    update chat_conversations set nom = (select nom from msg_equipes where id = v_id) where equipe_id = v_id;
  elsif p_action = 'supprimer' then
    delete from msg_equipes where id = v_id; -- le groupe de discussion est conservé (historique)
  elsif p_action = 'ajouter' then
    insert into msg_equipe_membres (equipe_id, user_id) values (v_id, p_user) on conflict do nothing;
    select id into v_conv from chat_conversations where equipe_id = v_id limit 1;
    if v_conv is not null then
      insert into chat_membres (conversation_id, user_id) values (v_conv, p_user) on conflict do nothing;
    end if;
  elsif p_action = 'retirer' then
    delete from msg_equipe_membres where equipe_id = v_id and user_id = p_user;
    delete from chat_membres where user_id = p_user and conversation_id in (select id from chat_conversations where equipe_id = v_id);
  else
    raise exception 'action_inconnue';
  end if;
  return v_id;
end;
$$;

grant execute on function fn_presence_ping(boolean), fn_msg_voit(uuid), fn_chat_annuaire(), fn_chat_personnes_admin(),
  fn_chat_ouvrir_prive(uuid), fn_chat_ouvrir_rh(), fn_chat_peut_lire(uuid), fn_chat_peut_ecrire(uuid),
  fn_msg_equipe(text, uuid, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
