-- Automated outreach: run recovery-followup hourly via pg_cron + pg_net.
-- NOTE: applied to the live project with the real key in Vault. The repo copy
-- uses a placeholder — set the real value via Vault on any new environment.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- SELECT vault.create_secret('<DECLINE_INTAKE_KEY>', 'decline_intake_key',
--   'Shared secret for the recovery edge functions');

SELECT cron.schedule(
  'recovery-followup-hourly',
  '10 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://sahvfsoclzgsuewbiiah.supabase.co/functions/v1/recovery-followup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-intake-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'decline_intake_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);
