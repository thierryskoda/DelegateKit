CREATE TABLE IF NOT EXISTS "public"."phone_call_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "profile_action_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending_start'::"text" NOT NULL,
    "provider" "text" DEFAULT 'twilio-voice'::"text" NOT NULL,
    "call_id" "text" NOT NULL,
    "provider_call_sid" "text",
    "provider_parent_call_sid" "text",
    "provider_status" "text",
    "provider_status_updated_at" timestamp with time zone,
    "to_phone_e164" "text" NOT NULL,
    "from_phone_e164" "text",
    "country" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "opening_line" "text" NOT NULL,
    "verified_phone_source_url" "text" NOT NULL,
    "call_brief_hash" "text" NOT NULL,
    "started_at" timestamp with time zone,
    "answered_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "duration_seconds" integer,
    "terminal_reason" "text",
    "summary" "text",
    "failure_kind" "text",
    "failure_message" "text",
    "turn_index" integer DEFAULT 0 NOT NULL,
    "current_turn_token_hash" "text",
    "max_duration_seconds" integer DEFAULT 300 NOT NULL,
    "hold_timeout_seconds" integer DEFAULT 60 NOT NULL,
    "last_provider_event_at" timestamp with time zone,
    "last_transcript_at" timestamp with time zone,
    "pre_connect_dtmf_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "phone_call_attempts_call_brief_hash_check" CHECK (("call_brief_hash" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "phone_call_attempts_country_check" CHECK (("country" = ANY (ARRAY['US'::"text", 'CA'::"text"]))),
    CONSTRAINT "phone_call_attempts_duration_seconds_check" CHECK ((("duration_seconds" IS NULL) OR ("duration_seconds" >= 0))),
    CONSTRAINT "phone_call_attempts_opening_line_not_blank" CHECK (("length"("btrim"("opening_line")) > 0)),
    CONSTRAINT "phone_call_attempts_provider_check" CHECK (("provider" = 'twilio-voice'::"text")),
    CONSTRAINT "phone_call_attempts_status_check" CHECK (("status" = ANY (ARRAY['pending_start'::"text", 'starting'::"text", 'in_progress'::"text", 'completed'::"text", 'no_answer'::"text", 'failed'::"text", 'unknown'::"text"]))),
    CONSTRAINT "phone_call_attempts_to_phone_e164_check" CHECK (("to_phone_e164" ~ '^\+[1-9][0-9]{1,14}$'::"text")),
    CONSTRAINT "phone_call_attempts_from_phone_e164_check" CHECK ((("from_phone_e164" IS NULL) OR ("from_phone_e164" ~ '^\+[1-9][0-9]{1,14}$'::"text"))),
    CONSTRAINT "phone_call_attempts_turn_index_check" CHECK (("turn_index" >= 0)),
    CONSTRAINT "phone_call_attempts_max_duration_seconds_check" CHECK (("max_duration_seconds" >= 30)),
    CONSTRAINT "phone_call_attempts_hold_timeout_seconds_check" CHECK (("hold_timeout_seconds" >= 15))
);

