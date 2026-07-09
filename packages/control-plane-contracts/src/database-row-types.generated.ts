// GENERATED: run npm run db -- types. Do not edit by hand.
// Source: packages/control-plane-contracts/src/database.types.ts
// Purpose: intermediate row interfaces for ts-to-zod schema generation.
// App code should use database.types.ts, TableRow<...>, or curated schemas.ts exports instead.

export type DatabaseGeneratedJson =
  | string
  | number
  | boolean
  | null
  | { [key: string]: DatabaseGeneratedJson }
  | DatabaseGeneratedJson[];

export interface ProfileActionGeneratedRow {
  action_type: string;
  created_at: string;
  decided_at: string | null;
  decided_by_channel_id: string | null;
  decided_by_user_id: string | null;
  decision: string | null;
  decision_expected_request_hash: string | null;
  decision_metadata: DatabaseGeneratedJson;
  decision_source: string | null;
  equivalent_action_key: string | null;
  execution_payload: DatabaseGeneratedJson;
  expires_at: string | null;
  id: string;
  idempotency_key: string;
  origin_channel_provider: string | null;
  origin_profile_channel_id: string | null;
  origin_sender_id: string | null;
  origin_session_id: string | null;
  origin_session_key: string | null;
  profile_id: string;
  provider_error: DatabaseGeneratedJson | null;
  provider_execution_attempts: number;
  provider_execution_finished_at: string | null;
  provider_execution_started_at: string | null;
  provider_execution_status: string;
  provider_idempotency_key: string;
  request_hash: string;
  requester_assistant_id: string | null;
  result_payload: DatabaseGeneratedJson | null;
  review_payload: DatabaseGeneratedJson;
  risk_level: string;
  status: string;
  summary: string;
  target_id: string | null;
  title: string;
  tool_call_id: string | null;
  tool_name: string;
  updated_at: string;
}
export interface ProfileProposalGeneratedRow {
  blocker_code: string | null;
  blocker_summary: string | null;
  converted_profile_action_id: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by_user_id: string | null;
  decision: string | null;
  decision_source: string | null;
  equivalence_key: string;
  evidence: DatabaseGeneratedJson;
  expires_at: string | null;
  id: string;
  profile_id: string;
  proposal_kind: string;
  proposal_payload: DatabaseGeneratedJson;
  review_payload: DatabaseGeneratedJson;
  revision: number;
  source_scheduled_task_id: string | null;
  source_work_item_id: string | null;
  status: string;
  summary: string;
  superseded_by_proposal_id: string | null;
  title: string;
  updated_at: string;
}
export interface BrowserAuthContextGeneratedRow {
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
}
export interface BrowserTaskGeneratedRow {
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
  result: DatabaseGeneratedJson | null;
  revision: number;
  state: DatabaseGeneratedJson;
  status: string;
  summary: string | null;
  updated_at: string;
  wait: DatabaseGeneratedJson | null;
}
export interface BrowserTaskEventGeneratedRow {
  actor_id: string | null;
  actor_type: string;
  browser_task_id: string;
  created_at: string;
  event_type: string;
  id: string;
  payload: DatabaseGeneratedJson;
}
export interface BrowserHandoffGeneratedRow {
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
}
export interface ApprovalPolicyGeneratedRow {
  created_at: string;
  id: string;
  profile_id: string;
  rules: DatabaseGeneratedJson;
  updated_at: string;
}
export interface ProfileAssistantWorkRouteGeneratedRow {
  config: DatabaseGeneratedJson;
  connected_provider_account_id: string | null;
  created_at: string;
  event_type: string;
  id: string;
  managed_by: string;
  profile_id: string;
  updated_at: string;
}
export interface ArtifactGeneratedRow {
  artifact_type: string;
  browser_task_id: string | null;
  byte_size: number | null;
  created_at: string;
  description: string | null;
  filename: string;
  id: string;
  idempotency_key: string | null;
  metadata: DatabaseGeneratedJson;
  mime_type: string | null;
  profile_action_id: string | null;
  profile_id: string;
  sha256: string | null;
  storage_bucket: string;
  storage_key: string;
}
export interface AgentRunGeneratedRow {
  agent_id: string | null;
  created_at: string;
  ended_at: string | null;
  failure: DatabaseGeneratedJson | null;
  id: string;
  profile_id: string;
  runtime_run_id: string | null;
  session_id: string | null;
  session_key: string | null;
  started_at: string;
  status: string;
  updated_at: string;
}
export interface AgentEventGeneratedRow {
  agent_run_id: string | null;
  created_at: string;
  event_type: string;
  id: string;
  occurred_at: string;
  payload: DatabaseGeneratedJson;
  profile_id: string;
  source: string;
  source_event_key: string | null;
  visibility: string;
}
export interface AssistantGeneratedRow {
  assistant_id: string;
  created_at: string;
  profile_id: string;
  updated_at: string;
}
export interface BackendJobGeneratedRow {
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
  payload: DatabaseGeneratedJson;
  priority: number;
  profile_id: string;
  run_after: string;
  started_at: string | null;
  status: string;
  updated_at: string;
}
export interface ProfileLearningReviewRunGeneratedRow {
  context_window_end_at: string;
  context_window_start_at: string;
  created_at: string;
  error_code: string | null;
  error_message: string | null;
  finished_at: string | null;
  id: string;
  local_date: string | null;
  metadata: DatabaseGeneratedJson;
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
}
export interface ProfileLearningReviewCursorGeneratedRow {
  created_at: string;
  last_successful_run_id: string | null;
  metadata: DatabaseGeneratedJson;
  processed_through_at: string;
  profile_id: string;
  updated_at: string;
}
export interface ProfileLearningReviewObservationGeneratedRow {
  confidence: string;
  created_at: string;
  evidence: DatabaseGeneratedJson;
  id: string;
  missing_context: string | null;
  observation_type: string;
  profile_id: string;
  run_id: string;
  statement: string;
  target_id: string | null;
  target_kind: string;
  updated_at: string;
}
export interface ProfileLearningReviewCandidateGeneratedRow {
  applied_at: string | null;
  applied_reference: DatabaseGeneratedJson;
  candidate_type: string;
  confidence: string;
  created_at: string;
  evidence: DatabaseGeneratedJson;
  failure_message: string | null;
  id: string;
  profile_id: string;
  proposed_patch: DatabaseGeneratedJson;
  rationale: string;
  run_id: string;
  status: string;
  target_id: string | null;
  target_kind: string;
  updated_at: string;
}
export interface ProfileGuidanceGeneratedRow {
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
}
export interface AssistantScheduledTaskGeneratedRow {
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
  schedule: DatabaseGeneratedJson;
  status: string;
  target: DatabaseGeneratedJson;
  timezone: string | null;
  title: string;
  updated_at: string;
}
export interface AssistantWorkItemGeneratedRow {
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
  payload: DatabaseGeneratedJson;
  priority: number;
  profile_id: string;
  result: DatabaseGeneratedJson | null;
  status: string;
  updated_at: string;
}
export interface ProviderWebhookSubscriptionGeneratedRow {
  adapter_key: string;
  capability_account_link_id: string;
  connected_provider_account_id: string;
  created_at: string;
  cursor: DatabaseGeneratedJson;
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
  provider_state: DatabaseGeneratedJson;
  resource_id: string;
  resource_type: string;
  status: string;
  updated_at: string;
}
export interface ProviderFileStateGeneratedRow {
  capability_account_link_id: string;
  connected_provider_account_id: string;
  created_at: string;
  ctag: string | null;
  deleted_at: string | null;
  etag: string | null;
  external_file_id: string;
  id: string;
  last_modified_at: string | null;
  metadata: DatabaseGeneratedJson;
  mime_type: string | null;
  name: string | null;
  parent_reference: DatabaseGeneratedJson;
  profile_id: string;
  provider_key: string;
  resource_id: string;
  resource_type: string;
  updated_at: string;
  web_url: string | null;
}
export interface ProviderSandboxResourceGeneratedRow {
  capability_account_link_id: string;
  connected_provider_account_id: string;
  created_at: string;
  id: string;
  metadata: DatabaseGeneratedJson;
  profile_id: string;
  provider_key: string;
  resource_id: string;
  resource_type: string;
  state: DatabaseGeneratedJson;
  updated_at: string;
}
export interface ProviderSandboxRequestGeneratedRow {
  capability_account_link_id: string;
  connected_provider_account_id: string;
  created_at: string;
  error: DatabaseGeneratedJson | null;
  id: string;
  metadata: DatabaseGeneratedJson;
  operation: string;
  profile_id: string;
  provider_key: string;
  request: DatabaseGeneratedJson;
  resource_id: string | null;
  resource_type: string | null;
  response: DatabaseGeneratedJson;
  status: string;
  updated_at: string;
}
export interface ProviderWebhookDeliveryGeneratedRow {
  adapter_key: string;
  authenticated: boolean;
  backend_job_id: string | null;
  created_at: string;
  delivery_key: string;
  error_code: string | null;
  error_message: string | null;
  id: string;
  payload: DatabaseGeneratedJson;
  payload_hash: string;
  processed_at: string | null;
  provider_key: string;
  received_at: string;
  request_headers: DatabaseGeneratedJson;
  status: string;
  subscription_id: string | null;
  updated_at: string;
}
export interface ProfilePortalLaunchIntentGeneratedRow {
  consumed_at: string | null;
  created_at: string;
  expires_at: string;
  id: string;
  intent_payload: DatabaseGeneratedJson;
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
}
export interface ProviderWriteReceiptGeneratedRow {
  capability_account_link_id: string;
  capability_slug: string;
  connected_provider_account_id: string;
  created_at: string;
  external_resource_id: string;
  external_resource_type: string;
  finished_at: string;
  id: string;
  metadata: DatabaseGeneratedJson;
  operation: string;
  profile_action_id: string;
  profile_id: string;
  provider_key: string;
  started_at: string;
  tool_name: string;
}
export interface BoldSignDocumentGeneratedRow {
  capability_account_link_id: string;
  completed_at: string | null;
  connected_provider_account_id: string;
  created_at: string;
  document_id: string;
  id: string;
  ownership_status: string;
  profile_id: string;
  provider_account_id: string;
  provider_metadata: DatabaseGeneratedJson;
  provider_status: string | null;
  sent_at: string | null;
  signer_email: string | null;
  source: string;
  title: string | null;
  updated_at: string;
}
export interface ConnectedProviderAccountGeneratedRow {
  account_email: string | null;
  connected_at: string | null;
  connection_status: string;
  created_at: string;
  credential_kind: string;
  credential_status: string | null;
  display_label: string | null;
  id: string;
  last_error: string | null;
  metadata: DatabaseGeneratedJson;
  nango_connection_id: string | null;
  nango_provider_config_key: string | null;
  profile_id: string;
  provider: string;
  provider_account_id: string;
  scopes: DatabaseGeneratedJson;
  updated_at: string;
}
export interface PhoneCallAttemptGeneratedRow {
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
}
export interface PhoneCallEventGeneratedRow {
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
  provider_payload: DatabaseGeneratedJson;
  turn_index: number | null;
  turn_token_hash: string | null;
}
export interface PhoneCallTranscriptEntryGeneratedRow {
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
}
export interface PhoneSmsAttemptGeneratedRow {
  body_hash: string;
  body_preview: string;
  country: string;
  created_at: string;
  delivered_at: string | null;
  destination_evidence: DatabaseGeneratedJson;
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
}
export interface PhoneSmsEventGeneratedRow {
  created_at: string;
  dedupe_key: string;
  event_kind: string;
  id: string;
  occurred_at: string;
  phone_sms_attempt_id: string | null;
  profile_id: string;
  provider: string;
  provider_message_sid: string | null;
  provider_payload: DatabaseGeneratedJson;
}
export interface PhoneInboundSmsMessageGeneratedRow {
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
}
export interface CapabilityAccountLinkGeneratedRow {
  capability_slug: string;
  config: DatabaseGeneratedJson;
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
  readiness_metadata: DatabaseGeneratedJson;
  readiness_status: string;
  required: boolean;
  status: string;
  updated_at: string;
}
export interface ProviderConnectIntentGeneratedRow {
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
}
export interface ProfileCapabilityGeneratedRow {
  capability_slug: string;
  config: DatabaseGeneratedJson;
  created_at: string;
  id: string;
  profile_id: string;
  required: boolean;
  status: string;
  updated_at: string;
}
export interface ProfileChannelGeneratedRow {
  created_at: string;
  delivery_config: DatabaseGeneratedJson;
  external_identity: string;
  id: string;
  profile_id: string;
  provider: string;
  status: string;
  updated_at: string;
}
export interface ProfileGeneratedRow {
  created_at: string;
  display_name: string;
  id: string;
  metadata: DatabaseGeneratedJson;
  preferences: DatabaseGeneratedJson;
  status: string;
  timezone: string;
  updated_at: string;
  user_id: string;
}
