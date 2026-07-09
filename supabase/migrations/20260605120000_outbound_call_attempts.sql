CREATE TABLE IF NOT EXISTS "public"."outbound_call_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "profile_action_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending_start'::"text" NOT NULL,
    "provider" "text" DEFAULT 'openclaw-voice-call'::"text" NOT NULL,
    "provider_call_id" "text",
    "to_phone_e164" "text" NOT NULL,
    "country" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "verified_phone_source_url" "text" NOT NULL,
    "call_brief_hash" "text" NOT NULL,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "duration_seconds" integer,
    "terminal_reason" "text",
    "summary" "text",
    "failure_kind" "text",
    "failure_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "outbound_call_attempts_call_brief_hash_check" CHECK (("call_brief_hash" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "outbound_call_attempts_country_check" CHECK (("country" = ANY (ARRAY['US'::"text", 'CA'::"text"]))),
    CONSTRAINT "outbound_call_attempts_duration_seconds_check" CHECK ((("duration_seconds" IS NULL) OR ("duration_seconds" >= 0))),
    CONSTRAINT "outbound_call_attempts_provider_check" CHECK (("provider" = 'openclaw-voice-call'::"text")),
    CONSTRAINT "outbound_call_attempts_status_check" CHECK (("status" = ANY (ARRAY['pending_start'::"text", 'starting'::"text", 'in_progress'::"text", 'completed'::"text", 'no_answer'::"text", 'failed'::"text", 'unknown'::"text"]))),
    CONSTRAINT "outbound_call_attempts_to_phone_e164_check" CHECK (("to_phone_e164" ~ '^\+[1-9][0-9]{1,14}$'::"text"))
);

ALTER TABLE ONLY "public"."outbound_call_attempts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."outbound_call_attempts" OWNER TO "postgres";

ALTER TABLE ONLY "public"."outbound_call_attempts"
    ADD CONSTRAINT "outbound_call_attempts_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."outbound_call_attempts"
    ADD CONSTRAINT "outbound_call_attempts_action_unique" UNIQUE ("profile_action_id");

CREATE UNIQUE INDEX "outbound_call_attempts_provider_call_unique" ON "public"."outbound_call_attempts" USING "btree" ("provider", "provider_call_id") WHERE ("provider_call_id" IS NOT NULL);

CREATE INDEX "outbound_call_attempts_profile_created_idx" ON "public"."outbound_call_attempts" USING "btree" ("profile_id", "created_at" DESC);

CREATE INDEX "outbound_call_attempts_profile_status_idx" ON "public"."outbound_call_attempts" USING "btree" ("profile_id", "status", "updated_at");

CREATE OR REPLACE TRIGGER "set_updated_at_outbound_call_attempts" BEFORE UPDATE ON "public"."outbound_call_attempts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

ALTER TABLE ONLY "public"."outbound_call_attempts"
    ADD CONSTRAINT "outbound_call_attempts_profile_action_id_profile_actions_id_fk" FOREIGN KEY ("profile_action_id") REFERENCES "public"."profile_actions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."outbound_call_attempts"
    ADD CONSTRAINT "outbound_call_attempts_action_profile_fk" FOREIGN KEY ("profile_action_id", "profile_id") REFERENCES "public"."profile_actions"("id", "profile_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."outbound_call_attempts"
    ADD CONSTRAINT "outbound_call_attempts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE "public"."outbound_call_attempts" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."outbound_call_attempts" TO "service_role";
