-- Control plane: single initial migration (final-state DDL only).
-- Reset local DB with `npm run db -- migrate-local` after changes.
-- Regenerate generated DB contracts with `npm run db -- types`.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."assistant_work_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "dedupe_key" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "result" "jsonb",
    "last_error" "text",
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 5 NOT NULL,
    "available_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "origin_agent_id" "text",
    "origin_session_key" "text",
    "origin_session_id" "text",
    "origin_tool_call_id" "text",
    "origin_task_flow_id" "uuid",
    "origin_scheduled_task_id" "uuid",
    "claimed_by_agent_id" "text",
    "claimed_by_session_key" "text",
    "claim_token" "text",
    "claim_expires_at" timestamp with time zone,
    "claimed_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "assistant_work_items_attempts_check" CHECK ((("attempts" >= 0) AND ("max_attempts" >= 1) AND ("attempts" <= "max_attempts"))),
    CONSTRAINT "assistant_work_items_claimed_shape_check" CHECK ((("status" <> 'claimed'::"text") OR (("claim_token" IS NOT NULL) AND ("claim_expires_at" IS NOT NULL) AND ("claimed_by_agent_id" IS NOT NULL) AND ("claimed_by_session_key" IS NOT NULL) AND ("claimed_at" IS NOT NULL)))),
    CONSTRAINT "assistant_work_items_dedupe_key_not_blank_check" CHECK ((("dedupe_key" IS NULL) OR ("length"("btrim"("dedupe_key")) > 0))),
    CONSTRAINT "assistant_work_items_finished_shape_check" CHECK ((("status" <> ALL (ARRAY['succeeded'::"text", 'ignored'::"text", 'failed'::"text", 'cancelled'::"text"])) OR ("finished_at" IS NOT NULL))),
    CONSTRAINT "assistant_work_items_kind_check" CHECK (("kind" = ANY (ARRAY['google_calendar.event.changed'::"text", 'outlook_calendar.event.changed'::"text", 'gmail.email.received'::"text", 'outlook_mail.email.received'::"text", 'monday.record.created'::"text", 'monday.record.updated'::"text", 'scheduled.task'::"text", 'boldsign.signature_request.changed'::"text", 'microsoft_onedrive.file.created'::"text", 'microsoft_onedrive.file.updated'::"text", 'microsoft_onedrive.file.deleted'::"text", 'microsoft_sharepoint.file.created'::"text", 'microsoft_sharepoint.file.updated'::"text", 'microsoft_sharepoint.file.deleted'::"text"]))),
    CONSTRAINT "assistant_work_items_payload_object_check" CHECK (("jsonb_typeof"("payload") = 'object'::"text")),
    CONSTRAINT "assistant_work_items_pending_shape_check" CHECK ((("status" <> 'pending'::"text") OR (("claim_token" IS NULL) AND ("claim_expires_at" IS NULL) AND ("claimed_by_agent_id" IS NULL) AND ("claimed_by_session_key" IS NULL)))),
    CONSTRAINT "assistant_work_items_priority_check" CHECK (("priority" >= 0)),
    CONSTRAINT "assistant_work_items_result_object_check" CHECK ((("result" IS NULL) OR ("jsonb_typeof"("result") = 'object'::"text"))),
    CONSTRAINT "assistant_work_items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'claimed'::"text", 'succeeded'::"text", 'ignored'::"text", 'failed'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "public"."assistant_work_items" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."assistant_work_items" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_assistant_work_item"("profile_id" "text", "agent_id" "text", "session_key" "text", "lease_seconds" integer DEFAULT 900) RETURNS SETOF "public"."assistant_work_items"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  leased assistant_work_items%ROWTYPE;
BEGIN
  IF profile_id IS NULL OR btrim(profile_id) = '' THEN
    RAISE EXCEPTION 'profile_id is required.';
  END IF;
  IF agent_id IS NULL OR btrim(agent_id) = '' THEN
    RAISE EXCEPTION 'agent_id is required.';
  END IF;
  IF session_key IS NULL OR btrim(session_key) = '' THEN
    RAISE EXCEPTION 'session_key is required.';
  END IF;
  IF lease_seconds IS NULL OR lease_seconds <= 0 THEN
    RAISE EXCEPTION 'lease_seconds must be positive.';
  END IF;

  SELECT *
  INTO leased
  FROM assistant_work_items
  WHERE assistant_work_items.profile_id = claim_assistant_work_item.profile_id
    AND status = 'pending'
    AND available_at <= now()
    AND attempts < max_attempts
    AND (origin_agent_id IS NULL OR origin_agent_id = claim_assistant_work_item.agent_id)
  ORDER BY priority ASC, created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE assistant_work_items
  SET
    status = 'claimed',
    attempts = leased.attempts + 1,
    claimed_by_agent_id = agent_id,
    claimed_by_session_key = session_key,
    claim_token = gen_random_uuid()::text,
    claim_expires_at = now() + make_interval(secs => lease_seconds),
    claimed_at = now(),
    finished_at = NULL,
    updated_at = now()
  WHERE id = leased.id
  RETURNING * INTO leased;

  RETURN NEXT leased;
END;
$$;


ALTER FUNCTION "public"."claim_assistant_work_item"("profile_id" "text", "agent_id" "text", "session_key" "text", "lease_seconds" integer) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backend_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "capability_account_link_id" "uuid",
    "kind" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "dedupe_key" "text",
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 5 NOT NULL,
    "leased_by" "text",
    "lease_expires_at" timestamp with time zone,
    "origin_agent_id" "text",
    "origin_session_key" "text",
    "origin_session_id" "text",
    "origin_tool_call_id" "text",
    "origin_task_flow_id" "uuid",
    "run_after" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_error" "text",
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "backend_jobs_attempts_check" CHECK ((("attempts" >= 0) AND ("max_attempts" >= 1) AND ("attempts" <= "max_attempts"))),
    CONSTRAINT "backend_jobs_dedupe_key_not_blank_check" CHECK ((("dedupe_key" IS NULL) OR ("length"("btrim"("dedupe_key")) > 0))),
    CONSTRAINT "backend_jobs_finished_shape_check" CHECK ((("status" <> ALL (ARRAY['succeeded'::"text", 'failed'::"text", 'cancelled'::"text"])) OR ("finished_at" IS NOT NULL))),
    CONSTRAINT "backend_jobs_kind_check" CHECK (("kind" = ANY (ARRAY['assistant.scheduled_tasks.tick'::"text", 'capability.setup.monday'::"text", 'provider.webhook.process'::"text", 'provider.webhook.subscription.reconcile'::"text", 'provider.sync.process'::"text"]))),
    CONSTRAINT "backend_jobs_payload_object_check" CHECK (("jsonb_typeof"("payload") = 'object'::"text")),
    CONSTRAINT "backend_jobs_priority_check" CHECK (("priority" >= 0)),
    CONSTRAINT "backend_jobs_running_shape_check" CHECK ((("status" <> 'running'::"text") OR (("leased_by" IS NOT NULL) AND ("lease_expires_at" IS NOT NULL) AND ("started_at" IS NOT NULL)))),
    CONSTRAINT "backend_jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'succeeded'::"text", 'failed'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "public"."backend_jobs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."backend_jobs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lease_backend_job"("worker_id" "text", "lease_seconds" integer DEFAULT 60) RETURNS SETOF "public"."backend_jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  leased backend_jobs%ROWTYPE;
BEGIN
  IF worker_id IS NULL OR btrim(worker_id) = '' THEN
    RAISE EXCEPTION 'worker_id is required.';
  END IF;
  IF lease_seconds IS NULL OR lease_seconds <= 0 THEN
    RAISE EXCEPTION 'lease_seconds must be positive.';
  END IF;

  SELECT *
  INTO leased
  FROM backend_jobs
  WHERE status = 'queued'
    AND run_after <= now()
    AND attempts < max_attempts
    AND (lease_expires_at IS NULL OR lease_expires_at <= now())
  ORDER BY priority ASC, created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE backend_jobs
  SET
    status = 'running',
    attempts = leased.attempts + 1,
    leased_by = worker_id,
    lease_expires_at = now() + make_interval(secs => lease_seconds),
    started_at = COALESCE(started_at, now()),
    finished_at = NULL,
    updated_at = now()
  WHERE id = leased.id
  RETURNING * INTO leased;

  RETURN NEXT leased;
END;
$$;


