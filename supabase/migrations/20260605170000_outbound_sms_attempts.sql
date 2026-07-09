CREATE TABLE IF NOT EXISTS "public"."outbound_sms_attempts" (
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
    CONSTRAINT "outbound_sms_attempts_body_hash_check" CHECK (("body_hash" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "outbound_sms_attempts_body_preview_not_blank" CHECK (("length"("btrim"("body_preview")) > 0)),
    CONSTRAINT "outbound_sms_attempts_country_check" CHECK (("country" = ANY (ARRAY['US'::"text", 'CA'::"text"]))),
    CONSTRAINT "outbound_sms_attempts_destination_evidence_kind_check" CHECK (("destination_evidence_kind" = ANY (ARRAY['public_phone_source'::"text", 'prior_inbound_sms'::"text"]))),
    CONSTRAINT "outbound_sms_attempts_destination_evidence_object_check" CHECK (("jsonb_typeof"("destination_evidence") = 'object'::"text")),
    CONSTRAINT "outbound_sms_attempts_provider_check" CHECK (("provider" = 'twilio-messaging'::"text")),
    CONSTRAINT "outbound_sms_attempts_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'sent'::"text", 'delivered'::"text", 'undelivered'::"text", 'failed'::"text", 'unknown'::"text"]))),
    CONSTRAINT "outbound_sms_attempts_to_phone_e164_check" CHECK (("to_phone_e164" ~ '^\+[1-9][0-9]{1,14}$'::"text")),
    CONSTRAINT "outbound_sms_attempts_from_phone_e164_check" CHECK ((("from_phone_e164" IS NULL) OR ("from_phone_e164" ~ '^\+[1-9][0-9]{1,14}$'::"text")))
);

ALTER TABLE ONLY "public"."outbound_sms_attempts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."outbound_sms_attempts" OWNER TO "postgres";

ALTER TABLE ONLY "public"."outbound_sms_attempts"
    ADD CONSTRAINT "outbound_sms_attempts_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."outbound_sms_attempts"
    ADD CONSTRAINT "outbound_sms_attempts_action_unique" UNIQUE ("profile_action_id");

CREATE UNIQUE INDEX "outbound_sms_attempts_provider_message_unique" ON "public"."outbound_sms_attempts" USING "btree" ("provider", "provider_message_sid") WHERE ("provider_message_sid" IS NOT NULL);

CREATE INDEX "outbound_sms_attempts_profile_created_idx" ON "public"."outbound_sms_attempts" USING "btree" ("profile_id", "created_at" DESC);

CREATE INDEX "outbound_sms_attempts_profile_status_idx" ON "public"."outbound_sms_attempts" USING "btree" ("profile_id", "status", "updated_at");

CREATE INDEX "outbound_sms_attempts_reply_to_message_sid_idx" ON "public"."outbound_sms_attempts" USING "btree" ("reply_to_message_sid") WHERE ("reply_to_message_sid" IS NOT NULL);

CREATE OR REPLACE TRIGGER "set_updated_at_outbound_sms_attempts" BEFORE UPDATE ON "public"."outbound_sms_attempts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

ALTER TABLE ONLY "public"."outbound_sms_attempts"
    ADD CONSTRAINT "outbound_sms_attempts_profile_action_id_profile_actions_id_fk" FOREIGN KEY ("profile_action_id") REFERENCES "public"."profile_actions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."outbound_sms_attempts"
    ADD CONSTRAINT "outbound_sms_attempts_action_profile_fk" FOREIGN KEY ("profile_action_id", "profile_id") REFERENCES "public"."profile_actions"("id", "profile_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."outbound_sms_attempts"
    ADD CONSTRAINT "outbound_sms_attempts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."outbound_sms_attempts"
    ADD CONSTRAINT "outbound_sms_attempts_related_call_attempt_id_fk" FOREIGN KEY ("related_call_attempt_id") REFERENCES "public"."outbound_call_attempts"("id") ON DELETE SET NULL;

ALTER TABLE "public"."outbound_sms_attempts" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."outbound_sms_attempts" TO "service_role";

ALTER TABLE public.assistant_work_items
  DROP CONSTRAINT assistant_work_items_kind_check;

ALTER TABLE public.assistant_work_items
  ADD CONSTRAINT assistant_work_items_kind_check
  CHECK (
    kind = ANY (
      ARRAY[
        'google_calendar.event.changed'::text,
        'outlook_calendar.event.changed'::text,
        'gmail.email.received'::text,
        'outlook_mail.email.received'::text,
        'twilio.sms.received'::text,
        'monday.item.created'::text,
        'monday.item.updated'::text,
        'scheduled.task'::text,
        'boldsign.signature_request.changed'::text,
        'google_drive.file.created'::text,
        'google_drive.file.updated'::text,
        'google_drive.file.deleted'::text,
        'microsoft_onedrive.file.created'::text,
        'microsoft_onedrive.file.updated'::text,
        'microsoft_onedrive.file.deleted'::text,
        'microsoft_sharepoint.file.created'::text,
        'microsoft_sharepoint.file.updated'::text,
        'microsoft_sharepoint.file.deleted'::text
      ]
    )
  );

ALTER TABLE public.profile_assistant_work_routes
  DROP CONSTRAINT profile_assistant_work_routes_event_type_check;

ALTER TABLE public.profile_assistant_work_routes
  ADD CONSTRAINT profile_assistant_work_routes_event_type_check
  CHECK (
    event_type = ANY (
      ARRAY[
        'google_calendar.event.changed'::text,
        'outlook_calendar.event.changed'::text,
        'gmail.email.received'::text,
        'outlook_mail.email.received'::text,
        'twilio.sms.received'::text,
        'monday.item.created'::text,
        'monday.item.updated'::text,
        'boldsign.signature_request.changed'::text,
        'google_drive.file.created'::text,
        'google_drive.file.updated'::text,
        'google_drive.file.deleted'::text,
        'microsoft_onedrive.file.created'::text,
        'microsoft_onedrive.file.updated'::text,
        'microsoft_onedrive.file.deleted'::text,
        'microsoft_sharepoint.file.created'::text,
        'microsoft_sharepoint.file.updated'::text,
        'microsoft_sharepoint.file.deleted'::text
      ]
    )
  );
