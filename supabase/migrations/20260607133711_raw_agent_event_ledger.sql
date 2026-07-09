CREATE TABLE IF NOT EXISTS "public"."agent_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "agent_id" "text",
    "session_key" "text",
    "session_id" "text",
    "runtime_run_id" "text",
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "failure" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_runs_failure_object_check" CHECK ((("failure" IS NULL) OR ("jsonb_typeof"("failure") = 'object'::"text"))),
    CONSTRAINT "agent_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'succeeded'::"text", 'failed'::"text", 'cancelled'::"text", 'unknown'::"text"]))),
    CONSTRAINT "agent_runs_session_key_not_blank" CHECK ((("session_key" IS NULL) OR ("length"("btrim"("session_key")) > 0))),
    CONSTRAINT "agent_runs_session_id_not_blank" CHECK ((("session_id" IS NULL) OR ("length"("btrim"("session_id")) > 0))),
    CONSTRAINT "agent_runs_runtime_run_id_not_blank" CHECK ((("runtime_run_id" IS NULL) OR ("length"("btrim"("runtime_run_id")) > 0)))
);

ALTER TABLE ONLY "public"."agent_runs" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."agent_runs" OWNER TO "postgres";

ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "agent_runs_runtime_run_unique" ON "public"."agent_runs" USING "btree" ("runtime_run_id") WHERE ("runtime_run_id" IS NOT NULL);

CREATE INDEX "agent_runs_profile_started_idx" ON "public"."agent_runs" USING "btree" ("profile_id", "started_at" DESC);

CREATE INDEX "agent_runs_session_idx" ON "public"."agent_runs" USING "btree" ("profile_id", "session_key", "started_at" DESC) WHERE ("session_key" IS NOT NULL);

CREATE TABLE IF NOT EXISTS "public"."agent_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "agent_run_id" "uuid",
    "event_type" "text" NOT NULL,
    "source" "text" NOT NULL,
    "source_event_key" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "visibility" "text" DEFAULT 'internal'::"text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_events_event_type_not_blank" CHECK (("length"("btrim"("event_type")) > 0)),
    CONSTRAINT "agent_events_payload_object_check" CHECK (("jsonb_typeof"("payload") = 'object'::"text")),
    CONSTRAINT "agent_events_source_check" CHECK (("source" = ANY (ARRAY['backend'::"text", 'runtime_plugin'::"text", 'openclaw_session'::"text"]))),
    CONSTRAINT "agent_events_source_event_key_not_blank" CHECK ((("source_event_key" IS NULL) OR ("length"("btrim"("source_event_key")) > 0))),
    CONSTRAINT "agent_events_visibility_check" CHECK (("visibility" = ANY (ARRAY['internal'::"text", 'internal_sensitive'::"text", 'client_visible'::"text"])))
);

ALTER TABLE ONLY "public"."agent_events" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."agent_events" OWNER TO "postgres";

ALTER TABLE ONLY "public"."agent_events"
    ADD CONSTRAINT "agent_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."agent_events"
    ADD CONSTRAINT "agent_events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agent_events"
    ADD CONSTRAINT "agent_events_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX "agent_events_source_event_key_unique" ON "public"."agent_events" USING "btree" ("source_event_key") WHERE ("source_event_key" IS NOT NULL);

CREATE INDEX "agent_events_profile_occurred_idx" ON "public"."agent_events" USING "btree" ("profile_id", "occurred_at" DESC);

CREATE INDEX "agent_events_run_occurred_idx" ON "public"."agent_events" USING "btree" ("agent_run_id", "occurred_at" ASC) WHERE ("agent_run_id" IS NOT NULL);

CREATE INDEX "agent_events_type_occurred_idx" ON "public"."agent_events" USING "btree" ("event_type", "occurred_at" DESC);

CREATE INDEX "agent_events_channel_timeline_idx" ON "public"."agent_events" USING "btree" ("profile_id", "occurred_at" DESC) WHERE ("event_type" = ANY (ARRAY['channel.message.received'::"text", 'channel.message.delivered'::"text", 'channel.message.delivery_failed'::"text"]));

ALTER TABLE "public"."agent_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."agent_events" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."agent_runs" TO "service_role";
GRANT ALL ON TABLE "public"."agent_events" TO "service_role";
