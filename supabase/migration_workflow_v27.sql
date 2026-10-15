-- ============================================================
-- Migration V27 — L'ingénieur peut supprimer ses propres dépôts (livrables)
--   · uniquement les fichiers « livrable » de SES dossiers
--   · uniquement tant que le dossier est en cours chez lui, ou envoyé au contrôle mais pas encore pris par la Qualité
--   (la Qualité et l'admin gardent la suppression de tous les fichiers)
-- À exécuter UNE fois dans Supabase → SQL Editor → Run. Additif.
-- ============================================================
drop policy if exists "fichiers_registre_suppression_ingenieur" on dossier_fichiers;
create policy "fichiers_registre_suppression_ingenieur" on dossier_fichiers for delete using (
  categorie = 'livrable'
  and exists (
    select 1
    from profiles p
    join dossiers d on d.id = dossier_fichiers.dossier_id
    where p.id = auth.uid()
      and p.role = 'ingenieur'
      and lower(p.ingenieur_ref) in (lower(d.ingenieur), lower(coalesce(d.ingenieur_modif, '')))
      and (d.etat = 'Encours' or (d.etat = 'En attente de vérification' and d.pris_en_charge_par is null))
  )
);
notify pgrst, 'reload schema';
