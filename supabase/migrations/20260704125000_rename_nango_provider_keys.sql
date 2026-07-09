WITH nango_key_map(old_key, new_key) AS (
  VALUES
    ('openclaw-google', 'ai-assistants-google'),
    ('openclaw-outlook', 'ai-assistants-outlook'),
    ('openclaw-monday', 'ai-assistants-monday'),
    ('openclaw-microsoft-onedrive', 'ai-assistants-microsoft-onedrive'),
    ('openclaw-microsoft-sharepoint', 'ai-assistants-microsoft-sharepoint')
)
UPDATE public.connected_provider_accounts account
SET
  nango_provider_config_key = nango_key_map.new_key,
  updated_at = now()
FROM nango_key_map
WHERE account.nango_provider_config_key = nango_key_map.old_key
  AND NOT EXISTS (
    SELECT 1
    FROM public.connected_provider_accounts existing
    WHERE existing.profile_id = account.profile_id
      AND existing.nango_provider_config_key = nango_key_map.new_key
      AND existing.nango_connection_id = account.nango_connection_id
  );

WITH nango_key_map(old_key, new_key) AS (
  VALUES
    ('openclaw-google', 'ai-assistants-google'),
    ('openclaw-outlook', 'ai-assistants-outlook'),
    ('openclaw-monday', 'ai-assistants-monday'),
    ('openclaw-microsoft-onedrive', 'ai-assistants-microsoft-onedrive'),
    ('openclaw-microsoft-sharepoint', 'ai-assistants-microsoft-sharepoint')
)
UPDATE public.capability_account_links link
SET
  config = jsonb_set(
    link.config,
    '{nangoProviderConfigKey}',
    to_jsonb(nango_key_map.new_key),
    false
  ),
  updated_at = now()
FROM nango_key_map
WHERE link.config->>'nangoProviderConfigKey' = nango_key_map.old_key;

WITH nango_key_map(old_key, new_key) AS (
  VALUES
    ('openclaw-google', 'ai-assistants-google'),
    ('openclaw-outlook', 'ai-assistants-outlook'),
    ('openclaw-monday', 'ai-assistants-monday'),
    ('openclaw-microsoft-onedrive', 'ai-assistants-microsoft-onedrive'),
    ('openclaw-microsoft-sharepoint', 'ai-assistants-microsoft-sharepoint')
)
UPDATE public.provider_sandbox_resources resource
SET provider_key = nango_key_map.new_key
FROM nango_key_map
WHERE resource.provider_key = nango_key_map.old_key;

WITH nango_key_map(old_key, new_key) AS (
  VALUES
    ('openclaw-google', 'ai-assistants-google'),
    ('openclaw-outlook', 'ai-assistants-outlook'),
    ('openclaw-monday', 'ai-assistants-monday'),
    ('openclaw-microsoft-onedrive', 'ai-assistants-microsoft-onedrive'),
    ('openclaw-microsoft-sharepoint', 'ai-assistants-microsoft-sharepoint')
)
UPDATE public.provider_sandbox_requests request
SET provider_key = nango_key_map.new_key
FROM nango_key_map
WHERE request.provider_key = nango_key_map.old_key;

WITH nango_key_map(old_key, new_key) AS (
  VALUES
    ('openclaw-google', 'ai-assistants-google'),
    ('openclaw-outlook', 'ai-assistants-outlook'),
    ('openclaw-monday', 'ai-assistants-monday'),
    ('openclaw-microsoft-onedrive', 'ai-assistants-microsoft-onedrive'),
    ('openclaw-microsoft-sharepoint', 'ai-assistants-microsoft-sharepoint')
)
UPDATE public.provider_file_states file_state
SET provider_key = nango_key_map.new_key
FROM nango_key_map
WHERE file_state.provider_key = nango_key_map.old_key;

WITH managed_account_map(old_account_id, new_account_id, new_display_label) AS (
  VALUES
    (
      'openclaw-managed-boldsign',
      'ai-assistants-managed-boldsign',
      'AI Assistants managed BoldSign'
    ),
    (
      'openclaw-managed-twilio-voice',
      'ai-assistants-managed-twilio-voice',
      'AI Assistants managed Twilio Voice'
    ),
    (
      'openclaw-managed-twilio-messaging',
      'ai-assistants-managed-twilio-messaging',
      'AI Assistants managed Twilio Messaging'
    )
)
UPDATE public.connected_provider_accounts account
SET
  provider_account_id = managed_account_map.new_account_id,
  display_label = managed_account_map.new_display_label,
  metadata = jsonb_set(
    account.metadata || jsonb_build_object('managedBy', 'ai-assistants'),
    '{managedBy}',
    to_jsonb('ai-assistants'::text),
    true
  ),
  updated_at = now()
FROM managed_account_map
WHERE account.provider_account_id = managed_account_map.old_account_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.connected_provider_accounts existing
    WHERE existing.profile_id = account.profile_id
      AND existing.provider = account.provider
      AND existing.provider_account_id = managed_account_map.new_account_id
  );

UPDATE public.connected_provider_accounts
SET
  metadata = jsonb_set(
    metadata,
    '{managedBy}',
    to_jsonb('ai-assistants'::text),
    true
  ),
  updated_at = now()
WHERE metadata->>'managedBy' = 'openclaw';
