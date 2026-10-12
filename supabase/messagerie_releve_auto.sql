-- ============================================================
-- (Facultatif) Relève automatique des e-mails du RH toutes les minutes,
-- même quand personne n'a la Messagerie ouverte.
-- Remplacez VOTRE-APP (adresse Vercel) et VOTRE-CLE (= MESSAGERIE_SYNC_CLE dans Vercel), puis Run.
-- Pour arrêter : select cron.unschedule('releve-messagerie-rh');
-- ============================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'releve-messagerie-rh',
  '* * * * *',
  $$ select net.http_get('https://VOTRE-APP.vercel.app/api/messagerie/sync?cle=VOTRE-CLE'); $$
);