ALTER FUNCTION "public"."lease_backend_job"("worker_id" "text", "lease_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reclaim_expired_backend_jobs"("batch_limit" integer DEFAULT 50) RETURNS SETOF "public"."backend_jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF batch_limit IS NULL OR batch_limit <= 0 THEN
    RAISE EXCEPTION 'batch_limit must be positive.';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT *
    FROM backend_jobs
    WHERE status = 'running'
      AND lease_expires_at <= now()
    ORDER BY lease_expires_at ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT batch_limit
  ),
  updated AS (
    UPDATE backend_jobs AS job
    SET
      status = CASE WHEN candidates.attempts < candidates.max_attempts THEN 'queued' ELSE 'failed' END,
      lease_expires_at = NULL,
      leased_by = NULL,
      run_after = CASE WHEN candidates.attempts < candidates.max_attempts THEN now() ELSE job.run_after END,
      finished_at = CASE WHEN candidates.attempts < candidates.max_attempts THEN NULL ELSE now() END,
      last_error = CASE
        WHEN candidates.attempts < candidates.max_attempts THEN 'backend_job_lease_expired_requeued'
        ELSE 'backend_job_lease_expired_failed'
      END,
      updated_at = now()
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING job.*
  )
  SELECT * FROM updated;
END;
$$;


ALTER FUNCTION "public"."reclaim_expired_backend_jobs"("batch_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "rules" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "approval_policies_rules_object_check" CHECK (("jsonb_typeof"("rules") = 'object'::"text"))
);

ALTER TABLE ONLY "public"."approval_policies" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."approval_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artifacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "task_flow_id" "uuid",
    "profile_action_id" "uuid",
    "storage_bucket" "text" DEFAULT 'profile-artifacts'::"text" NOT NULL,
    "storage_key" "text" NOT NULL,
    "filename" "text" NOT NULL,
    "description" "text",
    "mime_type" "text",
    "byte_size" integer,
    "sha256" "text",
    "artifact_type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "artifacts_artifact_type_not_blank" CHECK (("length"("btrim"("artifact_type")) > 0)),
    CONSTRAINT "artifacts_byte_size_nonnegative" CHECK ((("byte_size" IS NULL) OR ("byte_size" >= 0))),
    CONSTRAINT "artifacts_filename_not_blank" CHECK (("length"("btrim"("filename")) > 0)),
    CONSTRAINT "artifacts_metadata_object_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "artifacts_storage_bucket_not_blank" CHECK (("length"("btrim"("storage_bucket")) > 0)),
    CONSTRAINT "artifacts_storage_key_not_blank" CHECK (("length"("btrim"("storage_key")) > 0))
);

ALTER TABLE ONLY "public"."artifacts" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."artifacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assistant_scheduled_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "instructions" "text" NOT NULL,
    "schedule" "jsonb" NOT NULL,
    "timezone" "text",
    "next_run_at" timestamp with time zone,
    "last_run_at" timestamp with time zone,
    "revision" integer DEFAULT 1 NOT NULL,
    "created_by_agent_id" "text",
    "created_by_session_key" "text",
    "created_by_session_id" "text",
    "created_by_tool_call_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "assistant_scheduled_tasks_instructions_not_blank" CHECK (("length"("btrim"("instructions")) > 0)),
    CONSTRAINT "assistant_scheduled_tasks_revision_check" CHECK (("revision" >= 1)),
    CONSTRAINT "assistant_scheduled_tasks_schedule_object_check" CHECK (("jsonb_typeof"("schedule") = 'object'::"text")),
    CONSTRAINT "assistant_scheduled_tasks_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'deleted'::"text"]))),
    CONSTRAINT "assistant_scheduled_tasks_timezone_not_blank" CHECK ((("timezone" IS NULL) OR ("length"("btrim"("timezone")) > 0))),
    CONSTRAINT "assistant_scheduled_tasks_title_not_blank" CHECK (("length"("btrim"("title")) > 0))
);

ALTER TABLE ONLY "public"."assistant_scheduled_tasks" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."assistant_scheduled_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assistants" (
    "assistant_id" "text" NOT NULL,
    "profile_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "assistants_assistant_id_not_blank" CHECK (("length"("btrim"("assistant_id")) > 0))
);