ALTER TABLE ONLY "public"."phone_call_attempts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."phone_call_attempts" OWNER TO "postgres";
ALTER TABLE ONLY "public"."phone_call_attempts" ADD CONSTRAINT "phone_call_attempts_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."phone_call_attempts" ADD CONSTRAINT "phone_call_attempts_action_unique" UNIQUE ("profile_action_id");
ALTER TABLE ONLY "public"."phone_call_attempts" ADD CONSTRAINT "phone_call_attempts_call_id_unique" UNIQUE ("call_id");
CREATE UNIQUE INDEX "phone_call_attempts_provider_call_sid_unique" ON "public"."phone_call_attempts" USING "btree" ("provider", "provider_call_sid") WHERE ("provider_call_sid" IS NOT NULL);
CREATE INDEX "phone_call_attempts_profile_created_idx" ON "public"."phone_call_attempts" USING "btree" ("profile_id", "created_at" DESC);
CREATE INDEX "phone_call_attempts_profile_status_idx" ON "public"."phone_call_attempts" USING "btree" ("profile_id", "status", "updated_at");
CREATE OR REPLACE TRIGGER "set_updated_at_phone_call_attempts" BEFORE UPDATE ON "public"."phone_call_attempts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
ALTER TABLE ONLY "public"."phone_call_attempts" ADD CONSTRAINT "phone_call_attempts_profile_action_id_profile_actions_id_fk" FOREIGN KEY ("profile_action_id") REFERENCES "public"."profile_actions"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."phone_call_attempts" ADD CONSTRAINT "phone_call_attempts_action_profile_fk" FOREIGN KEY ("profile_action_id", "profile_id") REFERENCES "public"."profile_actions"("id", "profile_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."phone_call_attempts" ADD CONSTRAINT "phone_call_attempts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE "public"."phone_call_attempts" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE "public"."phone_call_attempts" TO "service_role";

CREATE TABLE IF NOT EXISTS "public"."phone_call_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "phone_call_attempt_id" "uuid" NOT NULL,
    "call_id" "text" NOT NULL,
    "provider" "text" DEFAULT 'twilio-voice'::"text" NOT NULL,
    "provider_call_sid" "text",
    "event_kind" "text" NOT NULL,
    "dedupe_key" "text" NOT NULL,
    "provider_event_id" "text",
    "turn_index" integer,
    "turn_token_hash" "text",
    "provider_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "phone_call_events_provider_check" CHECK (("provider" = 'twilio-voice'::"text")),
    CONSTRAINT "phone_call_events_event_kind_check" CHECK (("event_kind" = ANY (ARRAY['call.started'::"text", 'call.answered'::"text", 'call.speech'::"text", 'call.dtmf'::"text", 'call.silence'::"text", 'call.ended'::"text", 'call.error'::"text"]))),
    CONSTRAINT "phone_call_events_provider_payload_object_check" CHECK (("jsonb_typeof"("provider_payload") = 'object'::"text"))
);
ALTER TABLE ONLY "public"."phone_call_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."phone_call_events" OWNER TO "postgres";
ALTER TABLE ONLY "public"."phone_call_events" ADD CONSTRAINT "phone_call_events_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."phone_call_events" ADD CONSTRAINT "phone_call_events_dedupe_key_unique" UNIQUE ("dedupe_key");
CREATE INDEX "phone_call_events_attempt_created_idx" ON "public"."phone_call_events" USING "btree" ("phone_call_attempt_id", "created_at");
ALTER TABLE ONLY "public"."phone_call_events" ADD CONSTRAINT "phone_call_events_attempt_fk" FOREIGN KEY ("phone_call_attempt_id") REFERENCES "public"."phone_call_attempts"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."phone_call_events" ADD CONSTRAINT "phone_call_events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE "public"."phone_call_events" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE "public"."phone_call_events" TO "service_role";

CREATE TABLE IF NOT EXISTS "public"."phone_call_transcript_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "phone_call_attempt_id" "uuid" NOT NULL,
    "call_id" "text" NOT NULL,
    "provider_event_id" "uuid",
    "turn_index" integer NOT NULL,
    "speaker" "text" NOT NULL,
    "text" "text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "phone_call_transcript_entries_speaker_check" CHECK (("speaker" = ANY (ARRAY['assistant'::"text", 'callee'::"text", 'system'::"text"]))),
    CONSTRAINT "phone_call_transcript_entries_text_not_blank" CHECK (("length"("btrim"("text")) > 0))
);
ALTER TABLE ONLY "public"."phone_call_transcript_entries" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."phone_call_transcript_entries" OWNER TO "postgres";
ALTER TABLE ONLY "public"."phone_call_transcript_entries" ADD CONSTRAINT "phone_call_transcript_entries_pkey" PRIMARY KEY ("id");
CREATE INDEX "phone_call_transcript_entries_attempt_turn_idx" ON "public"."phone_call_transcript_entries" USING "btree" ("phone_call_attempt_id", "turn_index", "created_at");
ALTER TABLE ONLY "public"."phone_call_transcript_entries" ADD CONSTRAINT "phone_call_transcript_entries_attempt_fk" FOREIGN KEY ("phone_call_attempt_id") REFERENCES "public"."phone_call_attempts"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."phone_call_transcript_entries" ADD CONSTRAINT "phone_call_transcript_entries_event_fk" FOREIGN KEY ("provider_event_id") REFERENCES "public"."phone_call_events"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."phone_call_transcript_entries" ADD CONSTRAINT "phone_call_transcript_entries_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE "public"."phone_call_transcript_entries" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE "public"."phone_call_transcript_entries" TO "service_role";

