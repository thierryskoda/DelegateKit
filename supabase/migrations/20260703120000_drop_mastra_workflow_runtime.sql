DROP SCHEMA IF EXISTS mastra_runtime CASCADE;

ALTER TABLE public.workflow_runs
  DROP COLUMN IF EXISTS mastra_workflow_id,
  DROP COLUMN IF EXISTS mastra_run_id;
