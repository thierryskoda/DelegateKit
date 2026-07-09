CREATE TABLE IF NOT EXISTS "public"."profile_channel_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "profile_channel_id" "uuid" NOT NULL,
    "direction" "text" NOT NULL,
    "status" "text" NOT NULL,
    "conversation_id" "text" NOT NULL,
    "external_message_id" "text",
    "content_text" "text" NOT NULL,
    "session_key" "text",
    "failure_reason" "text",
    "occurred_at" timestamp with time zone NOT NULL,
    CONSTRAINT "profile_channel_messages_content_text_not_blank" CHECK (("length"("btrim"("content_text")) > 0)),
    CONSTRAINT "profile_channel_messages_conversation_id_not_blank" CHECK (("length"("btrim"("conversation_id")) > 0)),
    CONSTRAINT "profile_channel_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"]))),
    CONSTRAINT "profile_channel_messages_direction_status_check" CHECK (((("direction" = 'inbound'::"text") AND ("status" = 'received'::"text")) OR (("direction" = 'outbound'::"text") AND ("status" = ANY (ARRAY['sent'::"text", 'failed'::"text"]))))),
    CONSTRAINT "profile_channel_messages_external_message_id_not_blank" CHECK ((("external_message_id" IS NULL) OR ("length"("btrim"("external_message_id")) > 0))),
    CONSTRAINT "profile_channel_messages_failure_reason_status_check" CHECK (((("status" = 'failed'::"text") AND ("failure_reason" IS NOT NULL) AND ("length"("btrim"("failure_reason")) > 0)) OR (("status" <> 'failed'::"text") AND ("failure_reason" IS NULL)))),
    CONSTRAINT "profile_channel_messages_session_key_not_blank" CHECK ((("session_key" IS NULL) OR ("length"("btrim"("session_key")) > 0))),
    CONSTRAINT "profile_channel_messages_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'sent'::"text", 'failed'::"text"])))
);

ALTER TABLE ONLY "public"."profile_channel_messages" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."profile_channel_messages" OWNER TO "postgres";

ALTER TABLE ONLY "public"."profile_channel_messages"
    ADD CONSTRAINT "profile_channel_messages_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."profile_channel_messages"
    ADD CONSTRAINT "profile_channel_messages_profile_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."profile_channel_messages"
    ADD CONSTRAINT "profile_channel_messages_channel_profile_fk" FOREIGN KEY ("profile_channel_id", "profile_id") REFERENCES "public"."profile_channels"("id", "profile_id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "profile_channel_messages_external_message_unique" ON "public"."profile_channel_messages" USING "btree" ("profile_channel_id", "direction", "external_message_id") WHERE ("external_message_id" IS NOT NULL);

CREATE INDEX "profile_channel_messages_conversation_idx" ON "public"."profile_channel_messages" USING "btree" ("profile_channel_id", "conversation_id", "occurred_at" DESC);

CREATE INDEX "profile_channel_messages_profile_timeline_idx" ON "public"."profile_channel_messages" USING "btree" ("profile_id", "occurred_at" DESC);

ALTER TABLE "public"."profile_channel_messages" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."profile_channel_messages" TO "service_role";
