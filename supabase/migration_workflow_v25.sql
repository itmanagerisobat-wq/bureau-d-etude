-- ============================================================
-- Migration V25 — Remplir les listes Ingénieurs et Service qualité depuis les comptes
--   · fn_remplir_listes_depuis_comptes() (admin) :
--       - chaque compte Ingénieur → liste Ingénieurs (nom lié au compte, sinon nom complet) ; un compte
--         ingénieur sans nom lié est relié à son nom complet
--       - chaque compte Qualité → liste Service qualité
--     Les noms déjà présents sont réactivés s'ils étaient désactivés (majuscules ignorées). Rien n'est supprimé.
-- À exécuter UNE fois dans Supabase → SQL Editor → Run. Additif.
-- ============================================================

create or replace function fn_remplir_listes_depuis_comptes()
returns json
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_nom text;
  v_ing int := 0;
  v_ing_reac int := 0;
  v_val int := 0;
  v_val_reac int := 0;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then raise exception 'reserve_admin'; end if;

  for r in select id, nom_complet, ingenieur_ref from profiles where role = 'ingenieur' loop
    v_nom := nullif(trim(coalesce(nullif(trim(r.ingenieur_ref), ''), r.nom_complet)), '');
    continue when v_nom is null;
    if exists (select 1 from parametres_ingenieurs where lower(nom) = lower(v_nom)) then
      update parametres_ingenieurs set actif = true where lower(nom) = lower(v_nom) and actif = false;
      if found then v_ing_reac := v_ing_reac + 1; end if;
      select nom into v_nom from parametres_ingenieurs where lower(nom) = lower(v_nom) limit 1;
    else
      insert into parametres_ingenieurs (nom, actif) values (v_nom, true);
      v_ing := v_ing + 1;
    end if;
    if coalesce(trim(r.ingenieur_ref), '') = '' then
      update profiles set ingenieur_ref = v_nom where id = r.id;
    end if;
  end loop;

  for r in select nom_complet from profiles where role = 'qualite' and coalesce(trim(nom_complet), '') <> '' loop
    v_nom := trim(r.nom_complet);
    if exists (select 1 from parametres_validateurs where lower(nom) = lower(v_nom)) then
      update parametres_validateurs set actif = true where lower(nom) = lower(v_nom) and actif = false;
      if found then v_val_reac := v_val_reac + 1; end if;
    else
      insert into parametres_validateurs (nom, actif) values (v_nom, true);
      v_val := v_val + 1;
    end if;
  end loop;

  return json_build_object('ingenieurs_ajoutes', v_ing, 'ingenieurs_reactives', v_ing_reac,
                           'qualite_ajoutes', v_val, 'qualite_reactives', v_val_reac);
end;
$$;
grant execute on function fn_remplir_listes_depuis_comptes() to authenticated;
notify pgrst, 'reload schema';
