-- Mise à jour n°6 — NDD : quantité nécessaire = volume déstratifié / débit du déstratificateur (toutes opérations).
-- À exécuter UNE FOIS dans Supabase → SQL Editor (sans risque si relancée).
update public.ndd_modeles set taux_brassage = 1 where fiche = 'IND-BA-110' and taux_brassage = 1.3;
-- ancien texte de calcul (« débit minimal requis = volume × taux exigé ») : on reprend le nouveau texte par défaut
update public.ndd_modeles set texte_calcul = null where texte_calcul like 'Le débit minimal requis est égal au volume du local multiplié%';
