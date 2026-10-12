-- ============================================================
-- Migration V14 — Listes et statuts modifiables de façon fiable
--   · fn_parametre_liste : ajouter / désactiver / réactiver / supprimer une valeur
--     des listes de Paramètres (contourne les blocages de droits RLS, contrôle le rôle)
--   · Statuts personnalisés (en plus des statuts du circuit, qui restent fixes)
-- À exécuter UNE fois dans Supabase → SQL Editor → Run (après la V13). Additif.
-- Puis : notify pgrst, 'reload schema';
-- ============================================================

alter table parametres_etats add column if not exists personnalise boolean not null default false;
alter table parametres_etats add column if not exists actif boolean default true;

create or replace function fn_parametre_liste(p_table text, p_action text, p_id text default null, p_valeur text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_col text;
  v_n int := 0;
  v_val text := nullif(trim(coalesce(p_valeur, '')), '');
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null or v_role not in ('admin', 'qualite') then
    raise exception 'non_autorise';
  end if;

  v_col := case p_table
    when 'parametres_ingenieurs' then 'nom'
    when 'parametres_clients' then 'nom'
    when 'parametres_validateurs' then 'nom'
    when 'parametres_operations' then 'libelle'
    when 'parametres_causes_retour' then 'libelle'
    when 'parametres_etats' then 'libelle'
  end;
  if v_col is null then
    raise exception 'liste_inconnue';
  end if;
  if v_role <> 'admin' and p_table in ('parametres_ingenieurs', 'parametres_clients', 'parametres_validateurs') then
    raise exception 'reserve_admin';
  end if;

  if p_action = 'ajouter' then
    if v_val is null then
      raise exception 'valeur_vide';
    end if;
    -- Valeur déjà présente (désactivée) : on la réactive
    execute format('update %I set actif = true where %I = $1', p_table, v_col) using v_val;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      if p_table = 'parametres_causes_retour' then
        insert into parametres_causes_retour (libelle, type) values (v_val, 'generique');
      elsif p_table = 'parametres_etats' then
        insert into parametres_etats (libelle, couleur, ordre, personnalise) values (v_val, '#8A96A3', 80, true);
      else
        execute format('insert into %I (%I) values ($1)', p_table, v_col) using v_val;
      end if;
      v_n := 1;
    end if;

  elsif p_action in ('desactiver', 'reactiver') then
    execute format('update %I set actif = $1 where id::text = $2', p_table) using (p_action = 'reactiver'), p_id;
    get diagnostics v_n = row_count;

  elsif p_action = 'supprimer' then
    if p_table = 'parametres_etats' and not exists (select 1 from parametres_etats where id::text = p_id and personnalise) then
      raise exception 'statut_du_circuit';
    end if;
    execute format('delete from %I where id::text = $1', p_table) using p_id;
    get diagnostics v_n = row_count;

  else
    raise exception 'action_inconnue';
  end if;

  return json_build_object('lignes', v_n);
end;
$$;

revoke all on function fn_parametre_liste(text, text, text, text) from public;
grant execute on function fn_parametre_liste(text, text, text, text) to authenticated;