ALTER TABLE ONLY "public"."assistants" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."assistants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."capability_account_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "profile_capability_id" "uuid" NOT NULL,
    "connected_provider_account_id" "uuid",
    "capability_slug" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "label" "text" NOT NULL,
    "status" "text" DEFAULT 'enabled'::"text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "required" boolean DEFAULT false NOT NULL,
    "readiness_status" "text" DEFAULT 'not_connected'::"text" NOT NULL,
    "readiness_blocker_code" "text",
    "readiness_latest_backend_job_id" "uuid",
    "readiness_last_success_at" timestamp with time zone,
    "readiness_last_error" "text",
    "readiness_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "capability_account_links_capability_slug_shape_check" CHECK ((("length"("btrim"("capability_slug")) > 0) AND ("capability_slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text"))),
    CONSTRAINT "capability_account_links_config_object_check" CHECK (("jsonb_typeof"("config") = 'object'::"text")),
    CONSTRAINT "capability_account_links_label_not_blank" CHECK (("length"("btrim"("label")) > 0)),
    CONSTRAINT "capability_account_links_provider_shape_check" CHECK ((("length"("btrim"("provider")) > 0) AND ("provider" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text"))),
    CONSTRAINT "capability_account_links_readiness_blocked_shape_check" CHECK ((("readiness_status" <> 'blocked'::"text") OR ("readiness_blocker_code" IS NOT NULL))),
    CONSTRAINT "capability_account_links_readiness_blocker_code_check" CHECK ((("readiness_blocker_code" IS NULL) OR ("readiness_blocker_code" = ANY (ARRAY['credential_required'::"text", 'reconnect_required'::"text", 'provider_setup_required'::"text", 'monday_activation_metadata_incomplete'::"text", 'ambiguous_account'::"text", 'duplicate_connected_account'::"text"])))),
    CONSTRAINT "capability_account_links_readiness_metadata_object_check" CHECK (("jsonb_typeof"("readiness_metadata") = 'object'::"text")),
    CONSTRAINT "capability_account_links_readiness_ready_shape_check" CHECK ((("readiness_status" <> 'ready'::"text") OR ("readiness_last_error" IS NULL))),
    CONSTRAINT "capability_account_links_readiness_status_check" CHECK (("readiness_status" = ANY (ARRAY['not_connected'::"text", 'blocked'::"text", 'queued'::"text", 'running'::"text", 'ready'::"text", 'error'::"text"]))),
    CONSTRAINT "capability_account_links_status_check" CHECK (("status" = ANY (ARRAY['enabled'::"text", 'disabled'::"text"])))
);

ALTER TABLE ONLY "public"."capability_account_links" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."capability_account_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."connected_provider_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_account_id" "text" NOT NULL,
    "account_email" "text",
    "display_label" "text",
    "scopes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "connection_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "credential_kind" "text" DEFAULT 'nango_oauth'::"text" NOT NULL,
    "nango_connection_id" "text",
    "nango_provider_config_key" "text",
    "credential_status" "text",
    "connected_at" timestamp with time zone,
    "last_error" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "connected_provider_accounts_connected_shape_check" CHECK ((("connection_status" <> 'connected'::"text") OR (("connected_at" IS NOT NULL) AND ((("credential_kind" = 'backend_secret'::"text") AND ("credential_status" = 'healthy'::"text")) OR (("credential_kind" = 'nango_oauth'::"text") AND ("credential_status" IS NOT NULL) AND ("credential_status" <> 'revoked'::"text") AND ("nango_connection_id" IS NOT NULL) AND ("length"("btrim"("nango_connection_id")) > 0) AND ("nango_provider_config_key" IS NOT NULL) AND ("length"("btrim"("nango_provider_config_key")) > 0)))))),
    CONSTRAINT "connected_provider_accounts_credential_kind_check" CHECK (("credential_kind" = ANY (ARRAY['nango_oauth'::"text", 'backend_secret'::"text"]))),
    CONSTRAINT "connected_provider_accounts_credential_status_check" CHECK ((("credential_status" IS NULL) OR ("credential_status" = ANY (ARRAY['healthy'::"text", 'reconnect_required'::"text", 'revoked'::"text"])))),
    CONSTRAINT "connected_provider_accounts_metadata_object_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "connected_provider_accounts_non_connected_not_usable_check" CHECK ((("connection_status" = 'connected'::"text") OR ("credential_status" IS NULL) OR ("credential_status" = 'revoked'::"text"))),
    CONSTRAINT "connected_provider_accounts_provider_account_id_not_blank" CHECK (("length"("btrim"("provider_account_id")) > 0)),
    CONSTRAINT "connected_provider_accounts_provider_shape_check" CHECK ((("length"("btrim"("provider")) > 0) AND ("provider" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text"))),
    CONSTRAINT "connected_provider_accounts_scopes_array_check" CHECK (("jsonb_typeof"("scopes") = 'array'::"text")),
    CONSTRAINT "connected_provider_accounts_status_check" CHECK (("connection_status" = ANY (ARRAY['pending'::"text", 'connected'::"text", 'disconnected'::"text", 'failed'::"text"])))
);

ALTER TABLE ONLY "public"."connected_provider_accounts" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."connected_provider_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "task_flow_id" "uuid",
    "tool_call_id" "text",
    "tool_name" "text" NOT NULL,
    "action_type" "text" NOT NULL,
    "target_id" "text",
    "idempotency_key" "text" NOT NULL,
    "provider_idempotency_key" "text" NOT NULL,
    "request_hash" "text" NOT NULL,
    "requester_assistant_id" "text",
    "origin_profile_channel_id" "uuid",
    "origin_channel_provider" "text",
    "origin_sender_id" "text",
    "origin_session_key" "text",
    "origin_session_id" "text",
    "title" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "risk_level" "text" DEFAULT 'low'::"text" NOT NULL,
    "review_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "expires_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending_approval'::"text" NOT NULL,
    "execution_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "result_payload" "jsonb",
    "provider_error" "jsonb",
    "provider_execution_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "provider_execution_started_at" timestamp with time zone,
    "provider_execution_finished_at" timestamp with time zone,
    "provider_execution_attempts" integer DEFAULT 0 NOT NULL,
    "decision" "text",
    "decision_source" "text",
    "decision_expected_request_hash" "text",
    "decision_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "decided_by_user_id" "uuid",
    "decided_by_channel_id" "uuid",
    "decided_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "equivalent_action_key" "text",
    CONSTRAINT "profile_actions_action_type_not_blank" CHECK (("length"("btrim"("action_type")) > 0)),
    CONSTRAINT "profile_actions_decision_actor_check" CHECK ((("decision" IS NULL) OR ((("decision_source" = 'portal'::"text") AND ("decided_by_user_id" IS NOT NULL) AND ("decided_by_channel_id" IS NULL)) OR (("decision_source" = 'trusted_channel'::"text") AND ("decided_by_channel_id" IS NOT NULL) AND ("decided_by_user_id" IS NULL))))),
    CONSTRAINT "profile_actions_decision_check" CHECK ((("decision" IS NULL) OR ("decision" = ANY (ARRAY['approved'::"text", 'rejected'::"text"])))),
    CONSTRAINT "profile_actions_decision_metadata_object_check" CHECK (("jsonb_typeof"("decision_metadata") = 'object'::"text")),
    CONSTRAINT "profile_actions_decision_shape_check" CHECK (((("decision" IS NULL) AND ("decision_source" IS NULL) AND ("decided_by_user_id" IS NULL) AND ("decided_by_channel_id" IS NULL) AND ("decided_at" IS NULL)) OR (("decision" IS NOT NULL) AND ("decision_source" IS NOT NULL) AND ("decided_at" IS NOT NULL)))),
    CONSTRAINT "profile_actions_decision_source_check" CHECK ((("decision_source" IS NULL) OR ("decision_source" = ANY (ARRAY['portal'::"text", 'trusted_channel'::"text"])))),
    CONSTRAINT "profile_actions_execution_payload_object_check" CHECK (("jsonb_typeof"("execution_payload") = 'object'::"text")),
    CONSTRAINT "profile_actions_idempotency_key_not_blank" CHECK (("length"("btrim"("idempotency_key")) > 0)),
    CONSTRAINT "profile_actions_pending_expiry_check" CHECK ((("status" <> 'pending_approval'::"text") OR ("expires_at" IS NOT NULL))),
    CONSTRAINT "profile_actions_provider_error_object_check" CHECK ((("provider_error" IS NULL) OR ("jsonb_typeof"("provider_error") = 'object'::"text"))),
    CONSTRAINT "profile_actions_provider_execution_attempts_check" CHECK (("provider_execution_attempts" >= 0)),
    CONSTRAINT "profile_actions_provider_execution_status_check" CHECK (("provider_execution_status" = ANY (ARRAY['not_started'::"text", 'started'::"text", 'completed'::"text", 'failed'::"text", 'unknown'::"text"]))),
    CONSTRAINT "profile_actions_provider_idempotency_key_not_blank" CHECK (("length"("btrim"("provider_idempotency_key")) > 0)),
    CONSTRAINT "profile_actions_request_hash_not_blank" CHECK (("length"("btrim"("request_hash")) > 0)),
    CONSTRAINT "profile_actions_result_payload_object_check" CHECK ((("result_payload" IS NULL) OR ("jsonb_typeof"("result_payload") = 'object'::"text"))),
    CONSTRAINT "profile_actions_review_payload_object_check" CHECK (("jsonb_typeof"("review_payload") = 'object'::"text")),
    CONSTRAINT "profile_actions_risk_level_check" CHECK (("risk_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "profile_actions_status_check" CHECK (("status" = ANY (ARRAY['pending_approval'::"text", 'processing'::"text", 'executed'::"text", 'rejected'::"text", 'expired'::"text", 'failed'::"text", 'unknown'::"text", 'blocked'::"text"]))),
    CONSTRAINT "profile_actions_summary_not_blank" CHECK (("length"("btrim"("summary")) > 0)),
    CONSTRAINT "profile_actions_title_not_blank" CHECK (("length"("btrim"("title")) > 0)),
    CONSTRAINT "profile_actions_tool_name_not_blank" CHECK (("length"("btrim"("tool_name")) > 0))
);

ALTER TABLE ONLY "public"."profile_actions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_assistant_work_routes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "managed_by" "text" DEFAULT 'onboarding'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profile_assistant_work_routes_config_object_check" CHECK (("jsonb_typeof"("config") = 'object'::"text")),
    CONSTRAINT "profile_assistant_work_routes_event_type_check" CHECK (("event_type" = ANY (ARRAY['google_calendar.event.changed'::"text", 'outlook_calendar.event.changed'::"text", 'gmail.email.received'::"text", 'outlook_mail.email.received'::"text", 'monday.record.created'::"text", 'monday.record.updated'::"text", 'boldsign.signature_request.changed'::"text", 'microsoft_onedrive.file.created'::"text", 'microsoft_onedrive.file.updated'::"text", 'microsoft_onedrive.file.deleted'::"text", 'microsoft_sharepoint.file.created'::"text", 'microsoft_sharepoint.file.updated'::"text", 'microsoft_sharepoint.file.deleted'::"text"]))),
    CONSTRAINT "profile_assistant_work_routes_event_type_not_blank" CHECK (("length"("btrim"("event_type")) > 0)),
    CONSTRAINT "profile_assistant_work_routes_managed_by_check" CHECK (("managed_by" = ANY (ARRAY['onboarding'::"text", 'profile'::"text"])))
);

ALTER TABLE ONLY "public"."profile_assistant_work_routes" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_assistant_work_routes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_capabilities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "capability_slug" "text" NOT NULL,
    "status" "text" DEFAULT 'enabled'::"text" NOT NULL,
    "required" boolean DEFAULT false NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profile_capabilities_capability_slug_shape_check" CHECK ((("length"("btrim"("capability_slug")) > 0) AND ("capability_slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text"))),
    CONSTRAINT "profile_capabilities_config_object_check" CHECK (("jsonb_typeof"("config") = 'object'::"text")),
    CONSTRAINT "profile_capabilities_status_check" CHECK (("status" = ANY (ARRAY['enabled'::"text", 'disabled'::"text"])))
);

ALTER TABLE ONLY "public"."profile_capabilities" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_capabilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "external_identity" "text" NOT NULL,
    "delivery_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profile_channels_delivery_config_object_check" CHECK (("jsonb_typeof"("delivery_config") = 'object'::"text")),
    CONSTRAINT "profile_channels_external_identity_not_blank" CHECK (("length"("btrim"("external_identity")) > 0)),
    CONSTRAINT "profile_channels_provider_check" CHECK (("provider" = ANY (ARRAY['telegram'::"text", 'webchat'::"text", 'e2e-test'::"text"]))),
    CONSTRAINT "profile_channels_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);

ALTER TABLE ONLY "public"."profile_channels" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_memories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "content" "text" NOT NULL,
    "normalized_content" "text" NOT NULL,
    "content_hash" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "source" "text" DEFAULT 'assistant'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by_user_id" "uuid",
    "created_by_assistant_id" "text",
    "archived_by_user_id" "uuid",
    "archived_by_assistant_id" "text",
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profile_memories_archive_shape_check" CHECK (((("status" = 'active'::"text") AND ("archived_at" IS NULL)) OR (("status" <> 'active'::"text") AND ("archived_at" IS NOT NULL)))),
    CONSTRAINT "profile_memories_content_hash_not_blank" CHECK (("length"("btrim"("content_hash")) > 0)),
    CONSTRAINT "profile_memories_content_not_blank" CHECK (("length"("btrim"("content")) >= 3)),
    CONSTRAINT "profile_memories_metadata_object_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "profile_memories_normalized_content_not_blank" CHECK (("length"("btrim"("normalized_content")) >= 3)),
    CONSTRAINT "profile_memories_reason_not_blank" CHECK (("length"("btrim"("reason")) > 0)),
    CONSTRAINT "profile_memories_source_not_blank" CHECK (("length"("btrim"("source")) > 0)),
    CONSTRAINT "profile_memories_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'forgotten'::"text"])))
);

ALTER TABLE ONLY "public"."profile_memories" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_memories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_portal_launch_intents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "surface" "text" DEFAULT 'telegram_mini_app'::"text" NOT NULL,
    "section" "text" NOT NULL,
    "intent_type" "text" NOT NULL,
    "intent_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "origin_agent_id" "text",
    "origin_session_key" "text",
    "origin_session_id" "text",
    "origin_tool_call_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profile_portal_launch_intents_consumed_shape_check" CHECK ((("status" <> 'consumed'::"text") OR ("consumed_at" IS NOT NULL))),
    CONSTRAINT "profile_portal_launch_intents_intent_payload_object_check" CHECK (("jsonb_typeof"("intent_payload") = 'object'::"text")),
    CONSTRAINT "profile_portal_launch_intents_intent_type_check" CHECK (("intent_type" = ANY (ARRAY['section'::"text", 'approval'::"text", 'integration'::"text"]))),
    CONSTRAINT "profile_portal_launch_intents_section_check" CHECK (("section" = ANY (ARRAY['integrations'::"text", 'approvals'::"text"]))),
    CONSTRAINT "profile_portal_launch_intents_slug_shape_check" CHECK (("slug" ~ '^[A-Za-z0-9_-]{16,128}$'::"text")),
    CONSTRAINT "profile_portal_launch_intents_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'consumed'::"text", 'expired'::"text"]))),
    CONSTRAINT "profile_portal_launch_intents_surface_check" CHECK (("surface" = 'telegram_mini_app'::"text"))
);

ALTER TABLE ONLY "public"."profile_portal_launch_intents" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_portal_launch_intents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "proposal_kind" "text" NOT NULL,
    "status" "text" DEFAULT 'proposed'::"text" NOT NULL,
    "revision" integer DEFAULT 1 NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "proposal_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "review_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "equivalence_key" "text" NOT NULL,
    "expires_at" timestamp with time zone,
    "decided_at" timestamp with time zone,
    "decision" "text",
    "decision_source" "text",
    "decided_by_user_id" "uuid",
    "converted_profile_action_id" "uuid",
    "source_task_flow_id" "uuid",
    "source_work_item_id" "uuid",
    "source_scheduled_task_id" "uuid",
    "superseded_by_proposal_id" "uuid",
    "blocker_code" "text",
    "blocker_summary" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profile_proposals_blocked_reason_check" CHECK ((("status" <> 'blocked'::"text") OR ("blocker_summary" IS NOT NULL))),
    CONSTRAINT "profile_proposals_converted_action_status_check" CHECK ((("status" <> 'converted'::"text") OR ("converted_profile_action_id" IS NOT NULL))),
    CONSTRAINT "profile_proposals_decision_check" CHECK ((("decision" IS NULL) OR ("decision" = ANY (ARRAY['approved'::"text", 'rejected'::"text"])))),
    CONSTRAINT "profile_proposals_decision_source_check" CHECK ((("decision_source" IS NULL) OR ("decision_source" = 'portal'::"text"))),
    CONSTRAINT "profile_proposals_equivalence_key_nonblank" CHECK (("btrim"("equivalence_key") <> ''::"text")),
    CONSTRAINT "profile_proposals_evidence_object_check" CHECK (("jsonb_typeof"("evidence") = 'object'::"text")),
    CONSTRAINT "profile_proposals_kind_check" CHECK (("proposal_kind" = ANY (ARRAY['gmail.email.follow_up'::"text", 'outlook_mail.email.follow_up'::"text"]))),
    CONSTRAINT "profile_proposals_kind_nonblank" CHECK (("btrim"("proposal_kind") <> ''::"text")),
    CONSTRAINT "profile_proposals_payload_object_check" CHECK (("jsonb_typeof"("proposal_payload") = 'object'::"text")),
    CONSTRAINT "profile_proposals_review_object_check" CHECK (("jsonb_typeof"("review_payload") = 'object'::"text")),
    CONSTRAINT "profile_proposals_revision_check" CHECK (("revision" >= 1)),
    CONSTRAINT "profile_proposals_status_check" CHECK (("status" = ANY (ARRAY['proposed'::"text", 'blocked'::"text", 'converting'::"text", 'converted'::"text", 'rejected'::"text", 'expired'::"text", 'superseded'::"text"]))),
    CONSTRAINT "profile_proposals_title_nonblank" CHECK (("btrim"("title") <> ''::"text"))
);