CREATE TABLE IF NOT EXISTS "public"."phone_sms_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "profile_action_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "provider" "text" DEFAULT 'twilio-messaging'::"text" NOT NULL,
    "provider_message_sid" "text",
    "provider_status" "text",
    "provider_status_updated_at" timestamp with time zone,
    "to_phone_e164" "text" NOT NULL,
    "from_phone_e164" "text",
    "country" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "body_hash" "text" NOT NULL,
    "body_preview" "text" NOT NULL,
    "destination_evidence_kind" "text" NOT NULL,
    "destination_evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "verified_phone_source_url" "text",
    "verified_phone_source_label" "text",
    "reply_to_message_sid" "text",
    "related_call_attempt_id" "uuid",
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "failure_kind" "text",
    "failure_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "phone_sms_attempts_body_hash_check" CHECK (("body_hash" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "phone_sms_attempts_body_preview_not_blank" CHECK (("length"("btrim"("body_preview")) > 0)),
    CONSTRAINT "phone_sms_attempts_country_check" CHECK (("country" = ANY (ARRAY['US'::"text", 'CA'::"text"]))),
    CONSTRAINT "phone_sms_attempts_destination_evidence_kind_check" CHECK (("destination_evidence_kind" = ANY (ARRAY['public_phone_source'::"text", 'prior_inbound_sms'::"text"]))),
    CONSTRAINT "phone_sms_attempts_destination_evidence_object_check" CHECK (("jsonb_typeof"("destination_evidence") = 'object'::"text")),
    CONSTRAINT "phone_sms_attempts_provider_check" CHECK (("provider" = 'twilio-messaging'::"text")),
    CONSTRAINT "phone_sms_attempts_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'sent'::"text", 'delivered'::"text", 'undelivered'::"text", 'failed'::"text", 'unknown'::"text"]))),
    CONSTRAINT "phone_sms_attempts_to_phone_e164_check" CHECK (("to_phone_e164" ~ '^\+[1-9][0-9]{1,14}$'::"text")),
    CONSTRAINT "phone_sms_attempts_from_phone_e164_check" CHECK ((("from_phone_e164" IS NULL) OR ("from_phone_e164" ~ '^\+[1-9][0-9]{1,14}$'::"text")))
);
ALTER TABLE ONLY "public"."phone_sms_attempts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."phone_sms_attempts" OWNER TO "postgres";
ALTER TABLE ONLY "public"."phone_sms_attempts" ADD CONSTRAINT "phone_sms_attempts_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."phone_sms_attempts" ADD CONSTRAINT "phone_sms_attempts_action_unique" UNIQUE ("profile_action_id");
CREATE UNIQUE INDEX "phone_sms_attempts_provider_message_unique" ON "public"."phone_sms_attempts" USING "btree" ("provider", "provider_message_sid") WHERE ("provider_message_sid" IS NOT NULL);
CREATE INDEX "phone_sms_attempts_profile_created_idx" ON "public"."phone_sms_attempts" USING "btree" ("profile_id", "created_at" DESC);
CREATE INDEX "phone_sms_attempts_profile_status_idx" ON "public"."phone_sms_attempts" USING "btree" ("profile_id", "status", "updated_at");
CREATE INDEX "phone_sms_attempts_reply_to_message_sid_idx" ON "public"."phone_sms_attempts" USING "btree" ("reply_to_message_sid") WHERE ("reply_to_message_sid" IS NOT NULL);
CREATE OR REPLACE TRIGGER "set_updated_at_phone_sms_attempts" BEFORE UPDATE ON "public"."phone_sms_attempts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
ALTER TABLE ONLY "public"."phone_sms_attempts" ADD CONSTRAINT "phone_sms_attempts_profile_action_id_profile_actions_id_fk" FOREIGN KEY ("profile_action_id") REFERENCES "public"."profile_actions"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."phone_sms_attempts" ADD CONSTRAINT "phone_sms_attempts_action_profile_fk" FOREIGN KEY ("profile_action_id", "profile_id") REFERENCES "public"."profile_actions"("id", "profile_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."phone_sms_attempts" ADD CONSTRAINT "phone_sms_attempts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."phone_sms_attempts" ADD CONSTRAINT "phone_sms_attempts_related_call_attempt_id_fk" FOREIGN KEY ("related_call_attempt_id") REFERENCES "public"."phone_call_attempts"("id") ON DELETE SET NULL;
ALTER TABLE "public"."phone_sms_attempts" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE "public"."phone_sms_attempts" TO "service_role";

CREATE TABLE IF NOT EXISTS "public"."phone_sms_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "phone_sms_attempt_id" "uuid",
    "provider" "text" DEFAULT 'twilio-messaging'::"text" NOT NULL,
    "provider_message_sid" "text",
    "event_kind" "text" NOT NULL,
    "dedupe_key" "text" NOT NULL,
    "provider_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "phone_sms_events_provider_check" CHECK (("provider" = 'twilio-messaging'::"text")),
    CONSTRAINT "phone_sms_events_event_kind_check" CHECK (("event_kind" = ANY (ARRAY['sms.queued'::"text", 'sms.sent'::"text", 'sms.delivered'::"text", 'sms.undelivered'::"text", 'sms.failed'::"text", 'sms.received'::"text"]))),
    CONSTRAINT "phone_sms_events_provider_payload_object_check" CHECK (("jsonb_typeof"("provider_payload") = 'object'::"text"))
);
ALTER TABLE ONLY "public"."phone_sms_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."phone_sms_events" OWNER TO "postgres";
ALTER TABLE ONLY "public"."phone_sms_events" ADD CONSTRAINT "phone_sms_events_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."phone_sms_events" ADD CONSTRAINT "phone_sms_events_dedupe_key_unique" UNIQUE ("dedupe_key");
CREATE INDEX "phone_sms_events_attempt_created_idx" ON "public"."phone_sms_events" USING "btree" ("phone_sms_attempt_id", "created_at");
ALTER TABLE ONLY "public"."phone_sms_events" ADD CONSTRAINT "phone_sms_events_attempt_fk" FOREIGN KEY ("phone_sms_attempt_id") REFERENCES "public"."phone_sms_attempts"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."phone_sms_events" ADD CONSTRAINT "phone_sms_events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE "public"."phone_sms_events" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE "public"."phone_sms_events" TO "service_role";

