DELETE FROM public.backend_jobs
WHERE kind = 'workflow.run.continue';

ALTER TABLE public.backend_jobs
  DROP CONSTRAINT IF EXISTS backend_jobs_kind_check;

ALTER TABLE public.backend_jobs
  ADD CONSTRAINT backend_jobs_kind_check
  CHECK (
    kind = ANY (
      ARRAY[
        'assistant.scheduled_tasks.tick'::text,
        'capability.setup.monday'::text,
        'profile.learning_review.run'::text,
        'provider.webhook.process'::text,
        'provider.webhook.subscription.reconcile'::text,
        'provider.sync.process'::text
      ]
    )
  );

UPDATE public.assistant_scheduled_tasks
SET target = jsonb_build_object('kind', 'assistant_instructions'),
    updated_at = now()
WHERE target ->> 'kind' = 'workflow_recipe';

ALTER TABLE public.assistant_scheduled_tasks
  DROP CONSTRAINT IF EXISTS assistant_scheduled_tasks_target_kind_check;

ALTER TABLE public.assistant_scheduled_tasks
  ADD CONSTRAINT assistant_scheduled_tasks_target_kind_check
  CHECK ((target ->> 'kind') = 'assistant_instructions'::text);

DELETE FROM public.profile_learning_review_candidates
WHERE candidate_type = ANY (
  ARRAY[
    'workflow_recipe_create'::text,
    'workflow_recipe_update'::text,
    'workflow_recipe_archive'::text
  ]
)
OR target_kind = 'workflow_recipe';

ALTER TABLE public.profile_learning_review_candidates
  DROP CONSTRAINT IF EXISTS profile_learning_review_candidates_candidate_type_check;

ALTER TABLE public.profile_learning_review_candidates
  ADD CONSTRAINT profile_learning_review_candidates_candidate_type_check
  CHECK (
    candidate_type = ANY (
      ARRAY[
        'scheduled_task_create'::text,
        'scheduled_task_update'::text,
        'scheduled_task_pause'::text,
        'scheduled_task_delete'::text,
        'scheduled_task_instructions_update'::text,
        'work_route_create'::text,
        'work_route_update'::text,
        'work_route_delete'::text,
        'work_route_instructions_update'::text,
        'guidance_create'::text,
        'guidance_update'::text,
        'guidance_archive'::text,
        'no_action'::text
      ]
    )
  );

ALTER TABLE public.profile_learning_review_candidates
  DROP CONSTRAINT IF EXISTS profile_learning_review_candidates_target_kind_check;

ALTER TABLE public.profile_learning_review_candidates
  ADD CONSTRAINT profile_learning_review_candidates_target_kind_check
  CHECK (
    target_kind = ANY (
      ARRAY[
        'assistant_scheduled_task'::text,
        'profile_assistant_work_route'::text,
        'profile_guidance'::text,
        'none'::text
      ]
    )
  );

DELETE FROM public.profile_learning_review_observations
WHERE target_kind = 'workflow_recipe';

ALTER TABLE public.profile_learning_review_observations
  DROP CONSTRAINT IF EXISTS profile_learning_review_observations_target_kind_check;

ALTER TABLE public.profile_learning_review_observations
  ADD CONSTRAINT profile_learning_review_observations_target_kind_check
  CHECK (
    target_kind = ANY (
      ARRAY[
        'assistant_scheduled_task'::text,
        'profile_assistant_work_route'::text,
        'profile_guidance'::text,
        'none'::text
      ]
    )
  );

DROP SCHEMA IF EXISTS mastra_runtime CASCADE;

DROP TABLE IF EXISTS public.workflow_run_step_items CASCADE;
DROP TABLE IF EXISTS public.workflow_run_steps CASCADE;
DROP TABLE IF EXISTS public.workflow_runs CASCADE;
DROP TABLE IF EXISTS public.workflow_recipes CASCADE;
