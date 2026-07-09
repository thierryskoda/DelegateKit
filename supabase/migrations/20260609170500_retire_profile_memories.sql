UPDATE public.profile_memories
SET
  status = 'forgotten',
  archived_at = COALESCE(archived_at, now()),
  updated_at = now(),
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'retiredByMigration',
    '20260609170500_retire_profile_memories'
  )
WHERE status = 'active';

UPDATE public.profile_learning_review_candidates
SET
  status = 'rejected',
  failure_message = COALESCE(
    failure_message,
    'Profile memories were retired as a runtime concept; migrate reusable behavior into profile guidance.'
  ),
  updated_at = now()
WHERE
  status IN ('proposed', 'applying')
  AND (
    candidate_type IN ('memory_create', 'memory_update', 'memory_forget')
    OR target_kind = 'profile_memory'
  );

UPDATE public.profile_learning_review_candidates
SET
  candidate_type = 'no_action',
  target_kind = 'none',
  target_id = NULL,
  proposed_patch = '{}'::jsonb,
  updated_at = now(),
  failure_message = COALESCE(
    failure_message,
    'Profile memories were retired as a runtime concept; this historical candidate no longer targets mutable state.'
  )
WHERE
  candidate_type IN ('memory_create', 'memory_update', 'memory_forget')
  OR target_kind = 'profile_memory';

UPDATE public.profile_learning_review_observations
SET
  observation_type = CASE
    WHEN observation_type = 'memory_fact' THEN 'instruction_gap'
    ELSE observation_type
  END,
  target_kind = CASE
    WHEN target_kind = 'profile_memory' THEN 'none'
    ELSE target_kind
  END,
  target_id = CASE
    WHEN target_kind = 'profile_memory' THEN NULL
    ELSE target_id
  END,
  updated_at = now()
WHERE observation_type = 'memory_fact' OR target_kind = 'profile_memory';

ALTER TABLE public.profile_learning_review_candidates
  DROP CONSTRAINT profile_learning_review_candidates_candidate_type_check;

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
        'workflow_recipe_create'::text,
        'workflow_recipe_update'::text,
        'workflow_recipe_archive'::text,
        'no_action'::text
      ]
    )
  );

ALTER TABLE public.profile_learning_review_candidates
  DROP CONSTRAINT profile_learning_review_candidates_target_kind_check;

ALTER TABLE public.profile_learning_review_candidates
  ADD CONSTRAINT profile_learning_review_candidates_target_kind_check
  CHECK (
    target_kind = ANY (
      ARRAY[
        'assistant_scheduled_task'::text,
        'profile_assistant_work_route'::text,
        'profile_guidance'::text,
        'workflow_recipe'::text,
        'none'::text
      ]
    )
  );

ALTER TABLE public.profile_learning_review_observations
  DROP CONSTRAINT profile_learning_review_observations_observation_type_check;

ALTER TABLE public.profile_learning_review_observations
  ADD CONSTRAINT profile_learning_review_observations_observation_type_check
  CHECK (
    observation_type = ANY (
      ARRAY[
        'preference'::text,
        'correction'::text,
        'frustration'::text,
        'failure_pattern'::text,
        'instruction_gap'::text,
        'task_need'::text,
        'route_need'::text,
        'prior_outcome'::text,
        'needs_more_context'::text
      ]
    )
  );

ALTER TABLE public.profile_learning_review_observations
  DROP CONSTRAINT profile_learning_review_observations_target_kind_check;

ALTER TABLE public.profile_learning_review_observations
  ADD CONSTRAINT profile_learning_review_observations_target_kind_check
  CHECK (
    target_kind = ANY (
      ARRAY[
        'assistant_scheduled_task'::text,
        'profile_assistant_work_route'::text,
        'profile_guidance'::text,
        'workflow_recipe'::text,
        'none'::text
      ]
    )
  );

DROP TABLE public.profile_memories;