ALTER TABLE ONLY "public"."profile_proposals" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_proposals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'UTC'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_display_name_not_blank" CHECK (("length"("btrim"("display_name")) > 0)),
    CONSTRAINT "profiles_id_shape_check" CHECK (("id" ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'::"text")),
    CONSTRAINT "profiles_metadata_object_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "profiles_preferences_object_check" CHECK (("jsonb_typeof"("preferences") = 'object'::"text")),
    CONSTRAINT "profiles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"]))),
    CONSTRAINT "profiles_timezone_not_blank" CHECK (("length"("btrim"("timezone")) > 0))
);

ALTER TABLE ONLY "public"."profiles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_connect_intents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "profile_capability_id" "uuid" NOT NULL,
    "capability_slug" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "requested_label" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "connected_provider_account_id" "uuid",
    "capability_account_link_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "provider_connect_intents_capability_slug_shape_check" CHECK ((("length"("btrim"("capability_slug")) > 0) AND ("capability_slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text"))),
    CONSTRAINT "provider_connect_intents_provider_shape_check" CHECK ((("length"("btrim"("provider")) > 0) AND ("provider" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text"))),
    CONSTRAINT "provider_connect_intents_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'expired'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "public"."provider_connect_intents" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_connect_intents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_webhook_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_key" "text" NOT NULL,
    "adapter_key" "text" NOT NULL,
    "subscription_id" "uuid",
    "delivery_key" "text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "authenticated" boolean DEFAULT false NOT NULL,
    "request_headers" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "payload_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "backend_job_id" "uuid",
    "error_code" "text",
    "error_message" "text",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "provider_webhook_deliveries_adapter_key_not_blank" CHECK (("length"("btrim"("adapter_key")) > 0)),
    CONSTRAINT "provider_webhook_deliveries_delivery_key_not_blank" CHECK (("length"("btrim"("delivery_key")) > 0)),
    CONSTRAINT "provider_webhook_deliveries_failed_shape_check" CHECK ((("status" <> 'failed'::"text") OR ("error_code" IS NOT NULL))),
    CONSTRAINT "provider_webhook_deliveries_payload_hash_not_blank" CHECK (("length"("btrim"("payload_hash")) > 0)),
    CONSTRAINT "provider_webhook_deliveries_payload_object_check" CHECK (("jsonb_typeof"("payload") = 'object'::"text")),
    CONSTRAINT "provider_webhook_deliveries_processed_shape_check" CHECK ((("status" <> ALL (ARRAY['processed'::"text", 'ignored'::"text"])) OR ("processed_at" IS NOT NULL))),
    CONSTRAINT "provider_webhook_deliveries_provider_key_not_blank" CHECK (("length"("btrim"("provider_key")) > 0)),
    CONSTRAINT "provider_webhook_deliveries_request_headers_object_check" CHECK (("jsonb_typeof"("request_headers") = 'object'::"text")),
    CONSTRAINT "provider_webhook_deliveries_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'processed'::"text", 'failed'::"text", 'ignored'::"text"])))
);

ALTER TABLE ONLY "public"."provider_webhook_deliveries" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_webhook_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_webhook_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "capability_account_link_id" "uuid" NOT NULL,
    "connected_provider_account_id" "uuid" NOT NULL,
    "provider_key" "text" NOT NULL,
    "adapter_key" "text" NOT NULL,
    "external_subscription_id" "text",
    "resource_type" "text" NOT NULL,
    "resource_id" "text" NOT NULL,
    "event_scope" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "next_reconcile_at" timestamp with time zone,
    "cursor" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "provider_state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_notification_at" timestamp with time zone,
    "last_success_at" timestamp with time zone,
    "last_error_code" "text",
    "last_error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "provider_webhook_subscriptions_adapter_key_not_blank" CHECK (("length"("btrim"("adapter_key")) > 0)),
    CONSTRAINT "provider_webhook_subscriptions_cursor_object_check" CHECK (("jsonb_typeof"("cursor") = 'object'::"text")),
    CONSTRAINT "provider_webhook_subscriptions_event_scope_not_blank" CHECK (("length"("btrim"("event_scope")) > 0)),
    CONSTRAINT "provider_webhook_subscriptions_external_subscription_id_not_bla" CHECK ((("external_subscription_id" IS NULL) OR ("length"("btrim"("external_subscription_id")) > 0))),
    CONSTRAINT "provider_webhook_subscriptions_provider_key_not_blank" CHECK (("length"("btrim"("provider_key")) > 0)),
    CONSTRAINT "provider_webhook_subscriptions_provider_state_object_check" CHECK (("jsonb_typeof"("provider_state") = 'object'::"text")),
    CONSTRAINT "provider_webhook_subscriptions_resource_id_not_blank" CHECK (("length"("btrim"("resource_id")) > 0)),
    CONSTRAINT "provider_webhook_subscriptions_resource_type_not_blank" CHECK (("length"("btrim"("resource_type")) > 0)),
    CONSTRAINT "provider_webhook_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'unhealthy'::"text", 'disabled'::"text"])))
);

ALTER TABLE ONLY "public"."provider_webhook_subscriptions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_webhook_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_write_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "capability_account_link_id" "uuid" NOT NULL,
    "connected_provider_account_id" "uuid" NOT NULL,
    "provider_key" "text" NOT NULL,
    "capability_slug" "text" NOT NULL,
    "tool_name" "text" NOT NULL,
    "profile_action_id" "uuid" NOT NULL,
    "external_resource_type" "text" NOT NULL,
    "external_resource_id" "text" NOT NULL,
    "operation" "text" NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "finished_at" timestamp with time zone NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "provider_write_receipts_capability_slug_not_blank" CHECK (("length"("btrim"("capability_slug")) > 0)),
    CONSTRAINT "provider_write_receipts_external_resource_id_not_blank" CHECK (("length"("btrim"("external_resource_id")) > 0)),
    CONSTRAINT "provider_write_receipts_external_resource_type_not_blank" CHECK (("length"("btrim"("external_resource_type")) > 0)),
    CONSTRAINT "provider_write_receipts_metadata_object_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "provider_write_receipts_operation_not_blank" CHECK (("length"("btrim"("operation")) > 0)),
    CONSTRAINT "provider_write_receipts_provider_key_not_blank" CHECK (("length"("btrim"("provider_key")) > 0)),
    CONSTRAINT "provider_write_receipts_tool_name_not_blank" CHECK (("length"("btrim"("tool_name")) > 0))
);

