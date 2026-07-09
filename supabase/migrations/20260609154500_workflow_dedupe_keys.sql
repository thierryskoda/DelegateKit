ALTER TABLE public.workflow_recipes
  ADD COLUMN dedupe_key text;

ALTER TABLE public.workflow_recipes
  ADD CONSTRAINT workflow_recipes_dedupe_key_not_blank
  CHECK ((dedupe_key IS NULL) OR (length(btrim(dedupe_key)) > 0));

CREATE UNIQUE INDEX workflow_recipes_profile_dedupe_active_unique
  ON public.workflow_recipes (profile_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL
    AND status = 'active'::text;

ALTER TABLE public.workflow_runs
  ADD COLUMN dedupe_key text;

ALTER TABLE public.workflow_runs
  ADD CONSTRAINT workflow_runs_dedupe_key_not_blank
  CHECK ((dedupe_key IS NULL) OR (length(btrim(dedupe_key)) > 0));

CREATE UNIQUE INDEX workflow_runs_profile_dedupe_unique
  ON public.workflow_runs (profile_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
