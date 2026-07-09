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
        'no_action'::text
      ]
    )
  );