ALTER TABLE ONLY "public"."provider_write_receipts" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_write_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_flow_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_flow_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_type" "text" DEFAULT 'system'::"text" NOT NULL,
    "actor_id" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_flow_events_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['system'::"text", 'assistant'::"text", 'profile'::"text", 'profile_user'::"text"]))),
    CONSTRAINT "task_flow_events_event_type_not_blank" CHECK (("length"("btrim"("event_type")) > 0)),
    CONSTRAINT "task_flow_events_payload_object_check" CHECK (("jsonb_typeof"("payload") = 'object'::"text"))
);

ALTER TABLE ONLY "public"."task_flow_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_flow_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_flows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "dedupe_key" "text" NOT NULL,
    "assigned_assistant_id" "text",
    "goal" "text" NOT NULL,
    "note" "text",
    "summary" "text",
    "state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "wait" "jsonb",
    "result" "jsonb",
    "revision" integer DEFAULT 1 NOT NULL,
    "cancel_requested_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    CONSTRAINT "task_flows_dedupe_key_not_blank" CHECK (("length"("btrim"("dedupe_key")) > 0)),
    CONSTRAINT "task_flows_goal_not_blank" CHECK (("length"("btrim"("goal")) > 0)),
    CONSTRAINT "task_flows_note_not_blank" CHECK ((("note" IS NULL) OR ("length"("btrim"("note")) > 0))),
    CONSTRAINT "task_flows_result_object_check" CHECK ((("result" IS NULL) OR ("jsonb_typeof"("result") = 'object'::"text"))),
    CONSTRAINT "task_flows_revision_positive_check" CHECK (("revision" >= 1)),
    CONSTRAINT "task_flows_state_object_check" CHECK (("jsonb_typeof"("state") = 'object'::"text")),
    CONSTRAINT "task_flows_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'waiting'::"text", 'blocked'::"text", 'succeeded'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "task_flows_summary_not_blank" CHECK ((("summary" IS NULL) OR ("length"("btrim"("summary")) > 0))),
    CONSTRAINT "task_flows_terminal_ended_at_check" CHECK ((("status" <> ALL (ARRAY['succeeded'::"text", 'failed'::"text", 'cancelled'::"text"])) OR ("ended_at" IS NOT NULL))),
    CONSTRAINT "task_flows_wait_object_check" CHECK ((("wait" IS NULL) OR ("jsonb_typeof"("wait") = 'object'::"text")))
);

ALTER TABLE ONLY "public"."task_flows" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_flows" OWNER TO "postgres";


ALTER TABLE ONLY "public"."approval_policies"
    ADD CONSTRAINT "approval_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artifacts"
    ADD CONSTRAINT "artifacts_id_profile_unique" UNIQUE ("id", "profile_id");



ALTER TABLE ONLY "public"."artifacts"
    ADD CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assistant_scheduled_tasks"
    ADD CONSTRAINT "assistant_scheduled_tasks_id_profile_unique" UNIQUE ("id", "profile_id");



ALTER TABLE ONLY "public"."assistant_scheduled_tasks"
    ADD CONSTRAINT "assistant_scheduled_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assistant_work_items"
    ADD CONSTRAINT "assistant_work_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assistants"
    ADD CONSTRAINT "assistants_assistant_id_profile_unique" UNIQUE ("assistant_id", "profile_id");



ALTER TABLE ONLY "public"."assistants"
    ADD CONSTRAINT "assistants_pkey" PRIMARY KEY ("assistant_id");



ALTER TABLE ONLY "public"."backend_jobs"
    ADD CONSTRAINT "backend_jobs_id_profile_unique" UNIQUE ("id", "profile_id");



ALTER TABLE ONLY "public"."backend_jobs"
    ADD CONSTRAINT "backend_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."capability_account_links"
    ADD CONSTRAINT "capability_account_links_id_profile_unique" UNIQUE ("id", "profile_id");



ALTER TABLE ONLY "public"."capability_account_links"
    ADD CONSTRAINT "capability_account_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."connected_provider_accounts"
    ADD CONSTRAINT "connected_provider_accounts_id_profile_unique" UNIQUE ("id", "profile_id");



ALTER TABLE ONLY "public"."connected_provider_accounts"
    ADD CONSTRAINT "connected_provider_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_actions"
    ADD CONSTRAINT "profile_actions_id_profile_unique" UNIQUE ("id", "profile_id");



ALTER TABLE ONLY "public"."profile_actions"
    ADD CONSTRAINT "profile_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_assistant_work_routes"
    ADD CONSTRAINT "profile_assistant_work_routes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_capabilities"
    ADD CONSTRAINT "profile_capabilities_id_profile_unique" UNIQUE ("id", "profile_id");



ALTER TABLE ONLY "public"."profile_capabilities"
    ADD CONSTRAINT "profile_capabilities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_channels"
    ADD CONSTRAINT "profile_channels_id_profile_unique" UNIQUE ("id", "profile_id");



ALTER TABLE ONLY "public"."profile_channels"
    ADD CONSTRAINT "profile_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_memories"
    ADD CONSTRAINT "profile_memories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_portal_launch_intents"
    ADD CONSTRAINT "profile_portal_launch_intents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_proposals"
    ADD CONSTRAINT "profile_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_unique" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."provider_connect_intents"
    ADD CONSTRAINT "provider_connect_intents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_webhook_deliveries"
    ADD CONSTRAINT "provider_webhook_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_webhook_subscriptions"
    ADD CONSTRAINT "provider_webhook_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_write_receipts"
    ADD CONSTRAINT "provider_write_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_flow_events"
    ADD CONSTRAINT "task_flow_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_flows"
    ADD CONSTRAINT "task_flows_id_profile_unique" UNIQUE ("id", "profile_id");



ALTER TABLE ONLY "public"."task_flows"
    ADD CONSTRAINT "task_flows_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "approval_policies_profile_unique" ON "public"."approval_policies" USING "btree" ("profile_id");



CREATE INDEX "artifacts_filename_search_idx" ON "public"."artifacts" USING "gin" ("to_tsvector"('"simple"'::"regconfig", "filename"));



CREATE INDEX "artifacts_profile_type_idx" ON "public"."artifacts" USING "btree" ("profile_id", "artifact_type", "created_at" DESC);



CREATE UNIQUE INDEX "artifacts_storage_unique" ON "public"."artifacts" USING "btree" ("storage_bucket", "storage_key");



CREATE INDEX "assistant_scheduled_tasks_due_idx" ON "public"."assistant_scheduled_tasks" USING "btree" ("status", "next_run_at", "created_at") WHERE ("status" = 'active'::"text");



CREATE INDEX "assistant_scheduled_tasks_profile_status_idx" ON "public"."assistant_scheduled_tasks" USING "btree" ("profile_id", "status", "created_at" DESC);



CREATE INDEX "assistant_work_items_claimed_expiry_idx" ON "public"."assistant_work_items" USING "btree" ("claim_expires_at", "created_at") WHERE ("status" = 'claimed'::"text");



