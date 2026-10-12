-- ============================================================
-- Migration V19 — Tchat interne + fin du code PIN
--   · Canaux publics (ex. « Général »), groupes privés et discussions en tête-à-tête
--   · L'admin (hors Responsables) est invisible : absent de l'annuaire, il lit toutes les
--     conversations en lecture seule
--   · Interrupteurs : tchat public / tchat privé / groupes créés par les utilisateurs / tchat par personne
--   · Aucun message ne peut être modifié ni supprimé (pas de politique UPDATE / DELETE)
--   · Plus de compte partagé ingénieur : un compte sans ingénieur lié ne voit plus aucun dossier
-- À exécuter UNE fois dans Supabase → SQL Editor → Run (après la V18). Additif.
-- ============================================================

-- 1. Réglages
alter table parametres_config add column if not exists chat_public_actif boolean not null default true;
alter table parametres_config add column if not exists chat_prive_actif boolean not null default true;
alter table parametres_config add column if not exists chat_groupes_utilisateurs boolean not null default false;
alter table profiles add column if not exists chat_actif boolean not null default true;

-- 2. Tables
create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('public', 'groupe', 'prive')),
  nom text,
  cree_par uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  dernier_message_at timestamptz not null default now()
);

create table if not exists chat_membres (
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lu_jusqu_a timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists idx_chat_membres_user on chat_membres(user_id);

create table if not exists chat_messages (
  id bigserial primary key,
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  auteur_id uuid references auth.users(id) on delete set null,
  auteur_nom text not null,
  contenu text,
  fichier_chemin text,
  fichier_nom text,
  created_at timestamptz not null default now(),
  check (coalesce(trim(contenu), '') <> '' or fichier_chemin is not null)
);
create index if not exists idx_chat_messages_conv on chat_messages(conversation_id, created_at);

insert into chat_conversations (type, nom)
select 'public', 'Général'
where not exists (select 1 from chat_conversations where type = 'public');

-- 3. Fonctions d'accès
-- Superviseur = admin « pur » (pas un Responsable) : voit tout, invisible
create or replace function fn_chat_superviseur() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and coalesce(fonction, '') <> 'Responsable');
$$;

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
        or (c.type <> 'public' and cfg.chat_prive_actif
            and exists (select 1 from chat_membres m where m.conversation_id = c.id and m.user_id = auth.uid()))
      )
  );
$$;

