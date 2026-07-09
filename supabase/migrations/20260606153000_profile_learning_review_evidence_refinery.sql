ALTER TABLE public.profile_learning_review_runs
  DROP CONSTRAINT profile_learning_review_runs_profile_local_date_unique;

ALTER TABLE public.profile_learning_review_runs
  ALTER COLUMN local_date DROP NOT NULL,
  ADD COLUMN review_mode text DEFAULT 'date_replay'::text NOT NULL,
  ADD COLUMN source_window_start_at timestamp with time zone,
  ADD COLUMN source_window_end_at timestamp with time zone,
  ADD COLUMN context_window_start_at timestamp with time zone,
  ADD COLUMN context_window_end_at timestamp with time zone,
  ADD COLUMN processed_source_end_at timestamp with time zone;

UPDATE public.profile_learning_review_runs
SET
  source_window_start_at = window_start_at,
  source_window_end_at = window_end_at,
  context_window_start_at = window_start_at,
  context_window_end_at = window_end_at,
  processed_source_end_at = CASE
    WHEN status = 'succeeded' THEN window_end_at
    ELSE NULL
  END
WHERE source_window_start_at IS NULL;

ALTER TABLE public.profile_learning_review_runs
  ALTER COLUMN source_window_start_at SET NOT NULL,
  ALTER COLUMN source_window_end_at SET NOT NULL,
  ALTER COLUMN context_window_start_at SET NOT NULL,
  ALTER COLUMN context_window_end_at SET NOT NULL,
  ADD CONSTRAINT profile_learning_review_runs_review_mode_check
    CHECK (review_mode = ANY (ARRAY['scheduled_cursor'::text, 'date_replay'::text])),
  ADD CONSTRAINT profile_learning_review_runs_source_window_order_check
    CHECK (source_window_start_at < source_window_end_at),
  ADD CONSTRAINT profile_learning_review_runs_context_window_order_check
    CHECK (context_window_start_at < context_window_end_at),
  ADD CONSTRAINT profile_learning_review_runs_context_contains_source_check
    CHECK (
      context_window_start_at <= source_window_start_at
      AND context_window_end_at >= source_window_end_at
    ),
  ADD CONSTRAINT profile_learning_review_runs_processed_source_shape_check
    CHECK (
      processed_source_end_at IS NULL
      OR (
        processed_source_end_at > source_window_start_at
        AND processed_source_end_at <= source_window_end_at
      )
    ),
  ADD CONSTRAINT profile_learning_review_runs_mode_date_shape_check
    CHECK (
      (review_mode = 'date_replay'::text AND local_date IS NOT NULL)
      OR (review_mode = 'scheduled_cursor'::text)
    );

CREATE UNIQUE INDEX profile_learning_review_runs_profile_date_replay_unique
  ON public.profile_learning_review_runs (profile_id, local_date)
  WHERE review_mode = 'date_replay'::text;

CREATE UNIQUE INDEX profile_learning_review_runs_profile_scheduled_source_end_unique
  ON public.profile_learning_review_runs (profile_id, source_window_end_at)
  WHERE review_mode = 'scheduled_cursor'::text;

CREATE INDEX profile_learning_review_runs_profile_mode_source_end_idx
  ON public.profile_learning_review_runs USING btree (profile_id, review_mode, source_window_end_at DESC);