CREATE INDEX "assistant_work_items_due_idx" ON "public"."assistant_work_items" USING "btree" ("profile_id", "status", "available_at", "priority", "created_at") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "assistant_work_items_id_profile_unique" ON "public"."assistant_work_items" USING "btree" ("id", "profile_id");



CREATE INDEX "assistant_work_items_origin_scheduled_task_idx" ON "public"."assistant_work_items" USING "btree" ("origin_scheduled_task_id", "created_at" DESC) WHERE ("origin_scheduled_task_id" IS NOT NULL);



CREATE UNIQUE INDEX "assistant_work_items_profile_dedupe_unique" ON "public"."assistant_work_items" USING "btree" ("profile_id", "dedupe_key") WHERE ("dedupe_key" IS NOT NULL);



CREATE INDEX "assistant_work_items_profile_kind_created_idx" ON "public"."assistant_work_items" USING "btree" ("profile_id", "kind", "created_at" DESC);



CREATE INDEX "assistants_profile_idx" ON "public"."assistants" USING "btree" ("profile_id");



CREATE UNIQUE INDEX "assistants_profile_unique" ON "public"."assistants" USING "btree" ("profile_id");



CREATE UNIQUE INDEX "backend_jobs_active_dedupe_unique" ON "public"."backend_jobs" USING "btree" ("profile_id", "kind", "dedupe_key") WHERE (("dedupe_key" IS NOT NULL) AND ("status" = ANY (ARRAY['queued'::"text", 'running'::"text"])));



CREATE INDEX "backend_jobs_profile_idx" ON "public"."backend_jobs" USING "btree" ("profile_id");



CREATE INDEX "backend_jobs_profile_kind_capability_link_created_idx" ON "public"."backend_jobs" USING "btree" ("profile_id", "kind", "capability_account_link_id", "created_at" DESC);



CREATE INDEX "backend_jobs_ready_idx" ON "public"."backend_jobs" USING "btree" ("status", "run_after", "priority", "created_at");



CREATE INDEX "backend_jobs_running_lease_idx" ON "public"."backend_jobs" USING "btree" ("lease_expires_at", "created_at") WHERE ("status" = 'running'::"text");



CREATE UNIQUE INDEX "capability_account_links_capability_provider_label_unique" ON "public"."capability_account_links" USING "btree" ("profile_capability_id", "provider", "label");



CREATE UNIQUE INDEX "capability_account_links_one_active_account_per_capability_uniq" ON "public"."capability_account_links" USING "btree" ("profile_capability_id", "connected_provider_account_id") WHERE (("status" = 'enabled'::"text") AND ("connected_provider_account_id" IS NOT NULL));



CREATE UNIQUE INDEX "capability_account_links_one_default_per_capability_unique" ON "public"."capability_account_links" USING "btree" ("profile_capability_id") WHERE (("is_default" = true) AND ("status" = 'enabled'::"text"));



CREATE INDEX "capability_account_links_profile_capability_idx" ON "public"."capability_account_links" USING "btree" ("profile_id", "capability_slug", "status");



CREATE INDEX "capability_account_links_profile_provider_idx" ON "public"."capability_account_links" USING "btree" ("profile_id", "provider");



CREATE INDEX "capability_account_links_readiness_latest_job_idx" ON "public"."capability_account_links" USING "btree" ("readiness_latest_backend_job_id") WHERE ("readiness_latest_backend_job_id" IS NOT NULL);



CREATE UNIQUE INDEX "connected_provider_accounts_profile_nango_remote_unique" ON "public"."connected_provider_accounts" USING "btree" ("profile_id", "nango_provider_config_key", "nango_connection_id") WHERE (("nango_provider_config_key" IS NOT NULL) AND ("nango_connection_id" IS NOT NULL));



CREATE UNIQUE INDEX "connected_provider_accounts_profile_provider_account_unique" ON "public"."connected_provider_accounts" USING "btree" ("profile_id", "provider", "provider_account_id");



CREATE INDEX "connected_provider_accounts_profile_status_idx" ON "public"."connected_provider_accounts" USING "btree" ("profile_id", "connection_status", "updated_at" DESC);



CREATE UNIQUE INDEX "profile_action_idempotency_unique" ON "public"."profile_actions" USING "btree" ("idempotency_key");



CREATE UNIQUE INDEX "profile_actions_active_equivalent_unique" ON "public"."profile_actions" USING "btree" ("profile_id", "equivalent_action_key") WHERE (("equivalent_action_key" IS NOT NULL) AND ("status" = ANY (ARRAY['pending_approval'::"text", 'processing'::"text"])));



CREATE INDEX "profile_actions_origin_pending_idx" ON "public"."profile_actions" USING "btree" ("origin_profile_channel_id", "origin_sender_id", "origin_session_key", "status", "created_at") WHERE ("status" = 'pending_approval'::"text");



CREATE INDEX "profile_actions_processing_idx" ON "public"."profile_actions" USING "btree" ("profile_id", "status", "updated_at") WHERE ("status" = 'processing'::"text");



CREATE INDEX "profile_actions_profile_action_idx" ON "public"."profile_actions" USING "btree" ("profile_id", "action_type", "created_at" DESC);



CREATE INDEX "profile_actions_profile_pending_idx" ON "public"."profile_actions" USING "btree" ("profile_id", "status", "expires_at", "created_at" DESC) WHERE ("status" = 'pending_approval'::"text");



CREATE INDEX "profile_actions_profile_status_idx" ON "public"."profile_actions" USING "btree" ("profile_id", "status", "created_at" DESC);



CREATE INDEX "profile_actions_provider_execution_status_idx" ON "public"."profile_actions" USING "btree" ("profile_id", "provider_execution_status", "updated_at");



CREATE UNIQUE INDEX "profile_assistant_work_routes_profile_event_unique" ON "public"."profile_assistant_work_routes" USING "btree" ("profile_id", "event_type");



CREATE UNIQUE INDEX "profile_capabilities_profile_capability_slug_unique" ON "public"."profile_capabilities" USING "btree" ("profile_id", "capability_slug");



CREATE INDEX "profile_channels_profile_idx" ON "public"."profile_channels" USING "btree" ("profile_id");



CREATE UNIQUE INDEX "profile_channels_provider_identity_unique" ON "public"."profile_channels" USING "btree" ("provider", "external_identity");



CREATE UNIQUE INDEX "profile_memories_active_hash_unique" ON "public"."profile_memories" USING "btree" ("profile_id", "content_hash") WHERE ("status" = 'active'::"text");



CREATE INDEX "profile_memories_profile_status_idx" ON "public"."profile_memories" USING "btree" ("profile_id", "status", "updated_at" DESC);



CREATE INDEX "profile_portal_launch_intents_active_profile_idx" ON "public"."profile_portal_launch_intents" USING "btree" ("profile_id", "expires_at") WHERE ("status" = 'active'::"text");



CREATE UNIQUE INDEX "profile_portal_launch_intents_slug_unique" ON "public"."profile_portal_launch_intents" USING "btree" ("slug");



CREATE UNIQUE INDEX "profile_proposals_active_equivalent_unique" ON "public"."profile_proposals" USING "btree" ("profile_id", "proposal_kind", "equivalence_key") WHERE ("status" = ANY (ARRAY['proposed'::"text", 'blocked'::"text", 'converting'::"text"]));



CREATE INDEX "profile_proposals_profile_kind_equivalence_idx" ON "public"."profile_proposals" USING "btree" ("profile_id", "proposal_kind", "equivalence_key", "updated_at" DESC);



CREATE INDEX "profile_proposals_profile_status_idx" ON "public"."profile_proposals" USING "btree" ("profile_id", "status", "updated_at" DESC);



CREATE INDEX "profiles_user_id_idx" ON "public"."profiles" USING "btree" ("user_id");



CREATE INDEX "provider_connect_intents_profile_status_idx" ON "public"."provider_connect_intents" USING "btree" ("profile_id", "status", "expires_at");



CREATE UNIQUE INDEX "provider_webhook_deliveries_provider_delivery_unique" ON "public"."provider_webhook_deliveries" USING "btree" ("provider_key", "adapter_key", "delivery_key");



CREATE INDEX "provider_webhook_deliveries_status_received_idx" ON "public"."provider_webhook_deliveries" USING "btree" ("status", "received_at");



CREATE INDEX "provider_webhook_deliveries_subscription_received_idx" ON "public"."provider_webhook_deliveries" USING "btree" ("subscription_id", "received_at" DESC);



CREATE UNIQUE INDEX "provider_webhook_subscriptions_account_resource_scope_unique" ON "public"."provider_webhook_subscriptions" USING "btree" ("connected_provider_account_id", "adapter_key", "resource_type", "resource_id", "event_scope");



CREATE INDEX "provider_webhook_subscriptions_connected_account_idx" ON "public"."provider_webhook_subscriptions" USING "btree" ("connected_provider_account_id", "adapter_key", "status");



