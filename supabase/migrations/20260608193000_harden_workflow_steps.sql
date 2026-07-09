ALTER TABLE public.workflow_run_steps
  ADD COLUMN IF NOT EXISTS step_key text,
  ADD COLUMN IF NOT EXISTS wait jsonb,
  ADD COLUMN IF NOT EXISTS resume_input jsonb;

UPDATE public.workflow_run_steps
SET step_key = COALESCE(NULLIF(btrim(step ->> 'stepKey'), ''), 'step-' || (step_index + 1)::text)
WHERE step_key IS NULL;

ALTER TABLE public.workflow_run_steps
  ALTER COLUMN step_key SET NOT NULL;

ALTER TABLE public.workflow_run_steps
  ADD CONSTRAINT workflow_run_steps_step_key_not_blank_check
  CHECK (length(btrim(step_key)) > 0);

ALTER TABLE public.workflow_run_steps
  ADD CONSTRAINT workflow_run_steps_wait_object_check
  CHECK ((wait IS NULL) OR (jsonb_typeof(wait) = 'object'::text));

ALTER TABLE public.workflow_run_steps
  ADD CONSTRAINT workflow_run_steps_resume_input_object_check
  CHECK ((resume_input IS NULL) OR (jsonb_typeof(resume_input) = 'object'::text));

ALTER TABLE ONLY public.workflow_run_steps
  ADD CONSTRAINT workflow_run_steps_run_step_key_unique UNIQUE (workflow_run_id, step_key);

CREATE INDEX workflow_run_steps_run_step_key_idx
  ON public.workflow_run_steps USING btree (workflow_run_id, step_key);

ALTER TABLE public.workflow_runs
  ADD COLUMN IF NOT EXISTS origin_scheduled_task_id uuid;

ALTER TABLE ONLY public.workflow_runs
  ADD CONSTRAINT workflow_runs_origin_scheduled_task_profile_fk
  FOREIGN KEY (origin_scheduled_task_id, profile_id)
  REFERENCES public.assistant_scheduled_tasks(id, profile_id);

CREATE INDEX workflow_runs_origin_scheduled_task_idx
  ON public.workflow_runs USING btree (origin_scheduled_task_id, started_at DESC)
  WHERE origin_scheduled_task_id IS NOT NULL;

ALTER TABLE public.assistant_scheduled_tasks
  ADD COLUMN IF NOT EXISTS target jsonb DEFAULT '{"kind":"assistant_instructions"}'::jsonb NOT NULL;

ALTER TABLE public.assistant_scheduled_tasks
  ADD CONSTRAINT assistant_scheduled_tasks_target_object_check
  CHECK (jsonb_typeof(target) = 'object'::text);

ALTER TABLE public.assistant_scheduled_tasks
  ADD CONSTRAINT assistant_scheduled_tasks_target_kind_check
  CHECK ((target ->> 'kind') = ANY (ARRAY['assistant_instructions'::text, 'workflow_recipe'::text]));
