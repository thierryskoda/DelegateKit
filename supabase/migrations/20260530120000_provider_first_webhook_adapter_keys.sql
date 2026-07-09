WITH adapter_key_map(old_key, new_key) AS (
  VALUES
    ('microsoft.graph.mail', 'outlook_mail.mailbox'),
    ('google.calendar.events', 'google_calendar.events'),
    ('microsoft.graph.calendar', 'outlook_calendar.events')
)
DELETE FROM public.provider_webhook_deliveries old_delivery
USING public.provider_webhook_deliveries new_delivery, adapter_key_map
WHERE old_delivery.adapter_key = adapter_key_map.old_key
  AND new_delivery.adapter_key = adapter_key_map.new_key
  AND old_delivery.provider_key = new_delivery.provider_key
  AND old_delivery.delivery_key = new_delivery.delivery_key
  AND old_delivery.id <> new_delivery.id;

WITH adapter_key_map(old_key, new_key) AS (
  VALUES
    ('microsoft.graph.mail', 'outlook_mail.mailbox'),
    ('google.calendar.events', 'google_calendar.events'),
    ('microsoft.graph.calendar', 'outlook_calendar.events')
)
DELETE FROM public.provider_webhook_subscriptions old_subscription
USING public.provider_webhook_subscriptions new_subscription, adapter_key_map
WHERE old_subscription.adapter_key = adapter_key_map.old_key
  AND new_subscription.adapter_key = adapter_key_map.new_key
  AND old_subscription.connected_provider_account_id =
    new_subscription.connected_provider_account_id
  AND old_subscription.resource_type = new_subscription.resource_type
  AND old_subscription.resource_id = new_subscription.resource_id
  AND old_subscription.event_scope = new_subscription.event_scope
  AND old_subscription.id <> new_subscription.id;

UPDATE public.provider_webhook_subscriptions
SET adapter_key = CASE adapter_key
  WHEN 'microsoft.graph.mail' THEN 'outlook_mail.mailbox'
  WHEN 'google.calendar.events' THEN 'google_calendar.events'
  WHEN 'microsoft.graph.calendar' THEN 'outlook_calendar.events'
  ELSE adapter_key
END
WHERE adapter_key IN (
  'microsoft.graph.mail',
  'google.calendar.events',
  'microsoft.graph.calendar'
);

UPDATE public.provider_webhook_deliveries
SET adapter_key = CASE adapter_key
  WHEN 'microsoft.graph.mail' THEN 'outlook_mail.mailbox'
  WHEN 'google.calendar.events' THEN 'google_calendar.events'
  WHEN 'microsoft.graph.calendar' THEN 'outlook_calendar.events'
  ELSE adapter_key
END
WHERE adapter_key IN (
  'microsoft.graph.mail',
  'google.calendar.events',
  'microsoft.graph.calendar'
);

WITH adapter_key_map(old_key, new_key) AS (
  VALUES
    ('microsoft.graph.mail', 'outlook_mail.mailbox'),
    ('google.calendar.events', 'google_calendar.events'),
    ('microsoft.graph.calendar', 'outlook_calendar.events')
)
DELETE FROM public.backend_jobs old_job
USING public.backend_jobs new_job, adapter_key_map
WHERE old_job.payload->>'adapterKey' = adapter_key_map.old_key
  AND new_job.payload->>'adapterKey' = adapter_key_map.new_key
  AND old_job.status IN ('queued', 'running')
  AND new_job.status IN ('queued', 'running')
  AND old_job.profile_id IS NOT DISTINCT FROM new_job.profile_id
  AND old_job.kind = new_job.kind
  AND old_job.dedupe_key IS NOT NULL
  AND replace(old_job.dedupe_key, adapter_key_map.old_key, adapter_key_map.new_key) =
    new_job.dedupe_key
  AND old_job.id <> new_job.id;

WITH adapter_key_map(old_key, new_key) AS (
  VALUES
    ('microsoft.graph.mail', 'outlook_mail.mailbox'),
    ('google.calendar.events', 'google_calendar.events'),
    ('microsoft.graph.calendar', 'outlook_calendar.events')
)
UPDATE public.backend_jobs
SET
  payload = jsonb_set(payload, '{adapterKey}', to_jsonb(adapter_key_map.new_key::text), false),
  dedupe_key = CASE
    WHEN dedupe_key IS NULL THEN NULL
    ELSE replace(dedupe_key, adapter_key_map.old_key, adapter_key_map.new_key)
  END
FROM adapter_key_map
WHERE payload->>'adapterKey' = adapter_key_map.old_key;

UPDATE public.backend_jobs
SET dedupe_key = replace(dedupe_key, 'outlook-subscription-renew:', 'outlook-mail-subscription-renew:')
WHERE dedupe_key LIKE 'outlook-subscription-renew:%';
