DELETE FROM public.backend_jobs
WHERE kind = 'assistant.scheduled_tasks.tick';

ALTER TABLE public.backend_jobs
  DROP CONSTRAINT IF EXISTS backend_jobs_kind_check;

ALTER TABLE public.backend_jobs
  ADD CONSTRAINT backend_jobs_kind_check
  CHECK (
    kind = ANY (
      ARRAY[
        'agent.run.execute'::text,
        'capability.setup.monday'::text,
        'profile.learning_review.run'::text,
        'provider.webhook.process'::text,
        'provider.webhook.subscription.reconcile'::text,
        'provider.sync.process'::text
      ]
    )
  );
