CREATE TABLE IF NOT EXISTS public.browser_tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id text NOT NULL,
  assigned_assistant_id text,
  mode text NOT NULL,
  status text DEFAULT 'queued'::text NOT NULL,
  dedupe_key text NOT NULL,
  goal text NOT NULL,
  summary text,
  note text,
  state jsonb DEFAULT '{}'::jsonb NOT NULL,
  wait jsonb,
  result jsonb,
  revision integer DEFAULT 1 NOT NULL,
  cancel_requested_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT browser_tasks_dedupe_key_not_blank CHECK (length(btrim(dedupe_key)) > 0),
  CONSTRAINT browser_tasks_goal_not_blank CHECK (length(btrim(goal)) > 0),
  CONSTRAINT browser_tasks_mode_check CHECK (mode = ANY (ARRAY[
    'extract'::text,
    'action_prepare'::text,
    'auth_context_setup'::text,
    'live_handoff'::text
  ])),
  CONSTRAINT browser_tasks_note_not_blank CHECK ((note IS NULL) OR (length(btrim(note)) > 0)),
  CONSTRAINT browser_tasks_result_object_check CHECK ((result IS NULL) OR (jsonb_typeof(result) = 'object'::text)),
  CONSTRAINT browser_tasks_revision_positive_check CHECK (revision >= 1),
  CONSTRAINT browser_tasks_state_object_check CHECK (jsonb_typeof(state) = 'object'::text),
  CONSTRAINT browser_tasks_status_check CHECK (status = ANY (ARRAY[
    'queued'::text,
    'running'::text,
    'waiting'::text,
    'blocked'::text,
    'succeeded'::text,
    'failed'::text,
    'cancelled'::text
  ])),
  CONSTRAINT browser_tasks_summary_not_blank CHECK ((summary IS NULL) OR (length(btrim(summary)) > 0)),
  CONSTRAINT browser_tasks_terminal_ended_at_check CHECK ((status <> ALL (ARRAY[
    'succeeded'::text,
    'failed'::text,
    'cancelled'::text
  ])) OR (ended_at IS NOT NULL)),
  CONSTRAINT browser_tasks_wait_object_check CHECK ((wait IS NULL) OR (jsonb_typeof(wait) = 'object'::text))
);

ALTER TABLE public.browser_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.browser_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.browser_tasks OWNER TO postgres;

CREATE TABLE IF NOT EXISTS public.browser_task_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  browser_task_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_type text DEFAULT 'system'::text NOT NULL,
  actor_id text,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT browser_task_events_actor_type_check CHECK (actor_type = ANY (ARRAY[
    'system'::text,
    'assistant'::text,
    'profile'::text,
    'profile_user'::text
  ])),
  CONSTRAINT browser_task_events_event_type_not_blank CHECK (length(btrim(event_type)) > 0),
  CONSTRAINT browser_task_events_payload_object_check CHECK (jsonb_typeof(payload) = 'object'::text)
);

ALTER TABLE public.browser_task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.browser_task_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.browser_task_events OWNER TO postgres;

ALTER TABLE ONLY public.browser_tasks
  ADD CONSTRAINT browser_tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.browser_tasks
  ADD CONSTRAINT browser_tasks_id_profile_unique UNIQUE (id, profile_id);

ALTER TABLE ONLY public.browser_task_events
  ADD CONSTRAINT browser_task_events_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX browser_tasks_profile_dedupe_unique
  ON public.browser_tasks USING btree (profile_id, dedupe_key);

CREATE INDEX browser_tasks_profile_status_idx
  ON public.browser_tasks USING btree (profile_id, status, created_at DESC);

CREATE INDEX browser_task_events_browser_task_created_idx
  ON public.browser_task_events USING btree (browser_task_id, created_at DESC);

CREATE TRIGGER set_updated_at_browser_tasks
  BEFORE UPDATE ON public.browser_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE ONLY public.browser_tasks
  ADD CONSTRAINT browser_tasks_assigned_assistant_id_assistants_assistant_id_fk
  FOREIGN KEY (assigned_assistant_id) REFERENCES public.assistants(assistant_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.browser_tasks
  ADD CONSTRAINT browser_tasks_profile_id_profiles_id_fk
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.browser_task_events
  ADD CONSTRAINT browser_task_events_browser_task_id_browser_tasks_id_fk
  FOREIGN KEY (browser_task_id) REFERENCES public.browser_tasks(id) ON DELETE CASCADE;

ALTER TABLE public.browser_handoffs
  ADD COLUMN browser_task_id uuid;

ALTER TABLE public.browser_handoffs
  ALTER COLUMN task_flow_id DROP NOT NULL;

CREATE INDEX browser_handoffs_browser_task_idx
  ON public.browser_handoffs USING btree (browser_task_id);

ALTER TABLE ONLY public.browser_handoffs
  ADD CONSTRAINT browser_handoffs_browser_task_id_fkey
  FOREIGN KEY (browser_task_id) REFERENCES public.browser_tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.browser_handoffs
  ADD CONSTRAINT browser_handoffs_browser_task_profile_fk
  FOREIGN KEY (browser_task_id, profile_id) REFERENCES public.browser_tasks(id, profile_id);

ALTER TABLE public.artifacts
  ADD COLUMN browser_task_id uuid;

CREATE INDEX artifacts_browser_task_idx
  ON public.artifacts USING btree (browser_task_id);

ALTER TABLE ONLY public.artifacts
  ADD CONSTRAINT artifacts_browser_task_id_browser_tasks_id_fk
  FOREIGN KEY (browser_task_id) REFERENCES public.browser_tasks(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.artifacts
  ADD CONSTRAINT artifacts_browser_task_profile_fk
  FOREIGN KEY (browser_task_id, profile_id) REFERENCES public.browser_tasks(id, profile_id);

GRANT ALL ON TABLE public.browser_tasks TO service_role;
GRANT ALL ON TABLE public.browser_task_events TO service_role;
