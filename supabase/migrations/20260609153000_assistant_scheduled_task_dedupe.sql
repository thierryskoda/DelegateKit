ALTER TABLE public.assistant_scheduled_tasks
  ADD COLUMN dedupe_key text;

ALTER TABLE public.assistant_scheduled_tasks
  ADD CONSTRAINT assistant_scheduled_tasks_dedupe_key_not_blank
  CHECK ((dedupe_key IS NULL) OR (length(btrim(dedupe_key)) > 0));

CREATE UNIQUE INDEX assistant_scheduled_tasks_profile_dedupe_active_unique
  ON public.assistant_scheduled_tasks (profile_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL
    AND status <> 'deleted'::text;
