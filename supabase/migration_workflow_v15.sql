-- ============================================================
-- Migration V15 — Import de la production (dossiers déjà traités)
--   fn_import_referentiels : crée les ingénieurs et les noms « Audité par » absents des listes
--   (appelée par l'import Excel, pour Admin et Qualité). Les noms existants ne sont pas dupliqués.
-- À exécuter UNE fois dans Supabase → SQL Editor → Run (après la V14). Additif.
-- Puis : notify pgrst, 'reload schema';
-- ============================================================

create or replace function fn_import_referentiels(p_ingenieurs text[] default '{}', p_validateurs text[] default '{}')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nom text;
  v_ing int := 0;
  v_val int := 0;
begin
  if not exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'qualite')) then
    raise exception 'non_autorise';
  end if;

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

  foreach v_nom in array coalesce(p_validateurs, '{}') loop
    v_nom := nullif(trim(v_nom), '');
    continue when v_nom is null;
    if not exists (select 1 from parametres_validateurs where lower(nom) = lower(v_nom)) then
      insert into parametres_validateurs (nom, actif) values (v_nom, true);
      v_val := v_val + 1;
    end if;
  end loop;

  return json_build_object('ingenieurs', v_ing, 'validateurs', v_val);
end;
$$;

revoke all on function fn_import_referentiels(text[], text[]) from public;
grant execute on function fn_import_referentiels(text[], text[]) to authenticated;
