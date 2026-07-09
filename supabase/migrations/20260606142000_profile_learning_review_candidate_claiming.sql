ALTER TABLE public.profile_learning_review_candidates
  DROP CONSTRAINT profile_learning_review_candidates_status_check;

ALTER TABLE public.profile_learning_review_candidates
  ADD CONSTRAINT profile_learning_review_candidates_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'proposed'::text,
        'applying'::text,
        'auto_applied'::text,
        'client_applied'::text,
        'rejected'::text,
        'skipped'::text,
        'failed'::text
      ]
    )
  );

ALTER TABLE public.profile_learning_review_candidates
  DROP CONSTRAINT profile_learning_review_candidates_applied_shape_check;

ALTER TABLE public.profile_learning_review_candidates
  ADD CONSTRAINT profile_learning_review_candidates_applied_shape_check
  CHECK (
    (
      status = ANY (ARRAY['auto_applied'::text, 'client_applied'::text])
      AND applied_at IS NOT NULL
    )
    OR (
      status <> ALL (ARRAY['auto_applied'::text, 'client_applied'::text])
      AND applied_at IS NULL
    )
  );
