ALTER TABLE public.profile_learning_review_candidates
  DROP CONSTRAINT profile_learning_review_candidates_candidate_type_check;

ALTER TABLE public.profile_learning_review_candidates
  ADD CONSTRAINT profile_learning_review_candidates_candidate_type_check
  CHECK (
    candidate_type = ANY (
      ARRAY[
        'memory_create'::text,
        'memory_update'::text,
        'memory_forget'::text,
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
        'profile_memory'::text,
        'assistant_scheduled_task'::text,
        'profile_assistant_work_route'::text,
        'profile_guidance'::text,
        'workflow_recipe'::text,
        'none'::text
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
        'profile_memory'::text,
        'assistant_scheduled_task'::text,
        'profile_assistant_work_route'::text,
        'profile_guidance'::text,
        'workflow_recipe'::text,
        'none'::text
      ]
    )
  );