CREATE TABLE IF NOT EXISTS "public"."phone_inbound_sms_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "capability_account_link_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'twilio-messaging'::"text" NOT NULL,
    "message_sid" "text" NOT NULL,
    "from_phone_e164" "text" NOT NULL,
    "to_phone_e164" "text" NOT NULL,
    "body_text" "text" NOT NULL,
    "media_count" integer DEFAULT 0 NOT NULL,
    "delivery_id" "uuid",
    "work_item_id" "uuid",
    "dedupe_key" "text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "phone_inbound_sms_messages_provider_check" CHECK (("provider" = 'twilio-messaging'::"text")),
    CONSTRAINT "phone_inbound_sms_messages_body_text_not_blank" CHECK (("length"("btrim"("body_text")) > 0)),
    CONSTRAINT "phone_inbound_sms_messages_media_count_check" CHECK (("media_count" >= 0)),
    CONSTRAINT "phone_inbound_sms_messages_from_phone_e164_check" CHECK (("from_phone_e164" ~ '^\+[1-9][0-9]{1,14}$'::"text")),
    CONSTRAINT "phone_inbound_sms_messages_to_phone_e164_check" CHECK (("to_phone_e164" ~ '^\+[1-9][0-9]{1,14}$'::"text"))
);
ALTER TABLE ONLY "public"."phone_inbound_sms_messages" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."phone_inbound_sms_messages" OWNER TO "postgres";
ALTER TABLE ONLY "public"."phone_inbound_sms_messages" ADD CONSTRAINT "phone_inbound_sms_messages_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."phone_inbound_sms_messages" ADD CONSTRAINT "phone_inbound_sms_messages_message_sid_unique" UNIQUE ("provider", "message_sid");
ALTER TABLE ONLY "public"."phone_inbound_sms_messages" ADD CONSTRAINT "phone_inbound_sms_messages_dedupe_key_unique" UNIQUE ("dedupe_key");
CREATE INDEX "phone_inbound_sms_messages_profile_received_idx" ON "public"."phone_inbound_sms_messages" USING "btree" ("profile_id", "received_at" DESC);
ALTER TABLE ONLY "public"."phone_inbound_sms_messages" ADD CONSTRAINT "phone_inbound_sms_messages_capability_account_link_id_fk" FOREIGN KEY ("capability_account_link_id") REFERENCES "public"."capability_account_links"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."phone_inbound_sms_messages" ADD CONSTRAINT "phone_inbound_sms_messages_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."provider_webhook_deliveries"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."phone_inbound_sms_messages" ADD CONSTRAINT "phone_inbound_sms_messages_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."assistant_work_items"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."phone_inbound_sms_messages" ADD CONSTRAINT "phone_inbound_sms_messages_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE "public"."phone_inbound_sms_messages" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE "public"."phone_inbound_sms_messages" TO "service_role";

