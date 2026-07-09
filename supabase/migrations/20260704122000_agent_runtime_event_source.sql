UPDATE public.agent_events
SET source = 'agent_runtime'
WHERE source IN ('runtime_plugin', 'openclaw_session');

UPDATE public.agent_runs
SET runtime_run_id = 'agent_runtime:' || substring(runtime_run_id FROM length('runtime_plugin:') + 1)
WHERE runtime_run_id LIKE 'runtime_plugin:%'
  AND NOT EXISTS (
    SELECT 1
    FROM public.agent_runs existing
    WHERE existing.runtime_run_id = 'agent_runtime:' || substring(agent_runs.runtime_run_id FROM length('runtime_plugin:') + 1)
  );

ALTER TABLE public.agent_events
  DROP CONSTRAINT IF EXISTS agent_events_source_check;

ALTER TABLE public.agent_events
  ADD CONSTRAINT agent_events_source_check
  CHECK (source = ANY (ARRAY['backend'::text, 'agent_runtime'::text]));
