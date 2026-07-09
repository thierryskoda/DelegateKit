CREATE TABLE IF NOT EXISTS public.workflow_recipes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id text NOT NULL,
  title text NOT NULL,
  objective text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  steps jsonb DEFAULT '[]'::jsonb NOT NULL,
  revision integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT workflow_recipes_objective_not_blank CHECK (length(btrim(objective)) > 0),
  CONSTRAINT workflow_recipes_revision_positive_check CHECK (revision >= 1),
  CONSTRAINT workflow_recipes_status_check CHECK (status = ANY (ARRAY['active'::text, 'archived'::text])),
  CONSTRAINT workflow_recipes_steps_array_check CHECK (jsonb_typeof(steps) = 'array'::text),
  CONSTRAINT workflow_recipes_title_not_blank CHECK (length(btrim(title)) > 0)
);

ALTER TABLE public.workflow_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.workflow_recipes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_recipes OWNER TO postgres;

CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id text NOT NULL,
  workflow_recipe_id uuid NOT NULL,
  status text DEFAULT 'running'::text NOT NULL,
  input jsonb DEFAULT '{}'::jsonb NOT NULL,
  result jsonb,
  current_step_index integer DEFAULT 0 NOT NULL,
  revision integer DEFAULT 1 NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  ended_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT workflow_runs_current_step_index_nonnegative_check CHECK (current_step_index >= 0),
  CONSTRAINT workflow_runs_input_object_check CHECK (jsonb_typeof(input) = 'object'::text),
  CONSTRAINT workflow_runs_result_object_check CHECK ((result IS NULL) OR (jsonb_typeof(result) = 'object'::text)),
  CONSTRAINT workflow_runs_revision_positive_check CHECK (revision >= 1),
  CONSTRAINT workflow_runs_status_check CHECK (status = ANY (ARRAY['running'::text, 'waiting'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])),
  CONSTRAINT workflow_runs_terminal_ended_at_check CHECK ((status <> ALL (ARRAY['succeeded'::text, 'failed'::text, 'cancelled'::text])) OR (ended_at IS NOT NULL))
);

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.workflow_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs OWNER TO postgres;

CREATE TABLE IF NOT EXISTS public.workflow_run_steps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id text NOT NULL,
  workflow_run_id uuid NOT NULL,
  step_index integer NOT NULL,
  step jsonb NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  output jsonb,
  error text,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT workflow_run_steps_index_nonnegative_check CHECK (step_index >= 0),
  CONSTRAINT workflow_run_steps_output_object_check CHECK ((output IS NULL) OR (jsonb_typeof(output) = 'object'::text)),
  CONSTRAINT workflow_run_steps_status_check CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'waiting'::text, 'succeeded'::text, 'failed'::text, 'skipped'::text])),
  CONSTRAINT workflow_run_steps_step_object_check CHECK (jsonb_typeof(step) = 'object'::text),
  CONSTRAINT workflow_run_steps_terminal_ended_at_check CHECK ((status <> ALL (ARRAY['succeeded'::text, 'failed'::text, 'skipped'::text])) OR (ended_at IS NOT NULL))
);

ALTER TABLE public.workflow_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.workflow_run_steps FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_run_steps OWNER TO postgres;

ALTER TABLE ONLY public.workflow_recipes
  ADD CONSTRAINT workflow_recipes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workflow_recipes
  ADD CONSTRAINT workflow_recipes_id_profile_unique UNIQUE (id, profile_id);

ALTER TABLE ONLY public.workflow_runs
  ADD CONSTRAINT workflow_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workflow_runs
  ADD CONSTRAINT workflow_runs_id_profile_unique UNIQUE (id, profile_id);

ALTER TABLE ONLY public.workflow_run_steps
  ADD CONSTRAINT workflow_run_steps_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workflow_run_steps
  ADD CONSTRAINT workflow_run_steps_run_index_unique UNIQUE (workflow_run_id, step_index);

CREATE INDEX workflow_recipes_profile_status_idx
  ON public.workflow_recipes USING btree (profile_id, status, updated_at DESC);

CREATE INDEX workflow_runs_profile_status_idx
  ON public.workflow_runs USING btree (profile_id, status, updated_at DESC);

CREATE INDEX workflow_runs_recipe_idx
  ON public.workflow_runs USING btree (workflow_recipe_id, created_at DESC);

CREATE INDEX workflow_run_steps_run_idx
  ON public.workflow_run_steps USING btree (workflow_run_id, step_index);

CREATE TRIGGER set_updated_at_workflow_recipes
  BEFORE UPDATE ON public.workflow_recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_workflow_runs
  BEFORE UPDATE ON public.workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_workflow_run_steps
  BEFORE UPDATE ON public.workflow_run_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE ONLY public.workflow_recipes
  ADD CONSTRAINT workflow_recipes_profile_id_profiles_id_fk
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workflow_runs
  ADD CONSTRAINT workflow_runs_profile_id_profiles_id_fk
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workflow_runs
  ADD CONSTRAINT workflow_runs_recipe_id_profile_fk
  FOREIGN KEY (workflow_recipe_id, profile_id) REFERENCES public.workflow_recipes(id, profile_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workflow_run_steps
  ADD CONSTRAINT workflow_run_steps_profile_id_profiles_id_fk
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workflow_run_steps
  ADD CONSTRAINT workflow_run_steps_run_id_profile_fk
  FOREIGN KEY (workflow_run_id, profile_id) REFERENCES public.workflow_runs(id, profile_id) ON DELETE CASCADE;

GRANT ALL ON TABLE public.workflow_recipes TO service_role;
GRANT ALL ON TABLE public.workflow_runs TO service_role;
GRANT ALL ON TABLE public.workflow_run_steps TO service_role;
