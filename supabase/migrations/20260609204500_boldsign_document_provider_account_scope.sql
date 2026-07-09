ALTER TABLE "public"."boldsign_documents"
    ADD COLUMN "provider_account_id" "text";

UPDATE "public"."boldsign_documents" AS "document"
SET "provider_account_id" = "account"."provider_account_id"
FROM "public"."connected_provider_accounts" AS "account"
WHERE "account"."id" = "document"."connected_provider_account_id";

ALTER TABLE "public"."boldsign_documents"
    ALTER COLUMN "provider_account_id" SET NOT NULL;

ALTER TABLE ONLY "public"."boldsign_documents"
    ADD CONSTRAINT "boldsign_documents_provider_account_id_not_blank" CHECK (("length"("btrim"("provider_account_id")) > 0));

ALTER TABLE ONLY "public"."boldsign_documents"
    ADD CONSTRAINT "boldsign_documents_provider_account_document_unique" UNIQUE ("provider_account_id", "document_id");

CREATE INDEX "boldsign_documents_profile_provider_account_document_idx" ON "public"."boldsign_documents" USING "btree" ("profile_id", "provider_account_id", "document_id");
