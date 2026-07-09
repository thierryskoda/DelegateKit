CREATE TABLE IF NOT EXISTS "public"."provider_file_states" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "capability_account_link_id" "uuid" NOT NULL,
    "connected_provider_account_id" "uuid" NOT NULL,
    "provider_key" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "text" NOT NULL,
    "external_file_id" "text" NOT NULL,
    "name" "text",
    "web_url" "text",
    "mime_type" "text",
    "etag" "text",
    "ctag" "text",
    "parent_reference" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_modified_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "provider_file_states_external_file_id_not_blank" CHECK (("length"("btrim"("external_file_id")) > 0)),
    CONSTRAINT "provider_file_states_metadata_object_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "provider_file_states_parent_reference_object_check" CHECK (("jsonb_typeof"("parent_reference") = 'object'::"text")),
    CONSTRAINT "provider_file_states_provider_key_not_blank" CHECK (("length"("btrim"("provider_key")) > 0)),
    CONSTRAINT "provider_file_states_resource_id_not_blank" CHECK (("length"("btrim"("resource_id")) > 0)),
    CONSTRAINT "provider_file_states_resource_type_not_blank" CHECK (("length"("btrim"("resource_type")) > 0))
);

ALTER TABLE ONLY "public"."provider_file_states" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."provider_file_states" OWNER TO "postgres";

ALTER TABLE ONLY "public"."provider_file_states"
    ADD CONSTRAINT "provider_file_states_pkey" PRIMARY KEY ("id");

CREATE UNIQUE INDEX "provider_file_states_provider_resource_file_unique" ON "public"."provider_file_states" USING "btree" ("connected_provider_account_id", "provider_key", "resource_type", "resource_id", "external_file_id");
CREATE INDEX "provider_file_states_profile_provider_idx" ON "public"."provider_file_states" USING "btree" ("profile_id", "provider_key", "resource_type", "resource_id");

CREATE OR REPLACE TRIGGER "set_updated_at_provider_file_states" BEFORE UPDATE ON "public"."provider_file_states" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

ALTER TABLE ONLY "public"."provider_file_states"
    ADD CONSTRAINT "provider_file_states_capability_account_link_id_fkey" FOREIGN KEY ("capability_account_link_id") REFERENCES "public"."capability_account_links"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."provider_file_states"
    ADD CONSTRAINT "provider_file_states_capability_link_profile_fk" FOREIGN KEY ("capability_account_link_id", "profile_id") REFERENCES "public"."capability_account_links"("id", "profile_id");

ALTER TABLE ONLY "public"."provider_file_states"
    ADD CONSTRAINT "provider_file_states_connected_account_id_fkey" FOREIGN KEY ("connected_provider_account_id") REFERENCES "public"."connected_provider_accounts"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."provider_file_states"
    ADD CONSTRAINT "provider_file_states_connected_account_profile_fk" FOREIGN KEY ("connected_provider_account_id", "profile_id") REFERENCES "public"."connected_provider_accounts"("id", "profile_id");

ALTER TABLE ONLY "public"."provider_file_states"
    ADD CONSTRAINT "provider_file_states_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE "public"."provider_file_states" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE "public"."provider_file_states" TO "service_role";