CREATE TABLE public.profile_learning_review_cursors (
  profile_id text NOT NULL,
  processed_through_at timestamp with time zone NOT NULL,
  last_successful_run_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT profile_learning_review_cursors_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

ALTER TABLE ONLY public.profile_learning_review_cursors FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profile_learning_review_cursors OWNER TO postgres;

ALTER TABLE ONLY public.profile_learning_review_cursors
  ADD CONSTRAINT profile_learning_review_cursors_pkey PRIMARY KEY (profile_id);

ALTER TABLE ONLY public.profile_learning_review_cursors
  ADD CONSTRAINT profile_learning_review_cursors_profile_id_profiles_id_fk
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profile_learning_review_cursors
  ADD CONSTRAINT profile_learning_review_cursors_last_run_id_runs_id_fk
  FOREIGN KEY (last_successful_run_id) REFERENCES public.profile_learning_review_runs(id) ON DELETE SET NULL;

CREATE INDEX profile_learning_review_cursors_processed_through_idx
  ON public.profile_learning_review_cursors USING btree (processed_through_at);

CREATE TABLE public.profile_learning_review_observations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  run_id uuid NOT NULL,
  profile_id text NOT NULL,
  observation_type text NOT NULL,
  target_kind text NOT NULL,
  target_id text,
  statement text NOT NULL,
  confidence text NOT NULL,
  evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
  missing_context text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT profile_learning_review_observations_observation_type_check
    CHECK (
      observation_type = ANY (
        ARRAY[
          'preference'::text,
          'correction'::text,
          'frustration'::text,
          'failure_pattern'::text,
          'instruction_gap'::text,
          'memory_fact'::text,
          'task_need'::text,
          'route_need'::text,
          'prior_outcome'::text,
          'needs_more_context'::text
        ]
      )
    ),
  CONSTRAINT profile_learning_review_observations_target_kind_check
    CHECK (
      target_kind = ANY (
        ARRAY[
          'profile_memory'::text,
          'assistant_scheduled_task'::text,
          'profile_assistant_work_route'::text,
          'agent_activity_entry'::text,
          'profile_guidance'::text,
          'none'::text
        ]
      )
    ),
  CONSTRAINT profile_learning_review_observations_target_shape_check
    CHECK (
      (target_kind = 'none'::text AND target_id IS NULL)
      OR (target_kind <> 'none'::text AND ((target_id IS NULL) OR length(btrim(target_id)) > 0))
    ),
  CONSTRAINT profile_learning_review_observations_statement_not_blank
    CHECK (length(btrim(statement)) > 0),
  CONSTRAINT profile_learning_review_observations_confidence_check
    CHECK (confidence = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])),
  CONSTRAINT profile_learning_review_observations_evidence_object_check
    CHECK (jsonb_typeof(evidence) = 'object'),
  CONSTRAINT profile_learning_review_observations_missing_context_not_blank
    CHECK ((missing_context IS NULL) OR (length(btrim(missing_context)) > 0))
);

ALTER TABLE ONLY public.profile_learning_review_observations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profile_learning_review_observations OWNER TO postgres;

ALTER TABLE ONLY public.profile_learning_review_observations
  ADD CONSTRAINT profile_learning_review_observations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profile_learning_review_observations
  ADD CONSTRAINT profile_learning_review_observations_run_id_runs_id_fk
  FOREIGN KEY (run_id) REFERENCES public.profile_learning_review_runs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profile_learning_review_observations
  ADD CONSTRAINT profile_learning_review_observations_profile_id_profiles_id_fk
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX profile_learning_review_observations_run_idx
  ON public.profile_learning_review_observations USING btree (run_id);

CREATE INDEX profile_learning_review_observations_profile_created_idx
  ON public.profile_learning_review_observations USING btree (profile_id, created_at DESC);

CREATE INDEX profile_learning_review_observations_profile_type_created_idx
  ON public.profile_learning_review_observations USING btree (profile_id, observation_type, created_at DESC);

CREATE INDEX profile_learning_review_observations_profile_target_idx
  ON public.profile_learning_review_observations USING btree (profile_id, target_kind, target_id)
  WHERE target_id IS NOT NULL;

CREATE OR REPLACE TRIGGER set_updated_at_profile_learning_review_cursors
  BEFORE UPDATE ON public.profile_learning_review_cursors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_profile_learning_review_observations
  BEFORE UPDATE ON public.profile_learning_review_observations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profile_learning_review_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_learning_review_observations ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.profile_learning_review_cursors TO service_role;
GRANT ALL ON TABLE public.profile_learning_review_observations TO service_role;
