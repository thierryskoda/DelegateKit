ALTER TABLE public.artifacts
  ADD COLUMN idempotency_key text;

ALTER TABLE public.artifacts
  ADD CONSTRAINT artifacts_idempotency_key_not_blank
  CHECK (idempotency_key IS NULL OR length(btrim(idempotency_key)) > 0);

CREATE UNIQUE INDEX artifacts_profile_idempotency_unique
  ON public.artifacts (profile_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