INSERT INTO "public"."phone_call_attempts" (
    "id", "profile_id", "profile_action_id", "status", "provider", "call_id", "provider_call_sid", "provider_status",
    "provider_status_updated_at", "to_phone_e164", "country", "purpose", "opening_line", "verified_phone_source_url", "call_brief_hash",
    "started_at", "ended_at", "duration_seconds", "terminal_reason", "summary", "failure_kind", "failure_message",
    "created_at", "updated_at"
)
SELECT
    "id", "profile_id", "profile_action_id", "status", 'twilio-voice', 'legacy-' || "id"::text, "provider_call_id",
    "provider_status", "provider_status_updated_at", "to_phone_e164", "country", "purpose", "purpose", "verified_phone_source_url",
    "call_brief_hash", "started_at", "ended_at", "duration_seconds", "terminal_reason", "summary", "failure_kind",
    "failure_message", "created_at", "updated_at"
FROM "public"."outbound_call_attempts"
ON CONFLICT ("profile_action_id") DO NOTHING;

INSERT INTO "public"."phone_sms_attempts" (
    "id", "profile_id", "profile_action_id", "status", "provider", "provider_message_sid", "provider_status",
    "provider_status_updated_at", "to_phone_e164", "from_phone_e164", "country", "purpose", "body_hash", "body_preview",
    "destination_evidence_kind", "destination_evidence", "verified_phone_source_url", "verified_phone_source_label",
    "reply_to_message_sid", "related_call_attempt_id", "sent_at", "delivered_at", "failure_kind", "failure_message",
    "created_at", "updated_at"
)
SELECT
    "id", "profile_id", "profile_action_id", "status", "provider", "provider_message_sid", "provider_status",
    "provider_status_updated_at", "to_phone_e164", "from_phone_e164", "country", "purpose", "body_hash", "body_preview",
    "destination_evidence_kind", "destination_evidence", "verified_phone_source_url", "verified_phone_source_label",
    "reply_to_message_sid", NULL, "sent_at", "delivered_at", "failure_kind", "failure_message", "created_at", "updated_at"
FROM "public"."outbound_sms_attempts"
ON CONFLICT ("profile_action_id") DO NOTHING;
