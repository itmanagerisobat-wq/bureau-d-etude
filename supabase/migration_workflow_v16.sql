-- ============================================================
-- Migration V16 — Import de la feuille Production telle quelle
--   · dossiers.date_modification : date de chaque modification
--   · fn_import_referentiels_v2 : crée les ingénieurs, les noms « Validé par » (actifs ou non)
--     et les causes de retour absents des listes, sans doublon (majuscules ignorées)
-- À exécuter UNE fois dans Supabase → SQL Editor → Run. Autonome (n'a pas besoin de la V15).
-- Puis : notify pgrst, 'reload schema';
-- ============================================================

alter table dossiers add column if not exists date_modification date;

create or replace function fn_import_referentiels_v2(
  p_ingenieurs text[] default '{}',
  p_validateurs text[] default '{}',
  p_validateurs_inactifs text[] default '{}',
  p_causes_interne text[] default '{}',
  p_causes_client text[] default '{}'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nom text;
  v_ing int := 0;
  v_val int := 0;
  v_cau int := 0;
begin
  if not exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'qualite')) then
    raise exception 'non_autorise';
  end if;

  -- Ingénieurs
  foreach v_nom in array coalesce(p_ingenieurs, '{}') loop
    v_nom := nullif(trim(v_nom), '');
    continue when v_nom is null;
    if exists (select 1 from parametres_ingenieurs where lower(nom) = lower(v_nom)) then
      update parametres_ingenieurs set actif = true where lower(nom) = lower(v_nom) and actif = false;
    else
      insert into parametres_ingenieurs (nom, actif) values (v_nom, true);
      v_ing := v_ing + 1;
    end if;
  end loop;

  -- Service qualité (membres actifs)
  foreach v_nom in array coalesce(p_validateurs, '{}') loop
    v_nom := nullif(trim(v_nom), '');
    continue when v_nom is null;
    if not exists (select 1 from parametres_validateurs where lower(nom) = lower(v_nom)) then
      insert into parametres_validateurs (nom, actif) values (v_nom, true);
      v_val := v_val + 1;
    end if;
  end loop;

  -- Noms « Validé par » ponctuels : enregistrés mais désactivés (n'apparaissent pas dans les choix)
  foreach v_nom in array coalesce(p_validateurs_inactifs, '{}') loop
    v_nom := nullif(trim(v_nom), '');
    continue when v_nom is null;
    if not exists (select 1 from parametres_validateurs where lower(nom) = lower(v_nom)) then
      insert into parametres_validateurs (nom, actif) values (v_nom, false);
      v_val := v_val + 1;
    end if;
  end loop;

  -- Causes de retour
  foreach v_nom in array coalesce(p_causes_interne, '{}') loop
    v_nom := nullif(trim(v_nom), '');
    continue when v_nom is null;
    if not exists (select 1 from parametres_causes_retour where lower(libelle) = lower(v_nom)) then
      insert into parametres_causes_retour (libelle, type) values (v_nom, 'interne');
      v_cau := v_cau + 1;
    end if;
  end loop;
  foreach v_nom in array coalesce(p_causes_client, '{}') loop
    v_nom := nullif(trim(v_nom), '');
    continue when v_nom is null;
    if not exists (select 1 from parametres_causes_retour where lower(libelle) = lower(v_nom)) then
      insert into parametres_causes_retour (libelle, type) values (v_nom, 'client');
      v_cau := v_cau + 1;
    end if;
  end loop;

  return json_build_object('ingenieurs', v_ing, 'validateurs', v_val, 'causes', v_cau);
end;
$$;

revoke all on function fn_import_referentiels_v2(text[], text[], text[], text[], text[]) from public;
grant execute on function fn_import_referentiels_v2(text[], text[], text[], text[], text[]) to authenticated;
