DROP FUNCTION IF EXISTS public.claim_assistant_work_item(text, text, text, integer);
DROP FUNCTION IF EXISTS public.claim_assistant_work_item(text, text, text, text, integer);
DROP FUNCTION IF EXISTS public.sweep_stale_assistant_work_items(integer);

DROP INDEX IF EXISTS public.assistant_work_items_due_idx;
CREATE INDEX assistant_work_items_due_idx
  ON public.assistant_work_items
  USING btree (profile_id, status, available_at, priority, created_at)
  WHERE status = 'pending'::text;

ALTER TABLE public.assistant_work_items
  DROP CONSTRAINT IF EXISTS assistant_work_items_claim_policy_check;

ALTER TABLE public.assistant_work_items
  DROP COLUMN IF EXISTS claim_policy;
