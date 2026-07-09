ALTER TABLE public.workflow_runs
  ADD COLUMN agent_id text;

UPDATE public.workflow_runs run
SET agent_id = assistant.assistant_id
FROM public.assistants assistant
WHERE assistant.profile_id = run.profile_id
  AND run.agent_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.workflow_runs
    WHERE agent_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot backfill workflow_runs.agent_id because at least one workflow run profile has no assistant.';
  END IF;
END $$;

ALTER TABLE public.workflow_runs
  ALTER COLUMN agent_id SET NOT NULL;

ALTER TABLE ONLY public.workflow_runs
  ADD CONSTRAINT workflow_runs_agent_profile_fk
  FOREIGN KEY (agent_id, profile_id) REFERENCES public.assistants(assistant_id, profile_id);

ALTER TABLE ONLY public.workflow_run_steps
  ADD CONSTRAINT workflow_run_steps_id_profile_unique UNIQUE (id, profile_id);

CREATE TABLE public.workflow_run_agent_tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id text NOT NULL,
  workflow_run_id uuid NOT NULL,
  workflow_run_step_id uuid NOT NULL,
  step_key text NOT NULL,
  task_key text NOT NULL,
  task_index integer NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  input jsonb DEFAULT '{}'::jsonb NOT NULL,
  output jsonb,
  error text,
  attempts integer DEFAULT 0 NOT NULL,
  max_attempts integer DEFAULT 2 NOT NULL,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT workflow_run_agent_tasks_attempts_check CHECK (attempts >= 0 AND max_attempts >= 1 AND attempts <= max_attempts),
  CONSTRAINT workflow_run_agent_tasks_error_not_blank_check CHECK ((error IS NULL) OR (length(btrim(error)) > 0)),
  CONSTRAINT workflow_run_agent_tasks_input_object_check CHECK (jsonb_typeof(input) = 'object'::text),
  CONSTRAINT workflow_run_agent_tasks_key_not_blank_check CHECK (length(btrim(task_key)) > 0),
  CONSTRAINT workflow_run_agent_tasks_output_object_check CHECK ((output IS NULL) OR (jsonb_typeof(output) = 'object'::text)),
  CONSTRAINT workflow_run_agent_tasks_status_check CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])),
  CONSTRAINT workflow_run_agent_tasks_step_key_not_blank_check CHECK (length(btrim(step_key)) > 0),
  CONSTRAINT workflow_run_agent_tasks_terminal_ended_at_check CHECK ((status <> ALL (ARRAY['succeeded'::text, 'failed'::text, 'cancelled'::text])) OR (ended_at IS NOT NULL)),
  CONSTRAINT workflow_run_agent_tasks_index_nonnegative_check CHECK (task_index >= 0)
);

ALTER TABLE public.workflow_run_agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.workflow_run_agent_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_run_agent_tasks OWNER TO postgres;

ALTER TABLE ONLY public.workflow_run_agent_tasks
  ADD CONSTRAINT workflow_run_agent_tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workflow_run_agent_tasks
  ADD CONSTRAINT workflow_run_agent_tasks_step_task_key_unique UNIQUE (workflow_run_step_id, task_key);

ALTER TABLE ONLY public.workflow_run_agent_tasks
  ADD CONSTRAINT workflow_run_agent_tasks_step_task_index_unique UNIQUE (workflow_run_step_id, task_index);

ALTER TABLE ONLY public.workflow_run_agent_tasks
  ADD CONSTRAINT workflow_run_agent_tasks_profile_id_profiles_id_fk
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workflow_run_agent_tasks
  ADD CONSTRAINT workflow_run_agent_tasks_run_id_profile_fk
  FOREIGN KEY (workflow_run_id, profile_id) REFERENCES public.workflow_runs(id, profile_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workflow_run_agent_tasks
  ADD CONSTRAINT workflow_run_agent_tasks_step_id_profile_fk
  FOREIGN KEY (workflow_run_step_id, profile_id) REFERENCES public.workflow_run_steps(id, profile_id) ON DELETE CASCADE;

CREATE INDEX workflow_run_agent_tasks_run_step_status_idx
  ON public.workflow_run_agent_tasks USING btree (workflow_run_id, workflow_run_step_id, status, task_index);

CREATE INDEX workflow_run_agent_tasks_run_step_key_idx
  ON public.workflow_run_agent_tasks USING btree (workflow_run_id, step_key, task_key);

CREATE TRIGGER set_updated_at_workflow_run_agent_tasks
  BEFORE UPDATE ON public.workflow_run_agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON TABLE public.workflow_run_agent_tasks TO service_role;

CREATE OR REPLACE FUNCTION public.workflow_agent_step_from_legacy(step jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT
    CASE
      WHEN step ? 'kind' THEN step
      ELSE jsonb_strip_nulls(jsonb_build_object(
        'kind', 'agent',
        'stepKey', step ->> 'stepKey',
        'title', step ->> 'title',
        'agent', jsonb_build_object(
          'systemPrompt', COALESCE(NULLIF(step ->> 'instructions', ''), 'Complete this workflow step and return structured JSON.'),
          'tools',
            CASE
              WHEN step ? 'expectedToolName'
                AND step ->> 'expectedToolName' IS NOT NULL
                AND btrim(step ->> 'expectedToolName') <> ''
              THEN jsonb_build_array(step ->> 'expectedToolName')
              ELSE '[]'::jsonb
            END,
          'outputSchema', COALESCE(
            step -> 'outputSchema',
            jsonb_build_object(
              'type', 'object',
              'description', 'Structured workflow step output.'
            )
          ),
          'maxTurns', 20
        ),
        'resumeSchema', step -> 'resumeSchema',
        'stopOnFailure', COALESCE((step ->> 'stopOnFailure')::boolean, true)
      ))
    END
$function$;

UPDATE public.workflow_recipes
SET steps = (
  SELECT jsonb_agg(public.workflow_agent_step_from_legacy(step) ORDER BY ordinality)
  FROM jsonb_array_elements(steps) WITH ORDINALITY AS items(step, ordinality)
)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(steps) AS items(step)
  WHERE NOT (step ? 'kind')
);

UPDATE public.workflow_run_steps
SET step = public.workflow_agent_step_from_legacy(step)
WHERE NOT (step ? 'kind');

DROP FUNCTION public.workflow_agent_step_from_legacy(jsonb);

ALTER TABLE public.backend_jobs
  DROP CONSTRAINT backend_jobs_kind_check;

ALTER TABLE public.backend_jobs
  ADD CONSTRAINT backend_jobs_kind_check
  CHECK (
    kind = ANY (
      ARRAY[
        'assistant.scheduled_tasks.tick'::text,
        'capability.setup.monday'::text,
        'profile.learning_review.run'::text,
        'provider.webhook.process'::text,
        'provider.webhook.subscription.reconcile'::text,
        'provider.sync.process'::text,
        'workflow.run.continue'::text
      ]
    )
  );