CREATE UNIQUE INDEX "provider_webhook_subscriptions_external_subscription_unique" ON "public"."provider_webhook_subscriptions" USING "btree" ("provider_key", "adapter_key", "external_subscription_id") WHERE ("external_subscription_id" IS NOT NULL);



CREATE INDEX "provider_webhook_subscriptions_next_reconcile_idx" ON "public"."provider_webhook_subscriptions" USING "btree" ("next_reconcile_at") WHERE (("status" = 'active'::"text") AND ("next_reconcile_at" IS NOT NULL));



CREATE UNIQUE INDEX "provider_write_receipts_action_effect_object_unique" ON "public"."provider_write_receipts" USING "btree" ("profile_action_id", "provider_key", "capability_slug", "external_resource_type", "external_resource_id", "operation");



CREATE INDEX "provider_write_receipts_connected_account_object_idx" ON "public"."provider_write_receipts" USING "btree" ("profile_id", "connected_provider_account_id", "provider_key", "capability_slug", "external_resource_type", "external_resource_id", "operation", "finished_at" DESC);



CREATE INDEX "task_flow_events_task_flow_created_idx" ON "public"."task_flow_events" USING "btree" ("task_flow_id", "created_at" DESC);



CREATE UNIQUE INDEX "task_flows_profile_dedupe_unique" ON "public"."task_flows" USING "btree" ("profile_id", "dedupe_key");



CREATE INDEX "task_flows_profile_status_idx" ON "public"."task_flows" USING "btree" ("profile_id", "status", "created_at" DESC);



CREATE OR REPLACE TRIGGER "set_updated_at_approval_policies" BEFORE UPDATE ON "public"."approval_policies" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_assistant_scheduled_tasks" BEFORE UPDATE ON "public"."assistant_scheduled_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_assistant_work_items" BEFORE UPDATE ON "public"."assistant_work_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_assistants" BEFORE UPDATE ON "public"."assistants" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_backend_jobs" BEFORE UPDATE ON "public"."backend_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_capability_account_links" BEFORE UPDATE ON "public"."capability_account_links" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_profile_actions" BEFORE UPDATE ON "public"."profile_actions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_profile_assistant_work_routes" BEFORE UPDATE ON "public"."profile_assistant_work_routes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_profile_capabilities" BEFORE UPDATE ON "public"."profile_capabilities" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_profile_channels" BEFORE UPDATE ON "public"."profile_channels" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_profile_memories" BEFORE UPDATE ON "public"."profile_memories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_profile_proposals" BEFORE UPDATE ON "public"."profile_proposals" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_profiles" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_provider_connect_intents" BEFORE UPDATE ON "public"."provider_connect_intents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_provider_connections" BEFORE UPDATE ON "public"."connected_provider_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_provider_webhook_deliveries" BEFORE UPDATE ON "public"."provider_webhook_deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_provider_webhook_subscriptions" BEFORE UPDATE ON "public"."provider_webhook_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_task_flows" BEFORE UPDATE ON "public"."task_flows" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."approval_policies"
    ADD CONSTRAINT "approval_policies_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artifacts"
    ADD CONSTRAINT "artifacts_profile_action_id_profile_actions_id_fk" FOREIGN KEY ("profile_action_id") REFERENCES "public"."profile_actions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."artifacts"
    ADD CONSTRAINT "artifacts_profile_action_profile_fk" FOREIGN KEY ("profile_action_id", "profile_id") REFERENCES "public"."profile_actions"("id", "profile_id");



ALTER TABLE ONLY "public"."artifacts"
    ADD CONSTRAINT "artifacts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artifacts"
    ADD CONSTRAINT "artifacts_task_flow_id_task_flows_id_fk" FOREIGN KEY ("task_flow_id") REFERENCES "public"."task_flows"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."artifacts"
    ADD CONSTRAINT "artifacts_task_flow_profile_fk" FOREIGN KEY ("task_flow_id", "profile_id") REFERENCES "public"."task_flows"("id", "profile_id");



ALTER TABLE ONLY "public"."assistant_scheduled_tasks"
    ADD CONSTRAINT "assistant_scheduled_tasks_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assistant_work_items"
    ADD CONSTRAINT "assistant_work_items_origin_scheduled_task_profile_fk" FOREIGN KEY ("origin_scheduled_task_id", "profile_id") REFERENCES "public"."assistant_scheduled_tasks"("id", "profile_id");



ALTER TABLE ONLY "public"."assistant_work_items"
    ADD CONSTRAINT "assistant_work_items_origin_task_flow_profile_fk" FOREIGN KEY ("origin_task_flow_id", "profile_id") REFERENCES "public"."task_flows"("id", "profile_id");



ALTER TABLE ONLY "public"."assistant_work_items"
    ADD CONSTRAINT "assistant_work_items_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assistants"
    ADD CONSTRAINT "assistants_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."backend_jobs"
    ADD CONSTRAINT "backend_jobs_capability_account_link_id_fkey" FOREIGN KEY ("capability_account_link_id") REFERENCES "public"."capability_account_links"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."backend_jobs"
    ADD CONSTRAINT "backend_jobs_capability_link_profile_fk" FOREIGN KEY ("capability_account_link_id", "profile_id") REFERENCES "public"."capability_account_links"("id", "profile_id");



ALTER TABLE ONLY "public"."backend_jobs"
    ADD CONSTRAINT "backend_jobs_origin_task_flow_id_task_flows_id_fk" FOREIGN KEY ("origin_task_flow_id") REFERENCES "public"."task_flows"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."backend_jobs"
    ADD CONSTRAINT "backend_jobs_origin_task_flow_profile_fk" FOREIGN KEY ("origin_task_flow_id", "profile_id") REFERENCES "public"."task_flows"("id", "profile_id");



ALTER TABLE ONLY "public"."backend_jobs"
    ADD CONSTRAINT "backend_jobs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."capability_account_links"
    ADD CONSTRAINT "capability_account_links_connected_account_id_fkey" FOREIGN KEY ("connected_provider_account_id") REFERENCES "public"."connected_provider_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."capability_account_links"
    ADD CONSTRAINT "capability_account_links_connected_account_profile_fk" FOREIGN KEY ("connected_provider_account_id", "profile_id") REFERENCES "public"."connected_provider_accounts"("id", "profile_id");



ALTER TABLE ONLY "public"."capability_account_links"
    ADD CONSTRAINT "capability_account_links_profile_capability_id_fkey" FOREIGN KEY ("profile_capability_id") REFERENCES "public"."profile_capabilities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."capability_account_links"
    ADD CONSTRAINT "capability_account_links_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."capability_account_links"
    ADD CONSTRAINT "capability_account_links_readiness_latest_backend_job_id_fk" FOREIGN KEY ("readiness_latest_backend_job_id") REFERENCES "public"."backend_jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."capability_account_links"
    ADD CONSTRAINT "capability_account_links_readiness_latest_job_profile_fk" FOREIGN KEY ("readiness_latest_backend_job_id", "profile_id") REFERENCES "public"."backend_jobs"("id", "profile_id");



ALTER TABLE ONLY "public"."connected_provider_accounts"
    ADD CONSTRAINT "connected_provider_accounts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_actions"
    ADD CONSTRAINT "profile_actions_decided_by_channel_id_profile_channels_id_fk" FOREIGN KEY ("decided_by_channel_id") REFERENCES "public"."profile_channels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_actions"
    ADD CONSTRAINT "profile_actions_decided_by_channel_profile_fk" FOREIGN KEY ("decided_by_channel_id", "profile_id") REFERENCES "public"."profile_channels"("id", "profile_id");



ALTER TABLE ONLY "public"."profile_actions"
    ADD CONSTRAINT "profile_actions_decided_by_user_id_auth_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_actions"
    ADD CONSTRAINT "profile_actions_origin_channel_profile_fk" FOREIGN KEY ("origin_profile_channel_id", "profile_id") REFERENCES "public"."profile_channels"("id", "profile_id");



