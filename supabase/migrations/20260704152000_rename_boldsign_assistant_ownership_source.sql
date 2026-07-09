UPDATE "public"."boldsign_documents"
SET "source" = 'assistant_send'
WHERE "source" = 'openclaw_send';

ALTER TABLE "public"."boldsign_documents"
DROP CONSTRAINT IF EXISTS "boldsign_documents_source_check";

ALTER TABLE "public"."boldsign_documents"
ADD CONSTRAINT "boldsign_documents_source_check"
CHECK (("source" = ANY (ARRAY['assistant_send'::"text", 'maintainer_import'::"text", 'webhook_observed'::"text"])));
