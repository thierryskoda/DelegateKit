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
        'activity_summary_improve'::text,
        'guidance_create'::text,
        'guidance_update'::text,
        'guidance_archive'::text,
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
        'agent_activity_entry'::text,
        'profile_guidance'::text,
        'none'::text
      ]
    )
  );

ALTER TABLE public.profile_learning_review_candidates
  DROP CONSTRAINT profile_learning_review_candidates_target_shape_check;

ALTER TABLE public.profile_learning_review_candidates
  ADD CONSTRAINT profile_learning_review_candidates_target_shape_check
  CHECK (
    (
      target_kind = 'none'::text
      AND target_id IS NULL
    )
    OR (
      candidate_type = 'guidance_create'::text
      AND target_kind = 'profile_guidance'::text
      AND target_id IS NULL
    )
    OR (
      target_kind <> 'none'::text
      AND candidate_type <> 'guidance_create'::text
      AND target_id IS NOT NULL
      AND length(btrim(target_id)) > 0
    )
  );