ALTER TABLE ONLY "public"."profile_actions"
    ADD CONSTRAINT "profile_actions_origin_profile_channel_id_profile_channels_id_f" FOREIGN KEY ("origin_profile_channel_id") REFERENCES "public"."profile_channels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_actions"
    ADD CONSTRAINT "profile_actions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_actions"
    ADD CONSTRAINT "profile_actions_requester_assistant_id_assistants_assistant_id_" FOREIGN KEY ("requester_assistant_id") REFERENCES "public"."assistants"("assistant_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_actions"
    ADD CONSTRAINT "profile_actions_requester_assistant_profile_fk" FOREIGN KEY ("requester_assistant_id", "profile_id") REFERENCES "public"."assistants"("assistant_id", "profile_id");



ALTER TABLE ONLY "public"."profile_actions"
    ADD CONSTRAINT "profile_actions_task_flow_id_task_flows_id_fk" FOREIGN KEY ("task_flow_id") REFERENCES "public"."task_flows"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_actions"
    ADD CONSTRAINT "profile_actions_task_flow_profile_fk" FOREIGN KEY ("task_flow_id", "profile_id") REFERENCES "public"."task_flows"("id", "profile_id");



ALTER TABLE ONLY "public"."profile_assistant_work_routes"
    ADD CONSTRAINT "profile_assistant_work_routes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_capabilities"
    ADD CONSTRAINT "profile_capabilities_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_channels"
    ADD CONSTRAINT "profile_channels_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_memories"
    ADD CONSTRAINT "profile_memories_archived_by_assistant_id_assistants_assistant_" FOREIGN KEY ("archived_by_assistant_id") REFERENCES "public"."assistants"("assistant_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_memories"
    ADD CONSTRAINT "profile_memories_archived_by_user_id_auth_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_memories"
    ADD CONSTRAINT "profile_memories_created_by_assistant_id_assistants_assistant_i" FOREIGN KEY ("created_by_assistant_id") REFERENCES "public"."assistants"("assistant_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_memories"
    ADD CONSTRAINT "profile_memories_created_by_user_id_auth_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_memories"
    ADD CONSTRAINT "profile_memories_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_portal_launch_intents"
    ADD CONSTRAINT "profile_portal_launch_intents_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_proposals"
    ADD CONSTRAINT "profile_proposals_converted_profile_action_id_fk" FOREIGN KEY ("converted_profile_action_id") REFERENCES "public"."profile_actions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_proposals"
    ADD CONSTRAINT "profile_proposals_decided_by_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_proposals"
    ADD CONSTRAINT "profile_proposals_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_proposals"
    ADD CONSTRAINT "profile_proposals_source_scheduled_task_id_fk" FOREIGN KEY ("source_scheduled_task_id") REFERENCES "public"."assistant_scheduled_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_proposals"
    ADD CONSTRAINT "profile_proposals_source_task_flow_id_fk" FOREIGN KEY ("source_task_flow_id") REFERENCES "public"."task_flows"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_proposals"
    ADD CONSTRAINT "profile_proposals_source_work_item_id_fk" FOREIGN KEY ("source_work_item_id") REFERENCES "public"."assistant_work_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_proposals"
    ADD CONSTRAINT "profile_proposals_superseded_by_proposal_id_fk" FOREIGN KEY ("superseded_by_proposal_id") REFERENCES "public"."profile_proposals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_connect_intents"
    ADD CONSTRAINT "provider_connect_intents_capability_account_link_id_fkey" FOREIGN KEY ("capability_account_link_id") REFERENCES "public"."capability_account_links"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."provider_connect_intents"
    ADD CONSTRAINT "provider_connect_intents_connected_account_id_fkey" FOREIGN KEY ("connected_provider_account_id") REFERENCES "public"."connected_provider_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."provider_connect_intents"
    ADD CONSTRAINT "provider_connect_intents_profile_capability_id_fkey" FOREIGN KEY ("profile_capability_id") REFERENCES "public"."profile_capabilities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_connect_intents"
    ADD CONSTRAINT "provider_connect_intents_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_webhook_deliveries"
    ADD CONSTRAINT "provider_webhook_deliveries_backend_job_id_backend_jobs_id_fk" FOREIGN KEY ("backend_job_id") REFERENCES "public"."backend_jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."provider_webhook_deliveries"
    ADD CONSTRAINT "provider_webhook_deliveries_subscription_id_provider_webhook_su" FOREIGN KEY ("subscription_id") REFERENCES "public"."provider_webhook_subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."provider_webhook_subscriptions"
    ADD CONSTRAINT "provider_webhook_subscriptions_capability_account_link_id_fkey" FOREIGN KEY ("capability_account_link_id") REFERENCES "public"."capability_account_links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_webhook_subscriptions"
    ADD CONSTRAINT "provider_webhook_subscriptions_capability_link_profile_fk" FOREIGN KEY ("capability_account_link_id", "profile_id") REFERENCES "public"."capability_account_links"("id", "profile_id");



ALTER TABLE ONLY "public"."provider_webhook_subscriptions"
    ADD CONSTRAINT "provider_webhook_subscriptions_connected_account_id_fkey" FOREIGN KEY ("connected_provider_account_id") REFERENCES "public"."connected_provider_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_webhook_subscriptions"
    ADD CONSTRAINT "provider_webhook_subscriptions_connected_account_profile_fk" FOREIGN KEY ("connected_provider_account_id", "profile_id") REFERENCES "public"."connected_provider_accounts"("id", "profile_id");



ALTER TABLE ONLY "public"."provider_webhook_subscriptions"
    ADD CONSTRAINT "provider_webhook_subscriptions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_write_receipts"
    ADD CONSTRAINT "provider_write_receipts_action_profile_fk" FOREIGN KEY ("profile_action_id", "profile_id") REFERENCES "public"."profile_actions"("id", "profile_id");



ALTER TABLE ONLY "public"."provider_write_receipts"
    ADD CONSTRAINT "provider_write_receipts_capability_account_link_id_fkey" FOREIGN KEY ("capability_account_link_id") REFERENCES "public"."capability_account_links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_write_receipts"
    ADD CONSTRAINT "provider_write_receipts_capability_link_profile_fk" FOREIGN KEY ("capability_account_link_id", "profile_id") REFERENCES "public"."capability_account_links"("id", "profile_id");



ALTER TABLE ONLY "public"."provider_write_receipts"
    ADD CONSTRAINT "provider_write_receipts_connected_account_id_fkey" FOREIGN KEY ("connected_provider_account_id") REFERENCES "public"."connected_provider_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_write_receipts"
    ADD CONSTRAINT "provider_write_receipts_connected_account_profile_fk" FOREIGN KEY ("connected_provider_account_id", "profile_id") REFERENCES "public"."connected_provider_accounts"("id", "profile_id");



ALTER TABLE ONLY "public"."provider_write_receipts"
    ADD CONSTRAINT "provider_write_receipts_profile_action_id_profile_actions_id_fk" FOREIGN KEY ("profile_action_id") REFERENCES "public"."profile_actions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_write_receipts"
    ADD CONSTRAINT "provider_write_receipts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_flow_events"
    ADD CONSTRAINT "task_flow_events_task_flow_id_task_flows_id_fk" FOREIGN KEY ("task_flow_id") REFERENCES "public"."task_flows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_flows"
    ADD CONSTRAINT "task_flows_assigned_assistant_id_assistants_assistant_id_fk" FOREIGN KEY ("assigned_assistant_id") REFERENCES "public"."assistants"("assistant_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."task_flows"
    ADD CONSTRAINT "task_flows_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE "public"."approval_policies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."artifacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assistant_scheduled_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assistant_work_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assistants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backend_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."capability_account_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."connected_provider_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_assistant_work_routes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_capabilities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_memories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_portal_launch_intents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_proposals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_connect_intents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_webhook_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_webhook_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_write_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_flow_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_flows" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."assistant_work_items" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_assistant_work_item"("profile_id" "text", "agent_id" "text", "session_key" "text", "lease_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_assistant_work_item"("profile_id" "text", "agent_id" "text", "session_key" "text", "lease_seconds" integer) TO "service_role";



GRANT ALL ON TABLE "public"."backend_jobs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."lease_backend_job"("worker_id" "text", "lease_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lease_backend_job"("worker_id" "text", "lease_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reclaim_expired_backend_jobs"("batch_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reclaim_expired_backend_jobs"("batch_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."approval_policies" TO "service_role";



GRANT ALL ON TABLE "public"."artifacts" TO "service_role";



GRANT ALL ON TABLE "public"."assistant_scheduled_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."assistants" TO "service_role";



GRANT ALL ON TABLE "public"."capability_account_links" TO "service_role";



GRANT ALL ON TABLE "public"."connected_provider_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."profile_actions" TO "service_role";



GRANT ALL ON TABLE "public"."profile_assistant_work_routes" TO "service_role";



GRANT ALL ON TABLE "public"."profile_capabilities" TO "service_role";



GRANT ALL ON TABLE "public"."profile_channels" TO "service_role";



GRANT ALL ON TABLE "public"."profile_memories" TO "service_role";



GRANT ALL ON TABLE "public"."profile_portal_launch_intents" TO "service_role";



GRANT ALL ON TABLE "public"."profile_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."provider_connect_intents" TO "service_role";



GRANT ALL ON TABLE "public"."provider_webhook_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."provider_webhook_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."provider_write_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."task_flow_events" TO "service_role";



GRANT ALL ON TABLE "public"."task_flows" TO "service_role";



REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "anon", "authenticated";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "public" FROM "anon", "authenticated";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM "anon", "authenticated";

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO "service_role";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA "public" TO "service_role";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "public" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

--> statement-breakpoint
INSERT INTO "storage"."buckets" ("id", "name", "public")
VALUES ('profile-artifacts', 'profile-artifacts', false)
ON CONFLICT ("id") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "public" = EXCLUDED."public";
