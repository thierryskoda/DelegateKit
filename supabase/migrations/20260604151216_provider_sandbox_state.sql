CREATE TABLE IF NOT EXISTS "public"."provider_sandbox_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "capability_account_link_id" "uuid" NOT NULL,
    "connected_provider_account_id" "uuid" NOT NULL,
    "provider_key" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "text" NOT NULL,
    "state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "provider_sandbox_resources_metadata_object_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "provider_sandbox_resources_provider_key_not_blank" CHECK (("length"("btrim"("provider_key")) > 0)),
    CONSTRAINT "provider_sandbox_resources_resource_id_not_blank" CHECK (("length"("btrim"("resource_id")) > 0)),
    CONSTRAINT "provider_sandbox_resources_resource_type_not_blank" CHECK (("length"("btrim"("resource_type")) > 0)),
    CONSTRAINT "provider_sandbox_resources_state_object_check" CHECK (("jsonb_typeof"("state") = 'object'::"text"))
);

ALTER TABLE "public"."provider_sandbox_resources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY "public"."provider_sandbox_resources" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."provider_sandbox_resources" OWNER TO "postgres";

ALTER TABLE ONLY "public"."provider_sandbox_resources"
    ADD CONSTRAINT "provider_sandbox_resources_pkey" PRIMARY KEY ("id");

CREATE UNIQUE INDEX "provider_sandbox_resources_provider_resource_unique" ON "public"."provider_sandbox_resources" USING "btree" ("connected_provider_account_id", "provider_key", "resource_type", "resource_id");
CREATE INDEX "provider_sandbox_resources_profile_provider_idx" ON "public"."provider_sandbox_resources" USING "btree" ("profile_id", "provider_key", "resource_type", "resource_id");

CREATE OR REPLACE TRIGGER "set_updated_at_provider_sandbox_resources" BEFORE UPDATE ON "public"."provider_sandbox_resources" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

ALTER TABLE ONLY "public"."provider_sandbox_resources"
    ADD CONSTRAINT "provider_sandbox_resources_capability_account_link_id_fkey" FOREIGN KEY ("capability_account_link_id") REFERENCES "public"."capability_account_links"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."provider_sandbox_resources"
    ADD CONSTRAINT "provider_sandbox_resources_capability_link_profile_fk" FOREIGN KEY ("capability_account_link_id", "profile_id") REFERENCES "public"."capability_account_links"("id", "profile_id");

ALTER TABLE ONLY "public"."provider_sandbox_resources"
    ADD CONSTRAINT "provider_sandbox_resources_connected_account_id_fkey" FOREIGN KEY ("connected_provider_account_id") REFERENCES "public"."connected_provider_accounts"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."provider_sandbox_resources"
    ADD CONSTRAINT "provider_sandbox_resources_connected_account_profile_fk" FOREIGN KEY ("connected_provider_account_id", "profile_id") REFERENCES "public"."connected_provider_accounts"("id", "profile_id");

ALTER TABLE ONLY "public"."provider_sandbox_resources"
    ADD CONSTRAINT "provider_sandbox_resources_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS "public"."provider_sandbox_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "capability_account_link_id" "uuid" NOT NULL,
    "connected_provider_account_id" "uuid" NOT NULL,
    "provider_key" "text" NOT NULL,
    "operation" "text" NOT NULL,
    "resource_type" "text",
    "resource_id" "text",
    "request" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "response" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'succeeded'::"text" NOT NULL,
    "error" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "provider_sandbox_requests_error_object_check" CHECK ((("error" IS NULL) OR ("jsonb_typeof"("error") = 'object'::"text"))),
    CONSTRAINT "provider_sandbox_requests_metadata_object_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "provider_sandbox_requests_operation_not_blank" CHECK (("length"("btrim"("operation")) > 0)),
    CONSTRAINT "provider_sandbox_requests_provider_key_not_blank" CHECK (("length"("btrim"("provider_key")) > 0)),
    CONSTRAINT "provider_sandbox_requests_request_object_check" CHECK (("jsonb_typeof"("request") = 'object'::"text")),
    CONSTRAINT "provider_sandbox_requests_resource_id_not_blank" CHECK ((("resource_id" IS NULL) OR ("length"("btrim"("resource_id")) > 0))),
    CONSTRAINT "provider_sandbox_requests_resource_type_not_blank" CHECK ((("resource_type" IS NULL) OR ("length"("btrim"("resource_type")) > 0))),
    CONSTRAINT "provider_sandbox_requests_response_object_check" CHECK (("jsonb_typeof"("response") = 'object'::"text")),
    CONSTRAINT "provider_sandbox_requests_status_check" CHECK (("status" = ANY (ARRAY['succeeded'::"text", 'failed'::"text"])))
);

ALTER TABLE "public"."provider_sandbox_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY "public"."provider_sandbox_requests" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."provider_sandbox_requests" OWNER TO "postgres";

ALTER TABLE ONLY "public"."provider_sandbox_requests"
    ADD CONSTRAINT "provider_sandbox_requests_pkey" PRIMARY KEY ("id");

CREATE INDEX "provider_sandbox_requests_profile_provider_idx" ON "public"."provider_sandbox_requests" USING "btree" ("profile_id", "provider_key", "operation", "created_at" DESC);
CREATE INDEX "provider_sandbox_requests_resource_idx" ON "public"."provider_sandbox_requests" USING "btree" ("connected_provider_account_id", "provider_key", "resource_type", "resource_id", "created_at" DESC);

CREATE OR REPLACE TRIGGER "set_updated_at_provider_sandbox_requests" BEFORE UPDATE ON "public"."provider_sandbox_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

ALTER TABLE ONLY "public"."provider_sandbox_requests"
    ADD CONSTRAINT "provider_sandbox_requests_capability_account_link_id_fkey" FOREIGN KEY ("capability_account_link_id") REFERENCES "public"."capability_account_links"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."provider_sandbox_requests"
    ADD CONSTRAINT "provider_sandbox_requests_capability_link_profile_fk" FOREIGN KEY ("capability_account_link_id", "profile_id") REFERENCES "public"."capability_account_links"("id", "profile_id");

ALTER TABLE ONLY "public"."provider_sandbox_requests"
    ADD CONSTRAINT "provider_sandbox_requests_connected_account_id_fkey" FOREIGN KEY ("connected_provider_account_id") REFERENCES "public"."connected_provider_accounts"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."provider_sandbox_requests"
    ADD CONSTRAINT "provider_sandbox_requests_connected_account_profile_fk" FOREIGN KEY ("connected_provider_account_id", "profile_id") REFERENCES "public"."connected_provider_accounts"("id", "profile_id");

ALTER TABLE ONLY "public"."provider_sandbox_requests"
    ADD CONSTRAINT "provider_sandbox_requests_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

GRANT ALL ON TABLE "public"."provider_sandbox_resources" TO "service_role";
GRANT ALL ON TABLE "public"."provider_sandbox_requests" TO "service_role";
