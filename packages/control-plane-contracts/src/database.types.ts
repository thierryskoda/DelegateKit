export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      agent_events: {
        Row: {
          agent_run_id: string | null;
          created_at: string;
          event_type: string;
          id: string;
          occurred_at: string;
          payload: Json;
          profile_id: string;
          source: string;
          source_event_key: string | null;
          visibility: string;
        };
        Insert: {
          agent_run_id?: string | null;
          created_at?: string;
          event_type: string;
          id?: string;
          occurred_at?: string;
          payload: Json;
          profile_id: string;
          source: string;
          source_event_key?: string | null;
          visibility?: string;
        };
        Update: {
          agent_run_id?: string | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          occurred_at?: string;
          payload?: Json;
          profile_id?: string;
          source?: string;
          source_event_key?: string | null;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_events_agent_run_id_agent_runs_id_fk";
            columns: ["agent_run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_events_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_runs: {
        Row: {
          agent_id: string | null;
          created_at: string;
          ended_at: string | null;
          failure: Json | null;
          id: string;
          profile_id: string;
          runtime_run_id: string | null;
          session_id: string | null;
          session_key: string | null;
          started_at: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          agent_id?: string | null;
          created_at?: string;
          ended_at?: string | null;
          failure?: Json | null;
          id?: string;
          profile_id: string;
          runtime_run_id?: string | null;
          session_id?: string | null;
          session_key?: string | null;
          started_at?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          agent_id?: string | null;
          created_at?: string;
          ended_at?: string | null;
          failure?: Json | null;
          id?: string;
          profile_id?: string;
          runtime_run_id?: string | null;
          session_id?: string | null;
          session_key?: string | null;
          started_at?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_runs_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      approval_policies: {
        Row: {
          created_at: string;
          id: string;
          profile_id: string;
          rules: Json;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          profile_id: string;
          rules?: Json;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          profile_id?: string;
          rules?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "approval_policies_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      artifacts: {
        Row: {
          artifact_type: string;
          browser_task_id: string | null;
          byte_size: number | null;
          created_at: string;
          description: string | null;
          filename: string;
          id: string;
          idempotency_key: string | null;
          metadata: Json;
          mime_type: string | null;
          profile_action_id: string | null;
          profile_id: string;
          sha256: string | null;
          storage_bucket: string;
          storage_key: string;
        };
        Insert: {
          artifact_type: string;
          browser_task_id?: string | null;
          byte_size?: number | null;
          created_at?: string;
          description?: string | null;
          filename: string;
          id?: string;
          idempotency_key?: string | null;
          metadata?: Json;
          mime_type?: string | null;
          profile_action_id?: string | null;
          profile_id: string;
          sha256?: string | null;
          storage_bucket?: string;
          storage_key: string;
        };
        Update: {
          artifact_type?: string;
          browser_task_id?: string | null;
          byte_size?: number | null;
          created_at?: string;
          description?: string | null;
          filename?: string;
          id?: string;
          idempotency_key?: string | null;
          metadata?: Json;
          mime_type?: string | null;
          profile_action_id?: string | null;
          profile_id?: string;
          sha256?: string | null;
          storage_bucket?: string;
          storage_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "artifacts_browser_task_id_browser_tasks_id_fk";
            columns: ["browser_task_id"];
            isOneToOne: false;
            referencedRelation: "browser_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "artifacts_browser_task_profile_fk";
            columns: ["browser_task_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "browser_tasks";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "artifacts_profile_action_id_profile_actions_id_fk";
            columns: ["profile_action_id"];
            isOneToOne: false;
            referencedRelation: "profile_actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "artifacts_profile_action_profile_fk";
            columns: ["profile_action_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "profile_actions";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "artifacts_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      assistant_scheduled_tasks: {
        Row: {
          created_at: string;
          created_by_agent_id: string | null;
          created_by_session_id: string | null;
          created_by_session_key: string | null;
          created_by_tool_call_id: string | null;
          dedupe_key: string | null;
          id: string;
          instructions: string;
          last_run_at: string | null;
          next_run_at: string | null;
          profile_id: string;
          revision: number;
          schedule: Json;
          status: string;
          target: Json;
          timezone: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by_agent_id?: string | null;
          created_by_session_id?: string | null;
          created_by_session_key?: string | null;
          created_by_tool_call_id?: string | null;
          dedupe_key?: string | null;
          id?: string;
          instructions: string;
          last_run_at?: string | null;
          next_run_at?: string | null;
          profile_id: string;
          revision?: number;
          schedule: Json;
          status?: string;
          target?: Json;
          timezone?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by_agent_id?: string | null;
          created_by_session_id?: string | null;
          created_by_session_key?: string | null;
          created_by_tool_call_id?: string | null;
          dedupe_key?: string | null;
          id?: string;
          instructions?: string;
          last_run_at?: string | null;
          next_run_at?: string | null;
          profile_id?: string;
          revision?: number;
          schedule?: Json;
          status?: string;
          target?: Json;
          timezone?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assistant_scheduled_tasks_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      assistant_work_items: {
        Row: {
          attempts: number;
          available_at: string;
          claim_expires_at: string | null;
          claim_token: string | null;
          claimed_at: string | null;
          claimed_by_agent_id: string | null;
          claimed_by_session_key: string | null;
          created_at: string;
          dedupe_key: string | null;
          finished_at: string | null;
          id: string;
          kind: string;
          last_error: string | null;
          max_attempts: number;
          origin_agent_id: string | null;
          origin_scheduled_task_id: string | null;
          origin_session_id: string | null;
          origin_session_key: string | null;
          origin_tool_call_id: string | null;
          payload: Json;
          priority: number;
          profile_id: string;
          result: Json | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          available_at?: string;
          claim_expires_at?: string | null;
          claim_token?: string | null;
          claimed_at?: string | null;
          claimed_by_agent_id?: string | null;
          claimed_by_session_key?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          finished_at?: string | null;
          id?: string;
          kind: string;
          last_error?: string | null;
          max_attempts?: number;
          origin_agent_id?: string | null;
          origin_scheduled_task_id?: string | null;
          origin_session_id?: string | null;
          origin_session_key?: string | null;
          origin_tool_call_id?: string | null;
          payload?: Json;
          priority?: number;
          profile_id: string;
          result?: Json | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          available_at?: string;
          claim_expires_at?: string | null;
          claim_token?: string | null;
          claimed_at?: string | null;
          claimed_by_agent_id?: string | null;
          claimed_by_session_key?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          finished_at?: string | null;
          id?: string;
          kind?: string;
          last_error?: string | null;
          max_attempts?: number;
          origin_agent_id?: string | null;
          origin_scheduled_task_id?: string | null;
          origin_session_id?: string | null;
          origin_session_key?: string | null;
          origin_tool_call_id?: string | null;
          payload?: Json;
          priority?: number;
          profile_id?: string;
          result?: Json | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assistant_work_items_origin_scheduled_task_profile_fk";
            columns: ["origin_scheduled_task_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "assistant_scheduled_tasks";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "assistant_work_items_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      assistants: {
        Row: {
          assistant_id: string;
          created_at: string;
          profile_id: string;
          updated_at: string;
        };
        Insert: {
          assistant_id: string;
          created_at?: string;
          profile_id: string;
          updated_at?: string;
        };
        Update: {
          assistant_id?: string;
          created_at?: string;
          profile_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assistants_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      backend_jobs: {
        Row: {
          attempts: number;
          capability_account_link_id: string | null;
          created_at: string;
          dedupe_key: string | null;
          finished_at: string | null;
          id: string;
          kind: string;
          last_error: string | null;
          lease_expires_at: string | null;
          leased_by: string | null;
          max_attempts: number;
          origin_agent_id: string | null;
          origin_session_id: string | null;
          origin_session_key: string | null;
          origin_tool_call_id: string | null;
          payload: Json;
          priority: number;
          profile_id: string;
          run_after: string;
          started_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          capability_account_link_id?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          finished_at?: string | null;
          id?: string;
          kind: string;
          last_error?: string | null;
          lease_expires_at?: string | null;
          leased_by?: string | null;
          max_attempts?: number;
          origin_agent_id?: string | null;
          origin_session_id?: string | null;
          origin_session_key?: string | null;
          origin_tool_call_id?: string | null;
          payload?: Json;
          priority?: number;
          profile_id: string;
          run_after?: string;
          started_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          capability_account_link_id?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          finished_at?: string | null;
          id?: string;
          kind?: string;
          last_error?: string | null;
          lease_expires_at?: string | null;
          leased_by?: string | null;
          max_attempts?: number;
          origin_agent_id?: string | null;
          origin_session_id?: string | null;
          origin_session_key?: string | null;
          origin_tool_call_id?: string | null;
          payload?: Json;
          priority?: number;
          profile_id?: string;
          run_after?: string;
          started_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "backend_jobs_capability_account_link_id_fkey";
            columns: ["capability_account_link_id"];
            isOneToOne: false;
            referencedRelation: "capability_account_links";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "backend_jobs_capability_link_profile_fk";
            columns: ["capability_account_link_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "capability_account_links";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "backend_jobs_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      boldsign_documents: {
        Row: {
          capability_account_link_id: string;
          completed_at: string | null;
          connected_provider_account_id: string;
          created_at: string;
          document_id: string;
          id: string;
          ownership_status: string;
          profile_id: string;
          provider_account_id: string;
          provider_metadata: Json;
          provider_status: string | null;
          sent_at: string | null;
          signer_email: string | null;
          source: string;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          capability_account_link_id: string;
          completed_at?: string | null;
          connected_provider_account_id: string;
          created_at?: string;
          document_id: string;
          id?: string;
          ownership_status: string;
          profile_id: string;
          provider_account_id: string;
          provider_metadata?: Json;
          provider_status?: string | null;
          sent_at?: string | null;
          signer_email?: string | null;
          source: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          capability_account_link_id?: string;
          completed_at?: string | null;
          connected_provider_account_id?: string;
          created_at?: string;
          document_id?: string;
          id?: string;
          ownership_status?: string;
          profile_id?: string;
          provider_account_id?: string;
          provider_metadata?: Json;
          provider_status?: string | null;
          sent_at?: string | null;
          signer_email?: string | null;
          source?: string;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "boldsign_documents_capability_account_link_id_fkey";
            columns: ["capability_account_link_id"];
            isOneToOne: false;
            referencedRelation: "capability_account_links";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "boldsign_documents_capability_link_profile_fk";
            columns: ["capability_account_link_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "capability_account_links";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "boldsign_documents_connected_account_profile_fk";
            columns: ["connected_provider_account_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "connected_provider_accounts";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "boldsign_documents_connected_provider_account_id_fkey";
            columns: ["connected_provider_account_id"];
            isOneToOne: false;
            referencedRelation: "connected_provider_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "boldsign_documents_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      browser_auth_contexts: {
        Row: {
          account_hint: string | null;
          allowed_domains: string[];
          browserbase_context_id: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          label: string;
          last_verified_at: string | null;
          primary_domain: string;
          profile_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          account_hint?: string | null;
          allowed_domains: string[];
          browserbase_context_id: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          label: string;
          last_verified_at?: string | null;
          primary_domain: string;
          profile_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          account_hint?: string | null;
          allowed_domains?: string[];
          browserbase_context_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          label?: string;
          last_verified_at?: string | null;
          primary_domain?: string;
          profile_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "browser_auth_contexts_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      browser_handoffs: {
        Row: {
          browser_auth_context_id: string | null;
          browser_task_id: string;
          browserbase_session_id: string;
          cancelled_at: string | null;
          client_url: string;
          completed_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          profile_id: string;
          reason: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          browser_auth_context_id?: string | null;
          browser_task_id: string;
          browserbase_session_id: string;
          cancelled_at?: string | null;
          client_url: string;
          completed_at?: string | null;
          created_at?: string;
          expires_at: string;
          id?: string;
          profile_id: string;
          reason: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          browser_auth_context_id?: string | null;
          browser_task_id?: string;
          browserbase_session_id?: string;
          cancelled_at?: string | null;
          client_url?: string;
          completed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          profile_id?: string;
          reason?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "browser_handoffs_auth_context_id_fkey";
            columns: ["browser_auth_context_id"];
            isOneToOne: false;
            referencedRelation: "browser_auth_contexts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "browser_handoffs_browser_task_id_fkey";
            columns: ["browser_task_id"];
            isOneToOne: false;
            referencedRelation: "browser_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "browser_handoffs_browser_task_profile_fk";
            columns: ["browser_task_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "browser_tasks";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "browser_handoffs_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      browser_task_events: {
        Row: {
          actor_id: string | null;
          actor_type: string;
          browser_task_id: string;
          created_at: string;
          event_type: string;
          id: string;
          payload: Json;
        };
        Insert: {
          actor_id?: string | null;
          actor_type?: string;
          browser_task_id: string;
          created_at?: string;
          event_type: string;
          id?: string;
          payload?: Json;
        };
        Update: {
          actor_id?: string | null;
          actor_type?: string;
          browser_task_id?: string;
          created_at?: string;
          event_type?: string;
          id?: string;
          payload?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "browser_task_events_browser_task_id_browser_tasks_id_fk";
            columns: ["browser_task_id"];
            isOneToOne: false;
            referencedRelation: "browser_tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      browser_tasks: {
        Row: {
          assigned_assistant_id: string | null;
          cancel_requested_at: string | null;
          created_at: string;
          dedupe_key: string;
          ended_at: string | null;
          goal: string;
          id: string;
          mode: string;
          note: string | null;
          profile_id: string;
          result: Json | null;
          revision: number;
          state: Json;
          status: string;
          summary: string | null;
          updated_at: string;
          wait: Json | null;
        };
        Insert: {
          assigned_assistant_id?: string | null;
          cancel_requested_at?: string | null;
          created_at?: string;
          dedupe_key: string;
          ended_at?: string | null;
          goal: string;
          id?: string;
          mode: string;
          note?: string | null;
          profile_id: string;
          result?: Json | null;
          revision?: number;
          state?: Json;
          status?: string;
          summary?: string | null;
          updated_at?: string;
          wait?: Json | null;
        };
        Update: {
          assigned_assistant_id?: string | null;
          cancel_requested_at?: string | null;
          created_at?: string;
          dedupe_key?: string;
          ended_at?: string | null;
          goal?: string;
          id?: string;
          mode?: string;
          note?: string | null;
          profile_id?: string;
          result?: Json | null;
          revision?: number;
          state?: Json;
          status?: string;
          summary?: string | null;
          updated_at?: string;
          wait?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "browser_tasks_assigned_assistant_id_assistants_assistant_id_fk";
            columns: ["assigned_assistant_id"];
            isOneToOne: false;
            referencedRelation: "assistants";
            referencedColumns: ["assistant_id"];
          },
          {
            foreignKeyName: "browser_tasks_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      capability_account_links: {
        Row: {
          capability_slug: string;
          config: Json;
          connected_provider_account_id: string | null;
          created_at: string;
          id: string;
          is_default: boolean;
          label: string;
          profile_capability_id: string;
          profile_id: string;
          provider: string;
          readiness_blocker_code: string | null;
          readiness_last_error: string | null;
          readiness_last_success_at: string | null;
          readiness_latest_backend_job_id: string | null;
          readiness_metadata: Json;
          readiness_status: string;
          required: boolean;
          status: string;
          updated_at: string;
        };
        Insert: {
          capability_slug: string;
          config?: Json;
          connected_provider_account_id?: string | null;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          label: string;
          profile_capability_id: string;
          profile_id: string;
          provider: string;
          readiness_blocker_code?: string | null;
          readiness_last_error?: string | null;
          readiness_last_success_at?: string | null;
          readiness_latest_backend_job_id?: string | null;
          readiness_metadata?: Json;
          readiness_status?: string;
          required?: boolean;
          status?: string;
          updated_at?: string;
        };
        Update: {
          capability_slug?: string;
          config?: Json;
          connected_provider_account_id?: string | null;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          label?: string;
          profile_capability_id?: string;
          profile_id?: string;
          provider?: string;
          readiness_blocker_code?: string | null;
          readiness_last_error?: string | null;
          readiness_last_success_at?: string | null;
          readiness_latest_backend_job_id?: string | null;
          readiness_metadata?: Json;
          readiness_status?: string;
          required?: boolean;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "capability_account_links_connected_account_id_fkey";
            columns: ["connected_provider_account_id"];
            isOneToOne: false;
            referencedRelation: "connected_provider_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "capability_account_links_connected_account_profile_fk";
            columns: ["connected_provider_account_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "connected_provider_accounts";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "capability_account_links_profile_capability_id_fkey";
            columns: ["profile_capability_id"];
            isOneToOne: false;
            referencedRelation: "profile_capabilities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "capability_account_links_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "capability_account_links_readiness_latest_backend_job_id_fk";
            columns: ["readiness_latest_backend_job_id"];
            isOneToOne: false;
            referencedRelation: "backend_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "capability_account_links_readiness_latest_job_profile_fk";
            columns: ["readiness_latest_backend_job_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "backend_jobs";
            referencedColumns: ["id", "profile_id"];
          },
        ];
      };
      connected_provider_accounts: {
        Row: {
          account_email: string | null;
          connected_at: string | null;
          connection_status: string;
          created_at: string;
          credential_kind: string;
          credential_status: string | null;
          display_label: string | null;
          id: string;
          last_error: string | null;
          metadata: Json;
          nango_connection_id: string | null;
          nango_provider_config_key: string | null;
          profile_id: string;
          provider: string;
          provider_account_id: string;
          scopes: Json;
          updated_at: string;
        };
        Insert: {
          account_email?: string | null;
          connected_at?: string | null;
          connection_status?: string;
          created_at?: string;
          credential_kind?: string;
          credential_status?: string | null;
          display_label?: string | null;
          id?: string;
          last_error?: string | null;
          metadata?: Json;
          nango_connection_id?: string | null;
          nango_provider_config_key?: string | null;
          profile_id: string;
          provider: string;
          provider_account_id: string;
          scopes?: Json;
          updated_at?: string;
        };
        Update: {
          account_email?: string | null;
          connected_at?: string | null;
          connection_status?: string;
          created_at?: string;
          credential_kind?: string;
          credential_status?: string | null;
          display_label?: string | null;
          id?: string;
          last_error?: string | null;
          metadata?: Json;
          nango_connection_id?: string | null;
          nango_provider_config_key?: string | null;
          profile_id?: string;
          provider?: string;
          provider_account_id?: string;
          scopes?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "connected_provider_accounts_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      phone_call_attempts: {
        Row: {
          answered_at: string | null;
          call_brief_hash: string;
          call_id: string;
          country: string;
          created_at: string;
          current_turn_token_hash: string | null;
          duration_seconds: number | null;
          ended_at: string | null;
          failure_kind: string | null;
          failure_message: string | null;
          from_phone_e164: string | null;
          hold_timeout_seconds: number;
          id: string;
          last_provider_event_at: string | null;
          last_transcript_at: string | null;
          max_duration_seconds: number;
          opening_line: string;
          pre_connect_dtmf_hash: string | null;
          profile_action_id: string;
          profile_id: string;
          provider: string;
          provider_call_sid: string | null;
          provider_parent_call_sid: string | null;
          provider_status: string | null;
          provider_status_updated_at: string | null;
          purpose: string;
          started_at: string | null;
          status: string;
          summary: string | null;
          terminal_reason: string | null;
          to_phone_e164: string;
          turn_index: number;
          updated_at: string;
          verified_phone_source_url: string;
        };
        Insert: {
          answered_at?: string | null;
          call_brief_hash: string;
          call_id: string;
          country: string;
          created_at?: string;
          current_turn_token_hash?: string | null;
          duration_seconds?: number | null;
          ended_at?: string | null;
          failure_kind?: string | null;
          failure_message?: string | null;
          from_phone_e164?: string | null;
          hold_timeout_seconds?: number;
          id?: string;
          last_provider_event_at?: string | null;
          last_transcript_at?: string | null;
          max_duration_seconds?: number;
          opening_line: string;
          pre_connect_dtmf_hash?: string | null;
          profile_action_id: string;
          profile_id: string;
          provider?: string;
          provider_call_sid?: string | null;
          provider_parent_call_sid?: string | null;
          provider_status?: string | null;
          provider_status_updated_at?: string | null;
          purpose: string;
          started_at?: string | null;
          status?: string;
          summary?: string | null;
          terminal_reason?: string | null;
          to_phone_e164: string;
          turn_index?: number;
          updated_at?: string;
          verified_phone_source_url: string;
        };
        Update: {
          answered_at?: string | null;
          call_brief_hash?: string;
          call_id?: string;
          country?: string;
          created_at?: string;
          current_turn_token_hash?: string | null;
          duration_seconds?: number | null;
          ended_at?: string | null;
          failure_kind?: string | null;
          failure_message?: string | null;
          from_phone_e164?: string | null;
          hold_timeout_seconds?: number;
          id?: string;
          last_provider_event_at?: string | null;
          last_transcript_at?: string | null;
          max_duration_seconds?: number;
          opening_line?: string;
          pre_connect_dtmf_hash?: string | null;
          profile_action_id?: string;
          profile_id?: string;
          provider?: string;
          provider_call_sid?: string | null;
          provider_parent_call_sid?: string | null;
          provider_status?: string | null;
          provider_status_updated_at?: string | null;
          purpose?: string;
          started_at?: string | null;
          status?: string;
          summary?: string | null;
          terminal_reason?: string | null;
          to_phone_e164?: string;
          turn_index?: number;
          updated_at?: string;
          verified_phone_source_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "phone_call_attempts_action_profile_fk";
            columns: ["profile_action_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "profile_actions";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "phone_call_attempts_profile_action_id_profile_actions_id_fk";
            columns: ["profile_action_id"];
            isOneToOne: true;
            referencedRelation: "profile_actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "phone_call_attempts_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      phone_call_events: {
        Row: {
          call_id: string;
          created_at: string;
          dedupe_key: string;
          event_kind: string;
          id: string;
          occurred_at: string;
          phone_call_attempt_id: string;
          profile_id: string;
          provider: string;
          provider_call_sid: string | null;
          provider_event_id: string | null;
          provider_payload: Json;
          turn_index: number | null;
          turn_token_hash: string | null;
        };
        Insert: {
          call_id: string;
          created_at?: string;
          dedupe_key: string;
          event_kind: string;
          id?: string;
          occurred_at?: string;
          phone_call_attempt_id: string;
          profile_id: string;
          provider?: string;
          provider_call_sid?: string | null;
          provider_event_id?: string | null;
          provider_payload?: Json;
          turn_index?: number | null;
          turn_token_hash?: string | null;
        };
        Update: {
          call_id?: string;
          created_at?: string;
          dedupe_key?: string;
          event_kind?: string;
          id?: string;
          occurred_at?: string;
          phone_call_attempt_id?: string;
          profile_id?: string;
          provider?: string;
          provider_call_sid?: string | null;
          provider_event_id?: string | null;
          provider_payload?: Json;
          turn_index?: number | null;
          turn_token_hash?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "phone_call_events_attempt_fk";
            columns: ["phone_call_attempt_id"];
            isOneToOne: false;
            referencedRelation: "phone_call_attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "phone_call_events_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      phone_call_transcript_entries: {
        Row: {
          call_id: string;
          created_at: string;
          id: string;
          occurred_at: string;
          phone_call_attempt_id: string;
          profile_id: string;
          provider_event_id: string | null;
          speaker: string;
          text: string;
          turn_index: number;
        };
        Insert: {
          call_id: string;
          created_at?: string;
          id?: string;
          occurred_at?: string;
          phone_call_attempt_id: string;
          profile_id: string;
          provider_event_id?: string | null;
          speaker: string;
          text: string;
          turn_index: number;
        };
        Update: {
          call_id?: string;
          created_at?: string;
          id?: string;
          occurred_at?: string;
          phone_call_attempt_id?: string;
          profile_id?: string;
          provider_event_id?: string | null;
          speaker?: string;
          text?: string;
          turn_index?: number;
        };
        Relationships: [
          {
            foreignKeyName: "phone_call_transcript_entries_attempt_fk";
            columns: ["phone_call_attempt_id"];
            isOneToOne: false;
            referencedRelation: "phone_call_attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "phone_call_transcript_entries_event_fk";
            columns: ["provider_event_id"];
            isOneToOne: false;
            referencedRelation: "phone_call_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "phone_call_transcript_entries_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      phone_inbound_sms_messages: {
        Row: {
          body_text: string;
          capability_account_link_id: string;
          created_at: string;
          dedupe_key: string;
          delivery_id: string | null;
          from_phone_e164: string;
          id: string;
          media_count: number;
          message_sid: string;
          profile_id: string;
          provider: string;
          received_at: string;
          to_phone_e164: string;
          work_item_id: string | null;
        };
        Insert: {
          body_text: string;
          capability_account_link_id: string;
          created_at?: string;
          dedupe_key: string;
          delivery_id?: string | null;
          from_phone_e164: string;
          id?: string;
          media_count?: number;
          message_sid: string;
          profile_id: string;
          provider?: string;
          received_at?: string;
          to_phone_e164: string;
          work_item_id?: string | null;
        };
        Update: {
          body_text?: string;
          capability_account_link_id?: string;
          created_at?: string;
          dedupe_key?: string;
          delivery_id?: string | null;
          from_phone_e164?: string;
          id?: string;
          media_count?: number;
          message_sid?: string;
          profile_id?: string;
          provider?: string;
          received_at?: string;
          to_phone_e164?: string;
          work_item_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "phone_inbound_sms_messages_capability_account_link_id_fk";
            columns: ["capability_account_link_id"];
            isOneToOne: false;
            referencedRelation: "capability_account_links";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "phone_inbound_sms_messages_delivery_id_fk";
            columns: ["delivery_id"];
            isOneToOne: false;
            referencedRelation: "provider_webhook_deliveries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "phone_inbound_sms_messages_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "phone_inbound_sms_messages_work_item_id_fk";
            columns: ["work_item_id"];
            isOneToOne: false;
            referencedRelation: "assistant_work_items";
            referencedColumns: ["id"];
          },
        ];
      };
      phone_sms_attempts: {
        Row: {
          body_hash: string;
          body_preview: string;
          country: string;
          created_at: string;
          delivered_at: string | null;
          destination_evidence: Json;
          destination_evidence_kind: string;
          failure_kind: string | null;
          failure_message: string | null;
          from_phone_e164: string | null;
          id: string;
          profile_action_id: string;
          profile_id: string;
          provider: string;
          provider_message_sid: string | null;
          provider_status: string | null;
          provider_status_updated_at: string | null;
          purpose: string;
          related_call_attempt_id: string | null;
          reply_to_message_sid: string | null;
          sent_at: string | null;
          status: string;
          to_phone_e164: string;
          updated_at: string;
          verified_phone_source_label: string | null;
          verified_phone_source_url: string | null;
        };
        Insert: {
          body_hash: string;
          body_preview: string;
          country: string;
          created_at?: string;
          delivered_at?: string | null;
          destination_evidence?: Json;
          destination_evidence_kind: string;
          failure_kind?: string | null;
          failure_message?: string | null;
          from_phone_e164?: string | null;
          id?: string;
          profile_action_id: string;
          profile_id: string;
          provider?: string;
          provider_message_sid?: string | null;
          provider_status?: string | null;
          provider_status_updated_at?: string | null;
          purpose: string;
          related_call_attempt_id?: string | null;
          reply_to_message_sid?: string | null;
          sent_at?: string | null;
          status?: string;
          to_phone_e164: string;
          updated_at?: string;
          verified_phone_source_label?: string | null;
          verified_phone_source_url?: string | null;
        };
        Update: {
          body_hash?: string;
          body_preview?: string;
          country?: string;
          created_at?: string;
          delivered_at?: string | null;
          destination_evidence?: Json;
          destination_evidence_kind?: string;
          failure_kind?: string | null;
          failure_message?: string | null;
          from_phone_e164?: string | null;
          id?: string;
          profile_action_id?: string;
          profile_id?: string;
          provider?: string;
          provider_message_sid?: string | null;
          provider_status?: string | null;
          provider_status_updated_at?: string | null;
          purpose?: string;
          related_call_attempt_id?: string | null;
          reply_to_message_sid?: string | null;
          sent_at?: string | null;
          status?: string;
          to_phone_e164?: string;
          updated_at?: string;
          verified_phone_source_label?: string | null;
          verified_phone_source_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "phone_sms_attempts_action_profile_fk";
            columns: ["profile_action_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "profile_actions";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "phone_sms_attempts_profile_action_id_profile_actions_id_fk";
            columns: ["profile_action_id"];
            isOneToOne: true;
            referencedRelation: "profile_actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "phone_sms_attempts_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "phone_sms_attempts_related_call_attempt_id_fk";
            columns: ["related_call_attempt_id"];
            isOneToOne: false;
            referencedRelation: "phone_call_attempts";
            referencedColumns: ["id"];
          },
        ];
      };
      phone_sms_events: {
        Row: {
          created_at: string;
          dedupe_key: string;
          event_kind: string;
          id: string;
          occurred_at: string;
          phone_sms_attempt_id: string | null;
          profile_id: string;
          provider: string;
          provider_message_sid: string | null;
          provider_payload: Json;
        };
        Insert: {
          created_at?: string;
          dedupe_key: string;
          event_kind: string;
          id?: string;
          occurred_at?: string;
          phone_sms_attempt_id?: string | null;
          profile_id: string;
          provider?: string;
          provider_message_sid?: string | null;
          provider_payload?: Json;
        };
        Update: {
          created_at?: string;
          dedupe_key?: string;
          event_kind?: string;
          id?: string;
          occurred_at?: string;
          phone_sms_attempt_id?: string | null;
          profile_id?: string;
          provider?: string;
          provider_message_sid?: string | null;
          provider_payload?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "phone_sms_events_attempt_fk";
            columns: ["phone_sms_attempt_id"];
            isOneToOne: false;
            referencedRelation: "phone_sms_attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "phone_sms_events_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_actions: {
        Row: {
          action_type: string;
          created_at: string;
          decided_at: string | null;
          decided_by_channel_id: string | null;
          decided_by_user_id: string | null;
          decision: string | null;
          decision_expected_request_hash: string | null;
          decision_metadata: Json;
          decision_source: string | null;
          equivalent_action_key: string | null;
          execution_payload: Json;
          expires_at: string | null;
          id: string;
          idempotency_key: string;
          origin_channel_provider: string | null;
          origin_profile_channel_id: string | null;
          origin_sender_id: string | null;
          origin_session_id: string | null;
          origin_session_key: string | null;
          profile_id: string;
          provider_error: Json | null;
          provider_execution_attempts: number;
          provider_execution_finished_at: string | null;
          provider_execution_started_at: string | null;
          provider_execution_status: string;
          provider_idempotency_key: string;
          request_hash: string;
          requester_assistant_id: string | null;
          result_payload: Json | null;
          review_payload: Json;
          risk_level: string;
          status: string;
          summary: string;
          target_id: string | null;
          title: string;
          tool_call_id: string | null;
          tool_name: string;
          updated_at: string;
        };
        Insert: {
          action_type: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by_channel_id?: string | null;
          decided_by_user_id?: string | null;
          decision?: string | null;
          decision_expected_request_hash?: string | null;
          decision_metadata?: Json;
          decision_source?: string | null;
          equivalent_action_key?: string | null;
          execution_payload?: Json;
          expires_at?: string | null;
          id?: string;
          idempotency_key: string;
          origin_channel_provider?: string | null;
          origin_profile_channel_id?: string | null;
          origin_sender_id?: string | null;
          origin_session_id?: string | null;
          origin_session_key?: string | null;
          profile_id: string;
          provider_error?: Json | null;
          provider_execution_attempts?: number;
          provider_execution_finished_at?: string | null;
          provider_execution_started_at?: string | null;
          provider_execution_status?: string;
          provider_idempotency_key: string;
          request_hash: string;
          requester_assistant_id?: string | null;
          result_payload?: Json | null;
          review_payload?: Json;
          risk_level?: string;
          status?: string;
          summary: string;
          target_id?: string | null;
          title: string;
          tool_call_id?: string | null;
          tool_name: string;
          updated_at?: string;
        };
        Update: {
          action_type?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by_channel_id?: string | null;
          decided_by_user_id?: string | null;
          decision?: string | null;
          decision_expected_request_hash?: string | null;
          decision_metadata?: Json;
          decision_source?: string | null;
          equivalent_action_key?: string | null;
          execution_payload?: Json;
          expires_at?: string | null;
          id?: string;
          idempotency_key?: string;
          origin_channel_provider?: string | null;
          origin_profile_channel_id?: string | null;
          origin_sender_id?: string | null;
          origin_session_id?: string | null;
          origin_session_key?: string | null;
          profile_id?: string;
          provider_error?: Json | null;
          provider_execution_attempts?: number;
          provider_execution_finished_at?: string | null;
          provider_execution_started_at?: string | null;
          provider_execution_status?: string;
          provider_idempotency_key?: string;
          request_hash?: string;
          requester_assistant_id?: string | null;
          result_payload?: Json | null;
          review_payload?: Json;
          risk_level?: string;
          status?: string;
          summary?: string;
          target_id?: string | null;
          title?: string;
          tool_call_id?: string | null;
          tool_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_actions_decided_by_channel_id_profile_channels_id_fk";
            columns: ["decided_by_channel_id"];
            isOneToOne: false;
            referencedRelation: "profile_channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_actions_decided_by_channel_profile_fk";
            columns: ["decided_by_channel_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "profile_channels";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "profile_actions_origin_channel_profile_fk";
            columns: ["origin_profile_channel_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "profile_channels";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "profile_actions_origin_profile_channel_id_profile_channels_id_f";
            columns: ["origin_profile_channel_id"];
            isOneToOne: false;
            referencedRelation: "profile_channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_actions_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_actions_requester_assistant_id_assistants_assistant_id_";
            columns: ["requester_assistant_id"];
            isOneToOne: false;
            referencedRelation: "assistants";
            referencedColumns: ["assistant_id"];
          },
          {
            foreignKeyName: "profile_actions_requester_assistant_profile_fk";
            columns: ["requester_assistant_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "assistants";
            referencedColumns: ["assistant_id", "profile_id"];
          },
        ];
      };
      profile_assistant_work_routes: {
        Row: {
          config: Json;
          connected_provider_account_id: string | null;
          created_at: string;
          event_type: string;
          id: string;
          managed_by: string;
          profile_id: string;
          updated_at: string;
        };
        Insert: {
          config?: Json;
          connected_provider_account_id?: string | null;
          created_at?: string;
          event_type: string;
          id?: string;
          managed_by?: string;
          profile_id: string;
          updated_at?: string;
        };
        Update: {
          config?: Json;
          connected_provider_account_id?: string | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          managed_by?: string;
          profile_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_assistant_work_routes_connected_account_id_fkey";
            columns: ["connected_provider_account_id"];
            isOneToOne: false;
            referencedRelation: "connected_provider_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_assistant_work_routes_connected_account_profile_fk";
            columns: ["connected_provider_account_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "connected_provider_accounts";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "profile_assistant_work_routes_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_capabilities: {
        Row: {
          capability_slug: string;
          config: Json;
          created_at: string;
          id: string;
          profile_id: string;
          required: boolean;
          status: string;
          updated_at: string;
        };
        Insert: {
          capability_slug: string;
          config?: Json;
          created_at?: string;
          id?: string;
          profile_id: string;
          required?: boolean;
          status?: string;
          updated_at?: string;
        };
        Update: {
          capability_slug?: string;
          config?: Json;
          created_at?: string;
          id?: string;
          profile_id?: string;
          required?: boolean;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_capabilities_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_channels: {
        Row: {
          created_at: string;
          delivery_config: Json;
          external_identity: string;
          id: string;
          profile_id: string;
          provider: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          delivery_config?: Json;
          external_identity: string;
          id?: string;
          profile_id: string;
          provider: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          delivery_config?: Json;
          external_identity?: string;
          id?: string;
          profile_id?: string;
          provider?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_channels_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_guidance: {
        Row: {
          body_markdown: string;
          created_at: string;
          id: string;
          key: string;
          profile_id: string;
          revision: number;
          selector_description: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          body_markdown: string;
          created_at?: string;
          id?: string;
          key: string;
          profile_id: string;
          revision?: number;
          selector_description: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          body_markdown?: string;
          created_at?: string;
          id?: string;
          key?: string;
          profile_id?: string;
          revision?: number;
          selector_description?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_guidance_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_learning_review_candidates: {
        Row: {
          applied_at: string | null;
          applied_reference: Json;
          candidate_type: string;
          confidence: string;
          created_at: string;
          evidence: Json;
          failure_message: string | null;
          id: string;
          profile_id: string;
          proposed_patch: Json;
          rationale: string;
          run_id: string;
          status: string;
          target_id: string | null;
          target_kind: string;
          updated_at: string;
        };
        Insert: {
          applied_at?: string | null;
          applied_reference?: Json;
          candidate_type: string;
          confidence: string;
          created_at?: string;
          evidence?: Json;
          failure_message?: string | null;
          id?: string;
          profile_id: string;
          proposed_patch?: Json;
          rationale: string;
          run_id: string;
          status?: string;
          target_id?: string | null;
          target_kind: string;
          updated_at?: string;
        };
        Update: {
          applied_at?: string | null;
          applied_reference?: Json;
          candidate_type?: string;
          confidence?: string;
          created_at?: string;
          evidence?: Json;
          failure_message?: string | null;
          id?: string;
          profile_id?: string;
          proposed_patch?: Json;
          rationale?: string;
          run_id?: string;
          status?: string;
          target_id?: string | null;
          target_kind?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_learning_review_candidates_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_learning_review_candidates_run_id_runs_id_fk";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "profile_learning_review_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_learning_review_cursors: {
        Row: {
          created_at: string;
          last_successful_run_id: string | null;
          metadata: Json;
          processed_through_at: string;
          profile_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          last_successful_run_id?: string | null;
          metadata?: Json;
          processed_through_at: string;
          profile_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          last_successful_run_id?: string | null;
          metadata?: Json;
          processed_through_at?: string;
          profile_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_learning_review_cursors_last_run_id_runs_id_fk";
            columns: ["last_successful_run_id"];
            isOneToOne: false;
            referencedRelation: "profile_learning_review_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_learning_review_cursors_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_learning_review_observations: {
        Row: {
          confidence: string;
          created_at: string;
          evidence: Json;
          id: string;
          missing_context: string | null;
          observation_type: string;
          profile_id: string;
          run_id: string;
          statement: string;
          target_id: string | null;
          target_kind: string;
          updated_at: string;
        };
        Insert: {
          confidence: string;
          created_at?: string;
          evidence?: Json;
          id?: string;
          missing_context?: string | null;
          observation_type: string;
          profile_id: string;
          run_id: string;
          statement: string;
          target_id?: string | null;
          target_kind: string;
          updated_at?: string;
        };
        Update: {
          confidence?: string;
          created_at?: string;
          evidence?: Json;
          id?: string;
          missing_context?: string | null;
          observation_type?: string;
          profile_id?: string;
          run_id?: string;
          statement?: string;
          target_id?: string | null;
          target_kind?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_learning_review_observations_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_learning_review_observations_run_id_runs_id_fk";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "profile_learning_review_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_learning_review_runs: {
        Row: {
          context_window_end_at: string;
          context_window_start_at: string;
          created_at: string;
          error_code: string | null;
          error_message: string | null;
          finished_at: string | null;
          id: string;
          local_date: string | null;
          metadata: Json;
          model: string;
          processed_source_end_at: string | null;
          profile_id: string;
          review_mode: string;
          source_window_end_at: string;
          source_window_start_at: string;
          started_at: string;
          status: string;
          summary: string | null;
          updated_at: string;
          window_end_at: string;
          window_start_at: string;
        };
        Insert: {
          context_window_end_at: string;
          context_window_start_at: string;
          created_at?: string;
          error_code?: string | null;
          error_message?: string | null;
          finished_at?: string | null;
          id?: string;
          local_date?: string | null;
          metadata?: Json;
          model: string;
          processed_source_end_at?: string | null;
          profile_id: string;
          review_mode?: string;
          source_window_end_at: string;
          source_window_start_at: string;
          started_at?: string;
          status?: string;
          summary?: string | null;
          updated_at?: string;
          window_end_at: string;
          window_start_at: string;
        };
        Update: {
          context_window_end_at?: string;
          context_window_start_at?: string;
          created_at?: string;
          error_code?: string | null;
          error_message?: string | null;
          finished_at?: string | null;
          id?: string;
          local_date?: string | null;
          metadata?: Json;
          model?: string;
          processed_source_end_at?: string | null;
          profile_id?: string;
          review_mode?: string;
          source_window_end_at?: string;
          source_window_start_at?: string;
          started_at?: string;
          status?: string;
          summary?: string | null;
          updated_at?: string;
          window_end_at?: string;
          window_start_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_learning_review_runs_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_portal_launch_intents: {
        Row: {
          consumed_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          intent_payload: Json;
          intent_type: string;
          origin_agent_id: string | null;
          origin_session_id: string | null;
          origin_session_key: string | null;
          origin_tool_call_id: string | null;
          profile_id: string;
          section: string;
          slug: string;
          status: string;
          surface: string;
        };
        Insert: {
          consumed_at?: string | null;
          created_at?: string;
          expires_at: string;
          id?: string;
          intent_payload?: Json;
          intent_type: string;
          origin_agent_id?: string | null;
          origin_session_id?: string | null;
          origin_session_key?: string | null;
          origin_tool_call_id?: string | null;
          profile_id: string;
          section: string;
          slug: string;
          status?: string;
          surface?: string;
        };
        Update: {
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          intent_payload?: Json;
          intent_type?: string;
          origin_agent_id?: string | null;
          origin_session_id?: string | null;
          origin_session_key?: string | null;
          origin_tool_call_id?: string | null;
          profile_id?: string;
          section?: string;
          slug?: string;
          status?: string;
          surface?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_portal_launch_intents_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_proposals: {
        Row: {
          blocker_code: string | null;
          blocker_summary: string | null;
          converted_profile_action_id: string | null;
          created_at: string;
          decided_at: string | null;
          decided_by_user_id: string | null;
          decision: string | null;
          decision_source: string | null;
          equivalence_key: string;
          evidence: Json;
          expires_at: string | null;
          id: string;
          profile_id: string;
          proposal_kind: string;
          proposal_payload: Json;
          review_payload: Json;
          revision: number;
          source_scheduled_task_id: string | null;
          source_work_item_id: string | null;
          status: string;
          summary: string;
          superseded_by_proposal_id: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          blocker_code?: string | null;
          blocker_summary?: string | null;
          converted_profile_action_id?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by_user_id?: string | null;
          decision?: string | null;
          decision_source?: string | null;
          equivalence_key: string;
          evidence?: Json;
          expires_at?: string | null;
          id?: string;
          profile_id: string;
          proposal_kind: string;
          proposal_payload?: Json;
          review_payload?: Json;
          revision?: number;
          source_scheduled_task_id?: string | null;
          source_work_item_id?: string | null;
          status?: string;
          summary: string;
          superseded_by_proposal_id?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          blocker_code?: string | null;
          blocker_summary?: string | null;
          converted_profile_action_id?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by_user_id?: string | null;
          decision?: string | null;
          decision_source?: string | null;
          equivalence_key?: string;
          evidence?: Json;
          expires_at?: string | null;
          id?: string;
          profile_id?: string;
          proposal_kind?: string;
          proposal_payload?: Json;
          review_payload?: Json;
          revision?: number;
          source_scheduled_task_id?: string | null;
          source_work_item_id?: string | null;
          status?: string;
          summary?: string;
          superseded_by_proposal_id?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_proposals_converted_profile_action_id_fk";
            columns: ["converted_profile_action_id"];
            isOneToOne: false;
            referencedRelation: "profile_actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_proposals_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_proposals_source_scheduled_task_id_fk";
            columns: ["source_scheduled_task_id"];
            isOneToOne: false;
            referencedRelation: "assistant_scheduled_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_proposals_source_work_item_id_fk";
            columns: ["source_work_item_id"];
            isOneToOne: false;
            referencedRelation: "assistant_work_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_proposals_superseded_by_proposal_id_fk";
            columns: ["superseded_by_proposal_id"];
            isOneToOne: false;
            referencedRelation: "profile_proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          metadata: Json;
          preferences: Json;
          status: string;
          timezone: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          id: string;
          metadata?: Json;
          preferences?: Json;
          status?: string;
          timezone?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
          metadata?: Json;
          preferences?: Json;
          status?: string;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      provider_connect_intents: {
        Row: {
          capability_account_link_id: string | null;
          capability_slug: string;
          connected_provider_account_id: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          profile_capability_id: string;
          profile_id: string;
          provider: string;
          requested_label: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          capability_account_link_id?: string | null;
          capability_slug: string;
          connected_provider_account_id?: string | null;
          created_at?: string;
          expires_at: string;
          id?: string;
          profile_capability_id: string;
          profile_id: string;
          provider: string;
          requested_label?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          capability_account_link_id?: string | null;
          capability_slug?: string;
          connected_provider_account_id?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          profile_capability_id?: string;
          profile_id?: string;
          provider?: string;
          requested_label?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_connect_intents_capability_account_link_id_fkey";
            columns: ["capability_account_link_id"];
            isOneToOne: false;
            referencedRelation: "capability_account_links";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_connect_intents_connected_account_id_fkey";
            columns: ["connected_provider_account_id"];
            isOneToOne: false;
            referencedRelation: "connected_provider_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_connect_intents_profile_capability_id_fkey";
            columns: ["profile_capability_id"];
            isOneToOne: false;
            referencedRelation: "profile_capabilities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_connect_intents_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_file_states: {
        Row: {
          capability_account_link_id: string;
          connected_provider_account_id: string;
          created_at: string;
          ctag: string | null;
          deleted_at: string | null;
          etag: string | null;
          external_file_id: string;
          id: string;
          last_modified_at: string | null;
          metadata: Json;
          mime_type: string | null;
          name: string | null;
          parent_reference: Json;
          profile_id: string;
          provider_key: string;
          resource_id: string;
          resource_type: string;
          updated_at: string;
          web_url: string | null;
        };
        Insert: {
          capability_account_link_id: string;
          connected_provider_account_id: string;
          created_at?: string;
          ctag?: string | null;
          deleted_at?: string | null;
          etag?: string | null;
          external_file_id: string;
          id?: string;
          last_modified_at?: string | null;
          metadata?: Json;
          mime_type?: string | null;
          name?: string | null;
          parent_reference?: Json;
          profile_id: string;
          provider_key: string;
          resource_id: string;
          resource_type: string;
          updated_at?: string;
          web_url?: string | null;
        };
        Update: {
          capability_account_link_id?: string;
          connected_provider_account_id?: string;
          created_at?: string;
          ctag?: string | null;
          deleted_at?: string | null;
          etag?: string | null;
          external_file_id?: string;
          id?: string;
          last_modified_at?: string | null;
          metadata?: Json;
          mime_type?: string | null;
          name?: string | null;
          parent_reference?: Json;
          profile_id?: string;
          provider_key?: string;
          resource_id?: string;
          resource_type?: string;
          updated_at?: string;
          web_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "provider_file_states_capability_account_link_id_fkey";
            columns: ["capability_account_link_id"];
            isOneToOne: false;
            referencedRelation: "capability_account_links";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_file_states_capability_link_profile_fk";
            columns: ["capability_account_link_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "capability_account_links";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "provider_file_states_connected_account_id_fkey";
            columns: ["connected_provider_account_id"];
            isOneToOne: false;
            referencedRelation: "connected_provider_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_file_states_connected_account_profile_fk";
            columns: ["connected_provider_account_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "connected_provider_accounts";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "provider_file_states_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_sandbox_requests: {
        Row: {
          capability_account_link_id: string;
          connected_provider_account_id: string;
          created_at: string;
          error: Json | null;
          id: string;
          metadata: Json;
          operation: string;
          profile_id: string;
          provider_key: string;
          request: Json;
          resource_id: string | null;
          resource_type: string | null;
          response: Json;
          status: string;
          updated_at: string;
        };
        Insert: {
          capability_account_link_id: string;
          connected_provider_account_id: string;
          created_at?: string;
          error?: Json | null;
          id?: string;
          metadata?: Json;
          operation: string;
          profile_id: string;
          provider_key: string;
          request?: Json;
          resource_id?: string | null;
          resource_type?: string | null;
          response?: Json;
          status?: string;
          updated_at?: string;
        };
        Update: {
          capability_account_link_id?: string;
          connected_provider_account_id?: string;
          created_at?: string;
          error?: Json | null;
          id?: string;
          metadata?: Json;
          operation?: string;
          profile_id?: string;
          provider_key?: string;
          request?: Json;
          resource_id?: string | null;
          resource_type?: string | null;
          response?: Json;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_sandbox_requests_capability_account_link_id_fkey";
            columns: ["capability_account_link_id"];
            isOneToOne: false;
            referencedRelation: "capability_account_links";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_sandbox_requests_capability_link_profile_fk";
            columns: ["capability_account_link_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "capability_account_links";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "provider_sandbox_requests_connected_account_id_fkey";
            columns: ["connected_provider_account_id"];
            isOneToOne: false;
            referencedRelation: "connected_provider_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_sandbox_requests_connected_account_profile_fk";
            columns: ["connected_provider_account_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "connected_provider_accounts";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "provider_sandbox_requests_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_sandbox_resources: {
        Row: {
          capability_account_link_id: string;
          connected_provider_account_id: string;
          created_at: string;
          id: string;
          metadata: Json;
          profile_id: string;
          provider_key: string;
          resource_id: string;
          resource_type: string;
          state: Json;
          updated_at: string;
        };
        Insert: {
          capability_account_link_id: string;
          connected_provider_account_id: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          profile_id: string;
          provider_key: string;
          resource_id: string;
          resource_type: string;
          state?: Json;
          updated_at?: string;
        };
        Update: {
          capability_account_link_id?: string;
          connected_provider_account_id?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          profile_id?: string;
          provider_key?: string;
          resource_id?: string;
          resource_type?: string;
          state?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_sandbox_resources_capability_account_link_id_fkey";
            columns: ["capability_account_link_id"];
            isOneToOne: false;
            referencedRelation: "capability_account_links";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_sandbox_resources_capability_link_profile_fk";
            columns: ["capability_account_link_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "capability_account_links";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "provider_sandbox_resources_connected_account_id_fkey";
            columns: ["connected_provider_account_id"];
            isOneToOne: false;
            referencedRelation: "connected_provider_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_sandbox_resources_connected_account_profile_fk";
            columns: ["connected_provider_account_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "connected_provider_accounts";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "provider_sandbox_resources_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_webhook_deliveries: {
        Row: {
          adapter_key: string;
          authenticated: boolean;
          backend_job_id: string | null;
          created_at: string;
          delivery_key: string;
          error_code: string | null;
          error_message: string | null;
          id: string;
          payload: Json;
          payload_hash: string;
          processed_at: string | null;
          provider_key: string;
          received_at: string;
          request_headers: Json;
          status: string;
          subscription_id: string | null;
          updated_at: string;
        };
        Insert: {
          adapter_key: string;
          authenticated?: boolean;
          backend_job_id?: string | null;
          created_at?: string;
          delivery_key: string;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          payload?: Json;
          payload_hash: string;
          processed_at?: string | null;
          provider_key: string;
          received_at?: string;
          request_headers?: Json;
          status?: string;
          subscription_id?: string | null;
          updated_at?: string;
        };
        Update: {
          adapter_key?: string;
          authenticated?: boolean;
          backend_job_id?: string | null;
          created_at?: string;
          delivery_key?: string;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          payload?: Json;
          payload_hash?: string;
          processed_at?: string | null;
          provider_key?: string;
          received_at?: string;
          request_headers?: Json;
          status?: string;
          subscription_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_webhook_deliveries_backend_job_id_backend_jobs_id_fk";
            columns: ["backend_job_id"];
            isOneToOne: false;
            referencedRelation: "backend_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_webhook_deliveries_subscription_id_provider_webhook_su";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "provider_webhook_subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_webhook_subscriptions: {
        Row: {
          adapter_key: string;
          capability_account_link_id: string;
          connected_provider_account_id: string;
          created_at: string;
          cursor: Json;
          event_scope: string;
          expires_at: string | null;
          external_subscription_id: string | null;
          id: string;
          last_error_code: string | null;
          last_error_message: string | null;
          last_notification_at: string | null;
          last_success_at: string | null;
          next_reconcile_at: string | null;
          profile_id: string;
          provider_key: string;
          provider_state: Json;
          resource_id: string;
          resource_type: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          adapter_key: string;
          capability_account_link_id: string;
          connected_provider_account_id: string;
          created_at?: string;
          cursor?: Json;
          event_scope: string;
          expires_at?: string | null;
          external_subscription_id?: string | null;
          id?: string;
          last_error_code?: string | null;
          last_error_message?: string | null;
          last_notification_at?: string | null;
          last_success_at?: string | null;
          next_reconcile_at?: string | null;
          profile_id: string;
          provider_key: string;
          provider_state?: Json;
          resource_id: string;
          resource_type: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          adapter_key?: string;
          capability_account_link_id?: string;
          connected_provider_account_id?: string;
          created_at?: string;
          cursor?: Json;
          event_scope?: string;
          expires_at?: string | null;
          external_subscription_id?: string | null;
          id?: string;
          last_error_code?: string | null;
          last_error_message?: string | null;
          last_notification_at?: string | null;
          last_success_at?: string | null;
          next_reconcile_at?: string | null;
          profile_id?: string;
          provider_key?: string;
          provider_state?: Json;
          resource_id?: string;
          resource_type?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_webhook_subscriptions_capability_account_link_id_fkey";
            columns: ["capability_account_link_id"];
            isOneToOne: false;
            referencedRelation: "capability_account_links";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_webhook_subscriptions_capability_link_profile_fk";
            columns: ["capability_account_link_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "capability_account_links";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "provider_webhook_subscriptions_connected_account_id_fkey";
            columns: ["connected_provider_account_id"];
            isOneToOne: false;
            referencedRelation: "connected_provider_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_webhook_subscriptions_connected_account_profile_fk";
            columns: ["connected_provider_account_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "connected_provider_accounts";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "provider_webhook_subscriptions_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_write_receipts: {
        Row: {
          capability_account_link_id: string;
          capability_slug: string;
          connected_provider_account_id: string;
          created_at: string;
          external_resource_id: string;
          external_resource_type: string;
          finished_at: string;
          id: string;
          metadata: Json;
          operation: string;
          profile_action_id: string;
          profile_id: string;
          provider_key: string;
          started_at: string;
          tool_name: string;
        };
        Insert: {
          capability_account_link_id: string;
          capability_slug: string;
          connected_provider_account_id: string;
          created_at?: string;
          external_resource_id: string;
          external_resource_type: string;
          finished_at: string;
          id?: string;
          metadata?: Json;
          operation: string;
          profile_action_id: string;
          profile_id: string;
          provider_key: string;
          started_at: string;
          tool_name: string;
        };
        Update: {
          capability_account_link_id?: string;
          capability_slug?: string;
          connected_provider_account_id?: string;
          created_at?: string;
          external_resource_id?: string;
          external_resource_type?: string;
          finished_at?: string;
          id?: string;
          metadata?: Json;
          operation?: string;
          profile_action_id?: string;
          profile_id?: string;
          provider_key?: string;
          started_at?: string;
          tool_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_write_receipts_action_profile_fk";
            columns: ["profile_action_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "profile_actions";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "provider_write_receipts_capability_account_link_id_fkey";
            columns: ["capability_account_link_id"];
            isOneToOne: false;
            referencedRelation: "capability_account_links";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_write_receipts_capability_link_profile_fk";
            columns: ["capability_account_link_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "capability_account_links";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "provider_write_receipts_connected_account_id_fkey";
            columns: ["connected_provider_account_id"];
            isOneToOne: false;
            referencedRelation: "connected_provider_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_write_receipts_connected_account_profile_fk";
            columns: ["connected_provider_account_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "connected_provider_accounts";
            referencedColumns: ["id", "profile_id"];
          },
          {
            foreignKeyName: "provider_write_receipts_profile_action_id_profile_actions_id_fk";
            columns: ["profile_action_id"];
            isOneToOne: false;
            referencedRelation: "profile_actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_write_receipts_profile_id_profiles_id_fk";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      lease_backend_job: {
        Args: { lease_seconds?: number; worker_id: string };
        Returns: {
          attempts: number;
          capability_account_link_id: string | null;
          created_at: string;
          dedupe_key: string | null;
          finished_at: string | null;
          id: string;
          kind: string;
          last_error: string | null;
          lease_expires_at: string | null;
          leased_by: string | null;
          max_attempts: number;
          origin_agent_id: string | null;
          origin_session_id: string | null;
          origin_session_key: string | null;
          origin_tool_call_id: string | null;
          payload: Json;
          priority: number;
          profile_id: string;
          run_after: string;
          started_at: string | null;
          status: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "backend_jobs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      reclaim_expired_backend_jobs: {
        Args: { batch_limit?: number };
        Returns: {
          attempts: number;
          capability_account_link_id: string | null;
          created_at: string;
          dedupe_key: string | null;
          finished_at: string | null;
          id: string;
          kind: string;
          last_error: string | null;
          lease_expires_at: string | null;
          leased_by: string | null;
          max_attempts: number;
          origin_agent_id: string | null;
          origin_session_id: string | null;
          origin_session_key: string | null;
          origin_tool_call_id: string | null;
          payload: Json;
          priority: number;
          profile_id: string;
          run_after: string;
          started_at: string | null;
          status: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "backend_jobs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
