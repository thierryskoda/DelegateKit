-- Post-launch forward fix for schema drift: current TypeScript and generated
-- contracts expect assistant work items to declare who may claim them. Existing
-- deployed databases were created before claim_policy was in the applied schema,
-- so add it here instead of editing the initial migration.
ALTER TABLE public.assistant_work_items
  ADD COLUMN IF NOT EXISTS claim_policy text DEFAULT 'any_due_turn'::text NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assistant_work_items_claim_policy_check'
      AND conrelid = 'public.assistant_work_items'::regclass
  ) THEN
    ALTER TABLE public.assistant_work_items
      ADD CONSTRAINT assistant_work_items_claim_policy_check
      CHECK (claim_policy = ANY (ARRAY['any_due_turn'::text, 'heartbeat_only'::text]));
  END IF;
END;
$$;

-- The DB-side claim RPC is the leasing boundary for assistant work items. Recreate
-- it with run_kind so heartbeat-only work can only be claimed by heartbeat runs;
-- otherwise proactive work can be consumed by normal user/cron/manual turns.
CREATE OR REPLACE FUNCTION public.claim_assistant_work_item(
  profile_id text,
  agent_id text,
  session_key text,
  run_kind text DEFAULT 'unknown'::text,
  lease_seconds integer DEFAULT 900
) RETURNS SETOF public.assistant_work_items
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  leased assistant_work_items%ROWTYPE;
BEGIN
  IF profile_id IS NULL OR btrim(profile_id) = '' THEN
    RAISE EXCEPTION 'profile_id is required.';
  END IF;
  IF agent_id IS NULL OR btrim(agent_id) = '' THEN
    RAISE EXCEPTION 'agent_id is required.';
  END IF;
  IF session_key IS NULL OR btrim(session_key) = '' THEN
    RAISE EXCEPTION 'session_key is required.';
  END IF;
  IF run_kind IS NULL OR run_kind <> ALL (ARRAY['heartbeat'::text, 'user'::text, 'cron'::text, 'manual'::text, 'unknown'::text]) THEN
    RAISE EXCEPTION 'run_kind is invalid.';
  END IF;
  IF lease_seconds IS NULL OR lease_seconds <= 0 THEN
    RAISE EXCEPTION 'lease_seconds must be positive.';
  END IF;

  SELECT *
  INTO leased
  FROM assistant_work_items
  WHERE assistant_work_items.profile_id = claim_assistant_work_item.profile_id
    AND status = 'pending'
    AND available_at <= now()
    AND attempts < max_attempts
    AND (origin_agent_id IS NULL OR origin_agent_id = claim_assistant_work_item.agent_id)
    AND (claim_policy <> 'heartbeat_only'::text OR claim_assistant_work_item.run_kind = 'heartbeat'::text)
  ORDER BY priority ASC, created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE assistant_work_items
  SET
    status = 'claimed',
    attempts = leased.attempts + 1,
    claimed_by_agent_id = agent_id,
    claimed_by_session_key = session_key,
    claim_token = gen_random_uuid()::text,
    claim_expires_at = now() + make_interval(secs => lease_seconds),
    claimed_at = now(),
    finished_at = NULL,
    updated_at = now()
  WHERE id = leased.id
  RETURNING * INTO leased;

  RETURN NEXT leased;
END;
$$;

ALTER FUNCTION public.claim_assistant_work_item(text, text, text, text, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_assistant_work_item(text, text, text, text, integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_assistant_work_item(text, text, text, text, integer) TO service_role;

-- Keep the hot pending-work lookup aligned with the new claim policy filter.
DROP INDEX IF EXISTS public.assistant_work_items_due_idx;
CREATE INDEX assistant_work_items_due_idx
  ON public.assistant_work_items
  USING btree (profile_id, status, claim_policy, available_at, priority, created_at)
  WHERE (status = 'pending'::text);
