-- Retention job promised in the privacy policy: unconfirmed sign-ups are
-- deleted after 30 days. Requires the pg_cron extension (Supabase dashboard:
-- Database > Extensions > pg_cron, or the statement below).
create extension if not exists pg_cron;

select cron.schedule(
  'purge-unconfirmed-signups',
  '17 3 * * *',
  $$delete from public.signups where not confirmed and created_at < now() - interval '30 days'$$
);
