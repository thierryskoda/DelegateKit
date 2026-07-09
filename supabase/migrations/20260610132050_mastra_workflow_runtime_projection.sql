CREATE SCHEMA IF NOT EXISTS mastra_runtime;
ALTER SCHEMA mastra_runtime OWNER TO postgres;
GRANT USAGE ON SCHEMA mastra_runtime TO service_role;
GRANT CREATE ON SCHEMA mastra_runtime TO service_role;

ALTER TABLE public.workflow_runs
  ADD COLUMN mastra_workflow_id text,
  ADD COLUMN mastra_run_id text;

UPDATE public.workflow_runs
SET
  mastra_workflow_id = 'ocw_' || replace(id::text, '-', ''),
  mastra_run_id = 'ocr_' || replace(id::text, '-', '')
WHERE mastra_workflow_id IS NULL
  OR mastra_run_id IS NULL;

ALTER TABLE public.workflow_runs
  ALTER COLUMN mastra_workflow_id SET NOT NULL,
  ALTER COLUMN mastra_run_id SET NOT NULL;

ALTER TABLE public.workflow_runs
  ADD CONSTRAINT workflow_runs_mastra_workflow_id_not_blank_check CHECK (length(btrim(mastra_workflow_id)) > 0),
  ADD CONSTRAINT workflow_runs_mastra_run_id_not_blank_check CHECK (length(btrim(mastra_run_id)) > 0),
  ADD CONSTRAINT workflow_runs_mastra_workflow_id_unique UNIQUE (mastra_workflow_id),
  ADD CONSTRAINT workflow_runs_mastra_run_id_unique UNIQUE (mastra_run_id);

CREATE TABLE public.workflow_run_step_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id text NOT NULL,
  workflow_run_id uuid NOT NULL,
  workflow_run_step_id uuid NOT NULL,
  step_key text NOT NULL,
  item_key text NOT NULL,
  item_index integer NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  input jsonb DEFAULT '{}'::jsonb NOT NULL,
  output jsonb,
  error text,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT workflow_run_step_items_error_not_blank_check CHECK ((error IS NULL) OR (length(btrim(error)) > 0)),
  CONSTRAINT workflow_run_step_items_input_object_check CHECK (jsonb_typeof(input) = 'object'::text),
  CONSTRAINT workflow_run_step_items_item_index_nonnegative_check CHECK (item_index >= 0),
  CONSTRAINT workflow_run_step_items_item_key_not_blank_check CHECK (length(btrim(item_key)) > 0),
  CONSTRAINT workflow_run_step_items_output_object_check CHECK ((output IS NULL) OR (jsonb_typeof(output) = 'object'::text)),
  CONSTRAINT workflow_run_step_items_status_check CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])),
  CONSTRAINT workflow_run_step_items_step_key_not_blank_check CHECK (length(btrim(step_key)) > 0),
  CONSTRAINT workflow_run_step_items_terminal_ended_at_check CHECK ((status <> ALL (ARRAY['succeeded'::text, 'failed'::text, 'cancelled'::text])) OR (ended_at IS NOT NULL))
);

ALTER TABLE public.workflow_run_step_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.workflow_run_step_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_run_step_items OWNER TO postgres;

ALTER TABLE ONLY public.workflow_run_step_items
  ADD CONSTRAINT workflow_run_step_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workflow_run_step_items
  ADD CONSTRAINT workflow_run_step_items_step_item_key_unique UNIQUE (workflow_run_step_id, item_key);

ALTER TABLE ONLY public.workflow_run_step_items
  ADD CONSTRAINT workflow_run_step_items_step_item_index_unique UNIQUE (workflow_run_step_id, item_index);

ALTER TABLE ONLY public.workflow_run_step_items
  ADD CONSTRAINT workflow_run_step_items_profile_id_profiles_id_fk
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workflow_run_step_items
  ADD CONSTRAINT workflow_run_step_items_run_id_profile_fk
  FOREIGN KEY (workflow_run_id, profile_id) REFERENCES public.workflow_runs(id, profile_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workflow_run_step_items
  ADD CONSTRAINT workflow_run_step_items_step_id_profile_fk
  FOREIGN KEY (workflow_run_step_id, profile_id) REFERENCES public.workflow_run_steps(id, profile_id) ON DELETE CASCADE;

CREATE INDEX workflow_run_step_items_run_step_status_idx
  ON public.workflow_run_step_items USING btree (workflow_run_id, workflow_run_step_id, status, item_index);

CREATE INDEX workflow_run_step_items_run_step_key_idx
  ON public.workflow_run_step_items USING btree (workflow_run_id, step_key, item_key);

CREATE TRIGGER set_updated_at_workflow_run_step_items
  BEFORE UPDATE ON public.workflow_run_step_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON TABLE public.workflow_run_step_items TO service_role;

INSERT INTO public.workflow_run_step_items (
  profile_id,
  workflow_run_id,
  workflow_run_step_id,
  step_key,
  item_key,
  item_index,
  status,
  input,
  output,
  error,
  started_at,
  ended_at,
  created_at,
  updated_at
)
SELECT
  profile_id,
  workflow_run_id,
  workflow_run_step_id,
  step_key,
  task_key,
  task_index,
  status,
  input,
  output,
  error,
  started_at,
  ended_at,
  created_at,
  updated_at
FROM public.workflow_run_agent_tasks
ON CONFLICT (workflow_run_step_id, item_index) DO NOTHING;
