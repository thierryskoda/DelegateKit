-- Sweep stale assistant work item queue states independently from the claim
-- boundary. Claiming remains a narrow lease operation; maintenance requeues
-- expired claims that still have attempts and fails rows that cannot be
-- claimed again.
CREATE OR REPLACE FUNCTION public.sweep_stale_assistant_work_items(
  batch_limit integer DEFAULT 50
) RETURNS SETOF public.assistant_work_items
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF batch_limit IS NULL OR batch_limit <= 0 THEN
    RAISE EXCEPTION 'batch_limit must be positive.';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT *
    FROM assistant_work_items
    WHERE
      (
        status = 'claimed'
        AND claim_expires_at <= now()
      )
      OR (
        status = 'pending'
        AND attempts >= max_attempts
      )
    ORDER BY
      CASE
        WHEN status = 'claimed' THEN claim_expires_at
        ELSE available_at
      END ASC,
      created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT batch_limit
  ),
  updated AS (
    UPDATE assistant_work_items AS work_item
    SET
      status = CASE
        WHEN candidates.status = 'claimed' AND candidates.attempts < candidates.max_attempts THEN 'pending'
        ELSE 'failed'
      END,
      last_error = COALESCE(
        work_item.last_error,
        CASE
          WHEN candidates.status = 'claimed' AND candidates.attempts < candidates.max_attempts
            THEN 'assistant_work_item_claim_expired_requeued'
          WHEN candidates.status = 'claimed'
            THEN 'assistant_work_item_claim_expired_failed'
          ELSE 'assistant_work_item_pending_attempts_exhausted'
        END
      ),
      claim_token = NULL,
      claim_expires_at = NULL,
      claimed_by_agent_id = NULL,
      claimed_by_session_key = NULL,
      claimed_at = CASE
        WHEN candidates.status = 'claimed' AND candidates.attempts < candidates.max_attempts THEN NULL
        ELSE work_item.claimed_at
      END,
      available_at = CASE
        WHEN candidates.status = 'claimed' AND candidates.attempts < candidates.max_attempts THEN now()
        ELSE work_item.available_at
      END,
      finished_at = CASE
        WHEN candidates.status = 'claimed' AND candidates.attempts < candidates.max_attempts THEN NULL
        ELSE now()
      END,
      updated_at = now()
    FROM candidates
    WHERE work_item.id = candidates.id
    RETURNING work_item.*
  )
  SELECT * FROM updated;
END;
$$;

ALTER FUNCTION public.sweep_stale_assistant_work_items(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sweep_stale_assistant_work_items(integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sweep_stale_assistant_work_items(integer) TO service_role;
