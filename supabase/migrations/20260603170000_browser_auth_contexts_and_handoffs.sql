CREATE TABLE IF NOT EXISTS "public"."browser_auth_contexts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "primary_domain" "text" NOT NULL,
    "allowed_domains" "text"[] NOT NULL,
    "account_hint" "text",
    "browserbase_context_id" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "last_verified_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "browser_auth_contexts_account_hint_not_blank_check" CHECK ((("account_hint" IS NULL) OR ("length"("btrim"("account_hint")) > 0))),
    CONSTRAINT "browser_auth_contexts_allowed_domains_check" CHECK ((("cardinality"("allowed_domains") > 0) AND (NOT "array_to_string"("allowed_domains", ','::"text") ~~ '%,,%'::"text"))),
    CONSTRAINT "browser_auth_contexts_deleted_shape_check" CHECK ((("status" <> 'deleted'::"text") OR ("deleted_at" IS NOT NULL))),
    CONSTRAINT "browser_auth_contexts_label_not_blank_check" CHECK (("length"("btrim"("label")) > 0)),
    CONSTRAINT "browser_auth_contexts_primary_domain_not_blank_check" CHECK (("length"("btrim"("primary_domain")) > 0)),
    CONSTRAINT "browser_auth_contexts_provider_id_not_blank_check" CHECK (("length"("btrim"("browserbase_context_id")) > 0)),
    CONSTRAINT "browser_auth_contexts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'deleted'::"text"])))
);

ALTER TABLE "public"."browser_auth_contexts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY "public"."browser_auth_contexts" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."browser_auth_contexts" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."browser_handoffs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "task_flow_id" "uuid" NOT NULL,
    "browser_auth_context_id" "uuid",
    "browserbase_session_id" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'waiting'::"text" NOT NULL,
    "client_url" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "browser_handoffs_cancelled_shape_check" CHECK ((("status" <> 'cancelled'::"text") OR ("cancelled_at" IS NOT NULL))),
    CONSTRAINT "browser_handoffs_client_url_not_blank_check" CHECK (("length"("btrim"("client_url")) > 0)),
    CONSTRAINT "browser_handoffs_completed_shape_check" CHECK ((("status" <> 'completed'::"text") OR ("completed_at" IS NOT NULL))),
    CONSTRAINT "browser_handoffs_reason_check" CHECK (("reason" = ANY (ARRAY['login_required'::"text", 'mfa_required'::"text", 'captcha_required'::"text"]))),
    CONSTRAINT "browser_handoffs_session_id_not_blank_check" CHECK (("length"("btrim"("browserbase_session_id")) > 0)),
    CONSTRAINT "browser_handoffs_status_check" CHECK (("status" = ANY (ARRAY['waiting'::"text", 'completed'::"text", 'cancelled'::"text", 'expired'::"text"])))
);

ALTER TABLE "public"."browser_handoffs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY "public"."browser_handoffs" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."browser_handoffs" OWNER TO "postgres";

ALTER TABLE ONLY "public"."browser_auth_contexts"
    ADD CONSTRAINT "browser_auth_contexts_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."browser_handoffs"
    ADD CONSTRAINT "browser_handoffs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."browser_auth_contexts"
    ADD CONSTRAINT "browser_auth_contexts_provider_id_unique" UNIQUE ("browserbase_context_id");

CREATE INDEX "browser_auth_contexts_profile_active_idx" ON "public"."browser_auth_contexts" USING "btree" ("profile_id", "status", "primary_domain");

CREATE INDEX "browser_handoffs_profile_status_idx" ON "public"."browser_handoffs" USING "btree" ("profile_id", "status", "expires_at");

CREATE INDEX "browser_handoffs_task_flow_idx" ON "public"."browser_handoffs" USING "btree" ("task_flow_id");

ALTER TABLE ONLY "public"."browser_auth_contexts"
    ADD CONSTRAINT "browser_auth_contexts_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."browser_handoffs"
    ADD CONSTRAINT "browser_handoffs_auth_context_id_fkey" FOREIGN KEY ("browser_auth_context_id") REFERENCES "public"."browser_auth_contexts"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."browser_handoffs"
    ADD CONSTRAINT "browser_handoffs_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."browser_handoffs"
    ADD CONSTRAINT "browser_handoffs_task_flow_id_fkey" FOREIGN KEY ("task_flow_id") REFERENCES "public"."task_flows"("id") ON DELETE CASCADE;

GRANT ALL ON TABLE "public"."browser_auth_contexts" TO "service_role";
GRANT ALL ON TABLE "public"."browser_handoffs" TO "service_role";
