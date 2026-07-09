ALTER TABLE public.backend_jobs
  DROP CONSTRAINT backend_jobs_kind_check;

ALTER TABLE public.backend_jobs
  ADD CONSTRAINT backend_jobs_kind_check
  CHECK (
    kind = ANY (
      ARRAY[
        'assistant.scheduled_tasks.tick'::text,
        'capability.setup.monday'::text,
        'agent_activity.embedding.generate'::text,
        'profile.learning_review.run'::text,
        'provider.webhook.process'::text,
        'provider.webhook.subscription.reconcile'::text,
        'provider.sync.process'::text
      ]
    )
  );

CREATE TABLE public.profile_learning_review_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id text NOT NULL,
  local_date date NOT NULL,
  window_start_at timestamp with time zone NOT NULL,
  window_end_at timestamp with time zone NOT NULL,
  status text DEFAULT 'running'::text NOT NULL,
  model text NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  finished_at timestamp with time zone,
  summary text,
  error_code text,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT profile_learning_review_runs_window_order_check CHECK (window_start_at < window_end_at),
  CONSTRAINT profile_learning_review_runs_model_not_blank CHECK (length(btrim(model)) > 0),
  CONSTRAINT profile_learning_review_runs_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT profile_learning_review_runs_status_check CHECK (status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text])),
  CONSTRAINT profile_learning_review_runs_finished_shape_check CHECK (((status = 'running'::text) AND (finished_at IS NULL)) OR ((status <> 'running'::text) AND (finished_at IS NOT NULL))),
  CONSTRAINT profile_learning_review_runs_summary_not_blank CHECK ((summary IS NULL) OR (length(btrim(summary)) > 0)),
  CONSTRAINT profile_learning_review_runs_error_code_not_blank CHECK ((error_code IS NULL) OR (length(btrim(error_code)) > 0)),
  CONSTRAINT profile_learning_review_runs_error_message_not_blank CHECK ((error_message IS NULL) OR (length(btrim(error_message)) > 0))
);

ALTER TABLE ONLY public.profile_learning_review_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profile_learning_review_runs OWNER TO postgres;

ALTER TABLE ONLY public.profile_learning_review_runs
  ADD CONSTRAINT profile_learning_review_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profile_learning_review_runs
  ADD CONSTRAINT profile_learning_review_runs_profile_local_date_unique UNIQUE (profile_id, local_date);

ALTER TABLE ONLY public.profile_learning_review_runs
  ADD CONSTRAINT profile_learning_review_runs_profile_id_profiles_id_fk
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX profile_learning_review_runs_profile_created_idx
  ON public.profile_learning_review_runs USING btree (profile_id, created_at DESC);

CREATE INDEX profile_learning_review_runs_profile_status_created_idx
  ON public.profile_learning_review_runs USING btree (profile_id, status, created_at DESC);

CREATE TABLE public.profile_learning_review_candidates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  run_id uuid NOT NULL,
  profile_id text NOT NULL,
  candidate_type text NOT NULL,
  target_kind text NOT NULL,
  target_id text,
  status text DEFAULT 'proposed'::text NOT NULL,
  confidence text NOT NULL,
  proposed_patch jsonb DEFAULT '{}'::jsonb NOT NULL,
  evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
  rationale text NOT NULL,
  applied_at timestamp with time zone,
  applied_reference jsonb DEFAULT '{}'::jsonb NOT NULL,
  failure_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT profile_learning_review_candidates_candidate_type_check CHECK (candidate_type = ANY (ARRAY['memory_create'::text, 'memory_update'::text, 'memory_forget'::text, 'scheduled_task_instructions_update'::text, 'work_route_instructions_update'::text, 'activity_summary_improve'::text, 'no_action'::text])),
  CONSTRAINT profile_learning_review_candidates_target_kind_check CHECK (target_kind = ANY (ARRAY['profile_memory'::text, 'assistant_scheduled_task'::text, 'profile_assistant_work_route'::text, 'agent_activity_entry'::text, 'none'::text])),
  CONSTRAINT profile_learning_review_candidates_status_check CHECK (status = ANY (ARRAY['proposed'::text, 'auto_applied'::text, 'skipped'::text, 'failed'::text])),
  CONSTRAINT profile_learning_review_candidates_confidence_check CHECK (confidence = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])),
  CONSTRAINT profile_learning_review_candidates_target_shape_check CHECK (((target_kind = 'none'::text) AND (target_id IS NULL)) OR ((target_kind <> 'none'::text) AND (target_id IS NOT NULL) AND (length(btrim(target_id)) > 0))),
  CONSTRAINT profile_learning_review_candidates_patch_object_check CHECK (jsonb_typeof(proposed_patch) = 'object'),
  CONSTRAINT profile_learning_review_candidates_evidence_object_check CHECK (jsonb_typeof(evidence) = 'object'),
  CONSTRAINT profile_learning_review_candidates_applied_reference_object_check CHECK (jsonb_typeof(applied_reference) = 'object'),
  CONSTRAINT profile_learning_review_candidates_rationale_not_blank CHECK (length(btrim(rationale)) > 0),
  CONSTRAINT profile_learning_review_candidates_failure_message_not_blank CHECK ((failure_message IS NULL) OR (length(btrim(failure_message)) > 0)),
  CONSTRAINT profile_learning_review_candidates_applied_shape_check CHECK (((status = 'auto_applied'::text) AND (applied_at IS NOT NULL)) OR ((status <> 'auto_applied'::text) AND (applied_at IS NULL)))
);

ALTER TABLE ONLY public.profile_learning_review_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profile_learning_review_candidates OWNER TO postgres;

ALTER TABLE ONLY public.profile_learning_review_candidates
  ADD CONSTRAINT profile_learning_review_candidates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profile_learning_review_candidates
  ADD CONSTRAINT profile_learning_review_candidates_run_id_runs_id_fk
  FOREIGN KEY (run_id) REFERENCES public.profile_learning_review_runs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profile_learning_review_candidates
  ADD CONSTRAINT profile_learning_review_candidates_profile_id_profiles_id_fk
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX profile_learning_review_candidates_run_idx
  ON public.profile_learning_review_candidates USING btree (run_id);

CREATE INDEX profile_learning_review_candidates_profile_created_idx
  ON public.profile_learning_review_candidates USING btree (profile_id, created_at DESC);

CREATE INDEX profile_learning_review_candidates_profile_status_created_idx
  ON public.profile_learning_review_candidates USING btree (profile_id, status, created_at DESC);

CREATE OR REPLACE TRIGGER set_updated_at_profile_learning_review_runs
  BEFORE UPDATE ON public.profile_learning_review_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_profile_learning_review_candidates
  BEFORE UPDATE ON public.profile_learning_review_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profile_learning_review_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_learning_review_candidates ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.profile_learning_review_runs TO service_role;
GRANT ALL ON TABLE public.profile_learning_review_candidates TO service_role;
