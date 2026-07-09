ALTER TABLE public.profile_assistant_work_routes
  ADD COLUMN connected_provider_account_id uuid;

ALTER TABLE public.profile_assistant_work_routes
  ADD CONSTRAINT profile_assistant_work_routes_connected_account_id_fkey
  FOREIGN KEY (connected_provider_account_id)
  REFERENCES public.connected_provider_accounts(id)
  ON DELETE CASCADE;

ALTER TABLE public.profile_assistant_work_routes
  ADD CONSTRAINT profile_assistant_work_routes_connected_account_profile_fk
  FOREIGN KEY (connected_provider_account_id, profile_id)
  REFERENCES public.connected_provider_accounts(id, profile_id);

DROP INDEX public.profile_assistant_work_routes_profile_event_unique;

CREATE UNIQUE INDEX profile_assistant_work_routes_profile_event_default_unique
  ON public.profile_assistant_work_routes (profile_id, event_type)
  WHERE connected_provider_account_id IS NULL;

CREATE UNIQUE INDEX profile_assistant_work_routes_profile_event_account_unique
  ON public.profile_assistant_work_routes (profile_id, event_type, connected_provider_account_id)
  WHERE connected_provider_account_id IS NOT NULL;

CREATE INDEX profile_assistant_work_routes_profile_event_account_idx
  ON public.profile_assistant_work_routes (profile_id, event_type, connected_provider_account_id);
