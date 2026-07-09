ALTER TABLE public.workflow_run_steps
  DROP CONSTRAINT workflow_run_steps_status_check;

ALTER TABLE public.workflow_run_steps
  ADD CONSTRAINT workflow_run_steps_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'running'::text,
    'waiting'::text,
    'succeeded'::text,
    'failed'::text,
    'skipped'::text,
    'cancelled'::text
  ]));

ALTER TABLE public.workflow_run_steps
  DROP CONSTRAINT workflow_run_steps_terminal_ended_at_check;

ALTER TABLE public.workflow_run_steps
  ADD CONSTRAINT workflow_run_steps_terminal_ended_at_check
  CHECK (
    (status <> ALL (ARRAY[
      'succeeded'::text,
      'failed'::text,
      'skipped'::text,
      'cancelled'::text
    ]))
    OR (ended_at IS NOT NULL)
  );
