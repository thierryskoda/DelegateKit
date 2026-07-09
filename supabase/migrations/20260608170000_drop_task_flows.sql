ALTER TABLE public.artifacts
  DROP CONSTRAINT IF EXISTS artifacts_task_flow_profile_fk,
  DROP CONSTRAINT IF EXISTS artifacts_task_flow_id_task_flows_id_fk;

ALTER TABLE public.assistant_work_items
  DROP CONSTRAINT IF EXISTS assistant_work_items_origin_task_flow_profile_fk;

ALTER TABLE public.backend_jobs
  DROP CONSTRAINT IF EXISTS backend_jobs_origin_task_flow_profile_fk,
  DROP CONSTRAINT IF EXISTS backend_jobs_origin_task_flow_id_task_flows_id_fk;

ALTER TABLE public.profile_actions
  DROP CONSTRAINT IF EXISTS profile_actions_task_flow_profile_fk,
  DROP CONSTRAINT IF EXISTS profile_actions_task_flow_id_task_flows_id_fk;

ALTER TABLE public.profile_proposals
  DROP CONSTRAINT IF EXISTS profile_proposals_source_task_flow_id_fk;

ALTER TABLE public.browser_handoffs
  DROP CONSTRAINT IF EXISTS browser_handoffs_task_flow_id_fkey;

DROP INDEX IF EXISTS public.browser_handoffs_task_flow_idx;

ALTER TABLE public.artifacts
  DROP COLUMN IF EXISTS task_flow_id;

ALTER TABLE public.assistant_work_items
  DROP COLUMN IF EXISTS origin_task_flow_id;

ALTER TABLE public.backend_jobs
  DROP COLUMN IF EXISTS origin_task_flow_id;

ALTER TABLE public.profile_actions
  DROP COLUMN IF EXISTS task_flow_id;

ALTER TABLE public.profile_proposals
  DROP COLUMN IF EXISTS source_task_flow_id;

ALTER TABLE public.browser_handoffs
  DROP COLUMN IF EXISTS task_flow_id;

DROP TABLE IF EXISTS public.task_flow_events;
DROP TABLE IF EXISTS public.task_flows;
