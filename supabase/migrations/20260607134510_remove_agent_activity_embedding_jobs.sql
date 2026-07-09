ALTER TABLE public.backend_jobs
  DROP CONSTRAINT backend_jobs_kind_check;

ALTER TABLE public.backend_jobs
  ADD CONSTRAINT backend_jobs_kind_check
  CHECK (kind = ANY (ARRAY[
    'assistant.scheduled_tasks.tick'::text,
    'capability.setup.monday'::text,
    'profile.learning_review.run'::text,
    'provider.webhook.process'::text,
    'provider.webhook.subscription.reconcile'::text,
    'provider.sync.process'::text
  ]));
