CREATE TABLE IF NOT EXISTS "public"."boldsign_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "capability_account_link_id" "uuid" NOT NULL,
    "connected_provider_account_id" "uuid" NOT NULL,
    "document_id" "text" NOT NULL,
    "source" "text" NOT NULL,
    "ownership_status" "text" NOT NULL,
    "provider_status" "text",
    "title" "text",
    "signer_email" "text",
    "sent_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "provider_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "boldsign_documents_document_id_not_blank" CHECK (("length"("btrim"("document_id")) > 0)),
    CONSTRAINT "boldsign_documents_ownership_status_check" CHECK (("ownership_status" = ANY (ARRAY['assigned'::"text", 'pending_provider_confirmation'::"text", 'unassigned_review'::"text"]))),
    CONSTRAINT "boldsign_documents_provider_metadata_object_check" CHECK (("jsonb_typeof"("provider_metadata") = 'object'::"text")),
    CONSTRAINT "boldsign_documents_signer_email_not_blank" CHECK ((("signer_email" IS NULL) OR ("length"("btrim"("signer_email")) > 0))),
    CONSTRAINT "boldsign_documents_source_check" CHECK (("source" = ANY (ARRAY['openclaw_send'::"text", 'maintainer_import'::"text", 'webhook_observed'::"text"]))),
    CONSTRAINT "boldsign_documents_title_not_blank" CHECK ((("title" IS NULL) OR ("length"("btrim"("title")) > 0)))
);

ALTER TABLE ONLY "public"."boldsign_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY "public"."boldsign_documents" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."boldsign_documents" OWNER TO "postgres";

ALTER TABLE ONLY "public"."boldsign_documents"
    ADD CONSTRAINT "boldsign_documents_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."boldsign_documents"
    ADD CONSTRAINT "boldsign_documents_connected_account_document_unique" UNIQUE ("connected_provider_account_id", "document_id");

CREATE INDEX "boldsign_documents_profile_account_document_idx" ON "public"."boldsign_documents" USING "btree" ("profile_id", "connected_provider_account_id", "document_id");

CREATE INDEX "boldsign_documents_profile_status_updated_idx" ON "public"."boldsign_documents" USING "btree" ("profile_id", "ownership_status", "updated_at" DESC);

ALTER TABLE ONLY "public"."boldsign_documents"
    ADD CONSTRAINT "boldsign_documents_capability_account_link_id_fkey" FOREIGN KEY ("capability_account_link_id") REFERENCES "public"."capability_account_links"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."boldsign_documents"
    ADD CONSTRAINT "boldsign_documents_capability_link_profile_fk" FOREIGN KEY ("capability_account_link_id", "profile_id") REFERENCES "public"."capability_account_links"("id", "profile_id");

ALTER TABLE ONLY "public"."boldsign_documents"
    ADD CONSTRAINT "boldsign_documents_connected_provider_account_id_fkey" FOREIGN KEY ("connected_provider_account_id") REFERENCES "public"."connected_provider_accounts"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."boldsign_documents"
    ADD CONSTRAINT "boldsign_documents_connected_account_profile_fk" FOREIGN KEY ("connected_provider_account_id", "profile_id") REFERENCES "public"."connected_provider_accounts"("id", "profile_id");

ALTER TABLE ONLY "public"."boldsign_documents"
    ADD CONSTRAINT "boldsign_documents_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

CREATE OR REPLACE TRIGGER "set_updated_at_boldsign_documents" BEFORE UPDATE ON "public"."boldsign_documents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