-- Écrire : mêmes règles, sauf le superviseur qui ne fait que lire
create or replace function fn_chat_peut_ecrire(p_conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not fn_chat_superviseur() and fn_chat_peut_lire(p_conv);
$$;

-- 4. Sécurité (RLS)
alter table chat_conversations enable row level security;
alter table chat_membres enable row level security;
alter table chat_messages enable row level security;

drop policy if exists "chat_conv_lecture" on chat_conversations;
create policy "chat_conv_lecture" on chat_conversations for select using (fn_chat_peut_lire(id));
drop policy if exists "chat_membres_lecture" on chat_membres;
create policy "chat_membres_lecture" on chat_membres for select using (fn_chat_peut_lire(conversation_id));
drop policy if exists "chat_membres_lu" on chat_membres;
create policy "chat_membres_lu" on chat_membres for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "chat_msg_lecture" on chat_messages;
create policy "chat_msg_lecture" on chat_messages for select using (fn_chat_peut_lire(conversation_id));
drop policy if exists "chat_msg_envoi" on chat_messages;
create policy "chat_msg_envoi" on chat_messages for insert with check (auteur_id = auth.uid() and fn_chat_peut_ecrire(conversation_id));
-- Pas de politique UPDATE / DELETE sur chat_messages : personne ne peut modifier ou effacer un message.

create or replace function fn_chat_maj_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update chat_conversations set dernier_message_at = new.created_at where id = new.conversation_id;
  update chat_membres set lu_jusqu_a = new.created_at where conversation_id = new.conversation_id and user_id = new.auteur_id;
  return new;
end;
$$;
drop trigger if exists trg_chat_message on chat_messages;
create trigger trg_chat_message after insert on chat_messages for each row execute function fn_chat_maj_conversation();

-- 5. Annuaire (sans l'admin superviseur, sans les comptes au tchat coupé)
create or replace function fn_chat_annuaire()
returns table (id uuid, nom text, role text, fonction text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.nom_complet, ''), 'Sans nom'), p.role::text, p.fonction
  from profiles p
  where exists (select 1 from profiles moi where moi.id = auth.uid())
    and p.chat_actif
    and not (p.role = 'admin' and coalesce(p.fonction, '') <> 'Responsable')
  order by 2;
$$;

-- 6. Conversations (création contrôlée)
-- Tête-à-tête : retrouve ou crée la conversation entre moi et p_autre
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

-- Groupe ou canal public : par l'admin / un Responsable, ou par tout utilisateur si l'admin l'autorise (groupes)
create or replace function fn_chat_creer(p_type text, p_nom text, p_membres uuid[] default '{}') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_conv uuid;
  v_admin boolean;
  v_cfg parametres_config;
  v_u uuid;
begin
  select * into v_cfg from parametres_config limit 1;
  select role = 'admin' into v_admin from profiles where id = auth.uid();
  if p_type not in ('public', 'groupe') then raise exception 'type_invalide'; end if;
  if coalesce(trim(p_nom), '') = '' then raise exception 'nom_obligatoire'; end if;
  if not coalesce(v_admin, false) and (p_type = 'public' or not v_cfg.chat_groupes_utilisateurs) then
    raise exception 'non_autorise';
  end if;

  insert into chat_conversations (type, nom, cree_par) values (p_type, trim(p_nom), auth.uid()) returning id into v_conv;
  if p_type = 'groupe' then
    if not fn_chat_superviseur() then
      insert into chat_membres (conversation_id, user_id) values (v_conv, auth.uid()) on conflict do nothing;
    end if;
    foreach v_u in array coalesce(p_membres, '{}') loop
      insert into chat_membres (conversation_id, user_id) values (v_conv, v_u) on conflict do nothing;
    end loop;
  end if;
  return v_conv;
end;
$$;

-- Membres d'un groupe / renommage : admin ou Responsable
create or replace function fn_chat_gerer(p_conv uuid, p_action text, p_user uuid default null, p_nom text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then raise exception 'non_autorise'; end if;
  if p_action = 'ajouter' then
    insert into chat_membres (conversation_id, user_id) values (p_conv, p_user) on conflict do nothing;
  elsif p_action = 'retirer' then
    delete from chat_membres where conversation_id = p_conv and user_id = p_user;
  elsif p_action = 'renommer' then
    update chat_conversations set nom = trim(p_nom) where id = p_conv and type <> 'prive';
  else
    raise exception 'action_inconnue';
  end if;
end;
$$;

-- Activer / couper le tchat d'une personne : admin
create or replace function fn_chat_personne(p_user uuid, p_actif boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then raise exception 'non_autorise'; end if;
  update profiles set chat_actif = p_actif where id = p_user;
end;
$$;

-- Liste des personnes pour l'admin (avec l'état de leur tchat)
create or replace function fn_chat_personnes_admin()
returns table (id uuid, nom text, role text, fonction text, chat_actif boolean)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.nom_complet, ''), 'Sans nom'), p.role::text, p.fonction, p.chat_actif
  from profiles p
  where exists (select 1 from profiles moi where moi.id = auth.uid() and moi.role = 'admin')
  order by 2;
$$;

-- 7. Lu / non lus
create or replace function fn_chat_marquer_lu(p_conv uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if fn_chat_superviseur() or not fn_chat_peut_lire(p_conv) then return; end if;
  insert into chat_membres (conversation_id, user_id, lu_jusqu_a) values (p_conv, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set lu_jusqu_a = now();
end;
$$;

create or replace function fn_chat_non_lus()
returns table (conversation_id uuid, non_lus bigint)
language sql stable security definer set search_path = public as $$
  select c.id, count(msg.id)
  from chat_conversations c
  left join chat_membres m on m.conversation_id = c.id and m.user_id = auth.uid()
  join chat_messages msg on msg.conversation_id = c.id
    and msg.created_at > coalesce(m.lu_jusqu_a, (select created_at from auth.users where id = auth.uid()))
    and msg.auteur_id is distinct from auth.uid()
  where not fn_chat_superviseur() and fn_chat_peut_lire(c.id)
  group by c.id;
$$;

grant execute on function fn_chat_superviseur(), fn_chat_peut_lire(uuid), fn_chat_peut_ecrire(uuid), fn_chat_annuaire(),
  fn_chat_ouvrir_prive(uuid), fn_chat_creer(text, text, uuid[]), fn_chat_gerer(uuid, text, uuid, text),
  fn_chat_personne(uuid, boolean), fn_chat_personnes_admin(), fn_chat_marquer_lu(uuid), fn_chat_non_lus() to authenticated;

-- 8. Temps réel (nouveaux messages affichés sans recharger)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table chat_messages;
  end if;
exception when undefined_object then null;
end $$;

-- 9. Fin du compte partagé ingénieur : un compte ingénieur sans nom lié ne voit plus de dossiers
drop policy if exists "dossiers_lecture" on dossiers;
create policy "dossiers_lecture" on dossiers for select using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin', 'qualite')
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
        or lower(p.ingenieur_ref) = lower(dossiers.ingenieur)
        or lower(p.ingenieur_ref) = lower(dossiers.ingenieur_modif)
      )
  )
);

notify pgrst, 'reload schema';
