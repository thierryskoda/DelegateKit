ALTER TABLE "public"."outbound_call_attempts"
    ADD COLUMN IF NOT EXISTS "provider_session_key" "text",
    ADD COLUMN IF NOT EXISTS "provider_status" "text",
    ADD COLUMN IF NOT EXISTS "provider_status_updated_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "outbound_call_attempts_provider_session_key_idx"
    ON "public"."outbound_call_attempts" USING "btree" ("provider_session_key")
    WHERE ("provider_session_key" IS NOT NULL);
