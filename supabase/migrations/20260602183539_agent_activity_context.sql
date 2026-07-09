CREATE EXTENSION IF NOT EXISTS "vector";

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
        'provider.webhook.process'::text,
        'provider.webhook.subscription.reconcile'::text,
        'provider.sync.process'::text
      ]
    )
  );

CREATE TABLE public.agent_activity_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id text NOT NULL,
  event_type text NOT NULL,
  source_kind text NOT NULL,
  source_id text NOT NULL,
  occurred_at timestamp with time zone NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  search_text text NOT NULL,
  reference_keys text[] DEFAULT '{}'::text[] NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  embedding vector(1536),
  embedding_model text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT agent_activity_entries_event_type_not_blank CHECK (length(btrim(event_type)) > 0),
  CONSTRAINT agent_activity_entries_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT agent_activity_entries_search_text_not_blank CHECK (length(btrim(search_text)) > 0),
  CONSTRAINT agent_activity_entries_source_id_not_blank CHECK (length(btrim(source_id)) > 0),
  CONSTRAINT agent_activity_entries_source_kind_not_blank CHECK (length(btrim(source_kind)) > 0),
  CONSTRAINT agent_activity_entries_summary_not_blank CHECK (length(btrim(summary)) > 0),
  CONSTRAINT agent_activity_entries_title_not_blank CHECK (length(btrim(title)) > 0)
);

ALTER TABLE ONLY public.agent_activity_entries FORCE ROW LEVEL SECURITY;

ALTER TABLE public.agent_activity_entries OWNER TO postgres;

ALTER TABLE ONLY public.agent_activity_entries
  ADD CONSTRAINT agent_activity_entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.agent_activity_entries
  ADD CONSTRAINT agent_activity_entries_profile_source_event_unique
  UNIQUE (profile_id, source_kind, source_id, event_type);

ALTER TABLE ONLY public.agent_activity_entries
  ADD CONSTRAINT agent_activity_entries_profile_id_profiles_id_fk
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX agent_activity_entries_embedding_idx
  ON public.agent_activity_entries
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE INDEX agent_activity_entries_event_type_idx
  ON public.agent_activity_entries
  USING btree (profile_id, event_type, occurred_at DESC);

CREATE INDEX agent_activity_entries_occurred_idx
  ON public.agent_activity_entries
  USING btree (profile_id, occurred_at DESC);

CREATE INDEX agent_activity_entries_reference_keys_idx
  ON public.agent_activity_entries
  USING gin (reference_keys);

CREATE INDEX agent_activity_entries_search_text_idx
  ON public.agent_activity_entries
  USING gin (to_tsvector('simple'::regconfig, search_text));

CREATE OR REPLACE FUNCTION public.search_agent_activity_entries(
  p_profile_id text,
  p_query_text text DEFAULT NULL::text,
  p_query_embedding vector(1536) DEFAULT NULL::vector,
  p_event_types text[] DEFAULT NULL::text[],
  p_source_kinds text[] DEFAULT NULL::text[],
  p_reference_keys text[] DEFAULT NULL::text[],
  p_since timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_until timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_limit integer DEFAULT 10
) RETURNS TABLE (
  id uuid,
  event_type text,
  source_kind text,
  source_id text,
  occurred_at timestamp with time zone,
  title text,
  summary text,
  reference_keys text[],
  metadata jsonb,
  text_rank real,
  vector_distance double precision
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH normalized AS (
    SELECT
      NULLIF(btrim(p_query_text), '') AS query_text,
      LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50) AS row_limit
  ),
  candidates AS (
    SELECT
      entry.id,
      entry.event_type,
      entry.source_kind,
      entry.source_id,
      entry.occurred_at,
      entry.title,
      entry.summary,
      entry.reference_keys,
      entry.metadata,
      CASE
        WHEN normalized.query_text IS NULL THEN 0::real
        ELSE ts_rank_cd(
          to_tsvector('simple'::regconfig, entry.search_text),
          websearch_to_tsquery('simple'::regconfig, normalized.query_text)
        )
      END AS text_rank,
      CASE
        WHEN p_query_embedding IS NULL OR entry.embedding IS NULL THEN 1e9::double precision
        ELSE entry.embedding <=> p_query_embedding
      END AS vector_distance,
      p_reference_keys IS NOT NULL AND entry.reference_keys && p_reference_keys AS reference_match
    FROM public.agent_activity_entries entry
    CROSS JOIN normalized
    WHERE entry.profile_id = p_profile_id
      AND (p_event_types IS NULL OR entry.event_type = ANY (p_event_types))
      AND (p_source_kinds IS NULL OR entry.source_kind = ANY (p_source_kinds))
      AND (p_reference_keys IS NULL OR entry.reference_keys && p_reference_keys)
      AND (p_since IS NULL OR entry.occurred_at >= p_since)
      AND (p_until IS NULL OR entry.occurred_at <= p_until)
      AND (
        normalized.query_text IS NULL
        OR (p_query_embedding IS NOT NULL AND entry.embedding IS NOT NULL)
        OR to_tsvector('simple'::regconfig, entry.search_text) @@ websearch_to_tsquery('simple'::regconfig, normalized.query_text)
      )
  )
  SELECT
    candidates.id,
    candidates.event_type,
    candidates.source_kind,
    candidates.source_id,
    candidates.occurred_at,
    candidates.title,
    candidates.summary,
    candidates.reference_keys,
    candidates.metadata,
    candidates.text_rank,
    candidates.vector_distance
  FROM candidates
  ORDER BY
    candidates.reference_match DESC,
    (candidates.text_rank > 0::real) DESC,
    candidates.text_rank DESC,
    candidates.vector_distance ASC NULLS LAST,
    candidates.occurred_at DESC
  LIMIT (SELECT row_limit FROM normalized);
$$;

ALTER FUNCTION public.search_agent_activity_entries(
  text,
  text,
  vector(1536),
  text[],
  text[],
  text[],
  timestamp with time zone,
  timestamp with time zone,
  integer
) OWNER TO postgres;

ALTER TABLE public.agent_activity_entries ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.agent_activity_entries TO service_role;
REVOKE ALL ON FUNCTION public.search_agent_activity_entries(
  text,
  text,
  vector(1536),
  text[],
  text[],
  text[],
  timestamp with time zone,
  timestamp with time zone,
  integer
) FROM PUBLIC;
GRANT ALL ON FUNCTION public.search_agent_activity_entries(
  text,
  text,
  vector(1536),
  text[],
  text[],
  text[],
  timestamp with time zone,
  timestamp with time zone,
  integer
) TO service_role;
