# Tool Inventory

Generated from all canonical agent tool contracts.
This inventory is a maintainer debugging aid for inspecting every canonical tool contract in one place; it is not runtime assistant guidance, client-facing documentation, or a source of truth for enabled runtime tool policy.
Some canonical builtin contracts may be disabled for profile assistants by generated runtime config; runtime profile notes call those out.

- Built-in tool count: 3
- Assistant capability tool count: 180
- Total tool count: 183

## Audit Report

Generated maintainer review surface for tool selection, input ergonomics, output usability, and prompt-footprint risk. Flags are heuristics for review; they are not correctness failures.

- Total tools audited: 183
- Tools with review flags: 56
- Write tools: 100
- Read tools: 83

### Exposure

| Value | Count |
| --- | --- |
| `builtin` | 3 |
| `local_plugin` | 180 |

### Plugins

| Value | Count |
| --- | --- |
| `actions-tools` | 5 |
| `assistant-builtin` | 3 |
| `boldsign-tools` | 5 |
| `document-tools` | 5 |
| `file-analysis-tools` | 3 |
| `gmail-tools` | 10 |
| `google-calendar-tools` | 10 |
| `google-drive-tools` | 20 |
| `microsoft-onedrive-tools` | 21 |
| `microsoft-sharepoint-tools` | 4 |
| `microsoft-todo-tools` | 8 |
| `monday-tools` | 29 |
| `outlook-calendar-tools` | 9 |
| `outlook-mail-tools` | 10 |
| `phone-tools` | 8 |
| `profile-context-tools` | 2 |
| `profile-files` | 2 |
| `profile-links-tools` | 2 |
| `proposals-tools` | 1 |
| `public-web-tools` | 11 |
| `scheduled-tasks-tools` | 8 |
| `time-tools` | 1 |
| `work-tools` | 6 |

### Effects

| Value | Count |
| --- | --- |
| `read` | 83 |
| `write` | 100 |

### Execution

| Value | Count |
| --- | --- |
| `backend_proxy` | 180 |
| `builtin` | 3 |

### Review Flags

| Tool | Plugin | Exposure | Effect | Inputs | Required | Outputs | Words | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `gmail_message_send` | `gmail-tools` | `local_plugin` | `write` | 9 | 7 | 1 | 126 | many inputs, many required inputs |
| `google_calendar_event_create` | `google-calendar-tools` | `local_plugin` | `write` | 16 | 12 | 1 | 92 | many inputs, many required inputs |
| `google_calendar_event_update` | `google-calendar-tools` | `local_plugin` | `write` | 17 | 8 | 1 | 124 | many inputs, many required inputs |
| `llm-task` | `assistant-builtin` | `builtin` | `read` | 10 | 1 | 1 | 100 | many inputs, list output without top-level cursor/truncation |
| `microsoft_todo_task_create` | `microsoft-todo-tools` | `local_plugin` | `write` | 16 | 10 | 1 | 73 | many inputs, many required inputs |
| `microsoft_todo_task_update` | `microsoft-todo-tools` | `local_plugin` | `write` | 17 | 8 | 1 | 75 | many inputs, many required inputs |
| `outlook_calendar_event_create` | `outlook-calendar-tools` | `local_plugin` | `write` | 16 | 12 | 1 | 73 | many inputs, many required inputs |
| `outlook_calendar_event_update` | `outlook-calendar-tools` | `local_plugin` | `write` | 17 | 8 | 1 | 94 | many inputs, many required inputs |
| `outlook_mail_message_send` | `outlook-mail-tools` | `local_plugin` | `write` | 8 | 7 | 1 | 89 | many inputs, many required inputs |
| `phone_call_start` | `phone-tools` | `local_plugin` | `write` | 17 | 17 | 1 | 84 | many inputs, many required inputs |
| `public_web_browser_action_prepare_start` | `public-web-tools` | `local_plugin` | `write` | 8 | 7 | 1 | 190 | many inputs, many required inputs |
| `public_web_browser_extract_start` | `public-web-tools` | `local_plugin` | `read` | 10 | 9 | 1 | 100 | many inputs, many required inputs |
| `public_web_search` | `public-web-tools` | `local_plugin` | `read` | 12 | 2 | 7 | 104 | many inputs, list output without top-level cursor/truncation |
| `web_search` | `assistant-builtin` | `builtin` | `read` | 12 | 1 | 5 | 118 | many inputs, list output without top-level cursor/truncation, disabled for profile assistants; use public_web_search |
| `action_list` | `actions-tools` | `local_plugin` | `read` | 2 | 2 | 1 | 25 | list output without top-level cursor/truncation |
| `boldsign_signature_requests_list` | `boldsign-tools` | `local_plugin` | `read` | 15 | 2 | 6 | 526 | many inputs |
| `document_template_render` | `document-tools` | `local_plugin` | `write` | 4 | 2 | 4 | 189 | list output without top-level cursor/truncation |
| `file_describe` | `file-analysis-tools` | `local_plugin` | `read` | 3 | 3 | 7 | 85 | list output without top-level cursor/truncation |
| `file_extract_data` | `file-analysis-tools` | `local_plugin` | `read` | 4 | 4 | 7 | 79 | list output without top-level cursor/truncation |
| `file_extract_text` | `file-analysis-tools` | `local_plugin` | `read` | 2 | 2 | 6 | 92 | list output without top-level cursor/truncation |
| `gmail_accounts_list` | `gmail-tools` | `local_plugin` | `read` | 0 | 0 | 1 | 46 | list output without top-level cursor/truncation |
| `google_calendar_accounts_list` | `google-calendar-tools` | `local_plugin` | `read` | 0 | 0 | 1 | 50 | list output without top-level cursor/truncation |
| `google_calendar_free_slots_find` | `google-calendar-tools` | `local_plugin` | `read` | 6 | 5 | 4 | 77 | list output without top-level cursor/truncation |
| `google_calendar_freebusy_query` | `google-calendar-tools` | `local_plugin` | `read` | 5 | 4 | 6 | 47 | list output without top-level cursor/truncation |
| `google_drive_accounts_list` | `google-drive-tools` | `local_plugin` | `read` | 0 | 0 | 1 | 49 | list output without top-level cursor/truncation |
| `google_drive_file_share` | `google-drive-tools` | `local_plugin` | `write` | 8 | 3 | 1 | 88 | many inputs |
| `message` | `assistant-builtin` | `builtin` | `write` | 9 | 2 | 2 | 219 | many inputs |
| `microsoft_onedrive_accounts_list` | `microsoft-onedrive-tools` | `local_plugin` | `read` | 0 | 0 | 1 | 37 | list output without top-level cursor/truncation |
| `microsoft_onedrive_invite_recipients` | `microsoft-onedrive-tools` | `local_plugin` | `write` | 13 | 3 | 1 | 71 | many inputs |
| `microsoft_onedrive_item_update` | `microsoft-onedrive-tools` | `local_plugin` | `write` | 11 | 1 | 1 | 86 | many inputs |
| `microsoft_sharepoint_accounts_list` | `microsoft-sharepoint-tools` | `local_plugin` | `read` | 0 | 0 | 1 | 37 | list output without top-level cursor/truncation |
| `microsoft_todo_accounts_list` | `microsoft-todo-tools` | `local_plugin` | `read` | 0 | 0 | 1 | 55 | list output without top-level cursor/truncation |
| `monday_board_list` | `monday-tools` | `local_plugin` | `read` | 2 | 0 | 1 | 96 | list output without top-level cursor/truncation |
| `monday_column_type_list` | `monday-tools` | `local_plugin` | `read` | 0 | 0 | 1 | 76 | list output without top-level cursor/truncation |
| `monday_item_list` | `monday-tools` | `local_plugin` | `read` | 14 | 4 | 3 | 490 | many inputs |
| `monday_subitem_list` | `monday-tools` | `local_plugin` | `read` | 2 | 1 | 2 | 125 | list output without top-level cursor/truncation |
| `monday_update_list` | `monday-tools` | `local_plugin` | `read` | 4 | 1 | 4 | 102 | list output without top-level cursor/truncation |
| `monday_workspace_list` | `monday-tools` | `local_plugin` | `read` | 0 | 0 | 1 | 48 | list output without top-level cursor/truncation |
| `outlook_calendar_accounts_list` | `outlook-calendar-tools` | `local_plugin` | `read` | 0 | 0 | 1 | 48 | list output without top-level cursor/truncation |
| `outlook_calendar_free_slots_find` | `outlook-calendar-tools` | `local_plugin` | `read` | 6 | 5 | 4 | 53 | list output without top-level cursor/truncation |
| `outlook_calendar_freebusy_query` | `outlook-calendar-tools` | `local_plugin` | `read` | 5 | 4 | 6 | 45 | list output without top-level cursor/truncation |
| `outlook_mail_accounts_list` | `outlook-mail-tools` | `local_plugin` | `read` | 0 | 0 | 1 | 48 | list output without top-level cursor/truncation |
| `phone_call_list` | `phone-tools` | `local_plugin` | `read` | 2 | 1 | 1 | 30 | list output without top-level cursor/truncation |
| `phone_call_readiness_get` | `phone-tools` | `local_plugin` | `read` | 0 | 0 | 4 | 44 | list output without top-level cursor/truncation |
| `phone_sms_list` | `phone-tools` | `local_plugin` | `read` | 2 | 1 | 1 | 28 | list output without top-level cursor/truncation |
| `phone_sms_readiness_get` | `phone-tools` | `local_plugin` | `read` | 0 | 0 | 4 | 45 | list output without top-level cursor/truncation |
| `profile_activity_search` | `profile-context-tools` | `local_plugin` | `read` | 7 | 1 | 2 | 41 | list output without top-level cursor/truncation |
| `profile_file_find` | `profile-files` | `local_plugin` | `read` | 5 | 1 | 2 | 82 | list output without top-level cursor/truncation |
| `profile_file_send` | `profile-files` | `local_plugin` | `write` | 4 | 1 | 4 | 110 | list output without top-level cursor/truncation |
| `proposal_create` | `proposals-tools` | `local_plugin` | `write` | 8 | 5 | 2 | 77 | many inputs |
| `public_web_browser_auth_contexts_list` | `public-web-tools` | `local_plugin` | `read` | 0 | 0 | 1 | 76 | list output without top-level cursor/truncation |
| `public_web_fetch_url` | `public-web-tools` | `local_plugin` | `read` | 4 | 4 | 9 | 110 | list output without top-level cursor/truncation |
| `scheduled_task_list` | `scheduled-tasks-tools` | `local_plugin` | `read` | 2 | 2 | 1 | 29 | list output without top-level cursor/truncation |
| `time_resolve` | `time-tools` | `local_plugin` | `read` | 1 | 1 | 3 | 37 | list output without top-level cursor/truncation |
| `work_item_list` | `work-tools` | `local_plugin` | `read` | 2 | 2 | 1 | 47 | list output without top-level cursor/truncation |
| `work_route_list` | `work-tools` | `local_plugin` | `read` | 0 | 0 | 1 | 36 | list output without top-level cursor/truncation |

### Shortest Descriptions

| Tool | Plugin | Effect | Inputs | Words |
| --- | --- | --- | --- | --- |
| `scheduled_task_get` | `scheduled-tasks-tools` | `read` | 1 | 24 |
| `action_list` | `actions-tools` | `read` | 2 | 25 |
| `action_get` | `actions-tools` | `read` | 1 | 26 |
| `microsoft_onedrive_files_search` | `microsoft-onedrive-tools` | `read` | 2 | 27 |
| `google_drive_permission_get` | `google-drive-tools` | `read` | 3 | 28 |
| `microsoft_onedrive_drive_get` | `microsoft-onedrive-tools` | `read` | 1 | 28 |
| `microsoft_onedrive_permissions_list` | `microsoft-onedrive-tools` | `read` | 2 | 28 |
| `microsoft_onedrive_versions_list` | `microsoft-onedrive-tools` | `read` | 2 | 28 |
| `phone_sms_list` | `phone-tools` | `read` | 2 | 28 |
| `microsoft_onedrive_permission_get` | `microsoft-onedrive-tools` | `read` | 3 | 29 |

### Most Inputs

| Tool | Plugin | Effect | Inputs | Required | Words |
| --- | --- | --- | --- | --- | --- |
| `google_calendar_event_update` | `google-calendar-tools` | `write` | 17 | 8 | 124 |
| `microsoft_todo_task_update` | `microsoft-todo-tools` | `write` | 17 | 8 | 75 |
| `outlook_calendar_event_update` | `outlook-calendar-tools` | `write` | 17 | 8 | 94 |
| `phone_call_start` | `phone-tools` | `write` | 17 | 17 | 84 |
| `google_calendar_event_create` | `google-calendar-tools` | `write` | 16 | 12 | 92 |
| `microsoft_todo_task_create` | `microsoft-todo-tools` | `write` | 16 | 10 | 73 |
| `outlook_calendar_event_create` | `outlook-calendar-tools` | `write` | 16 | 12 | 73 |
| `boldsign_signature_requests_list` | `boldsign-tools` | `read` | 15 | 2 | 526 |
| `monday_item_list` | `monday-tools` | `read` | 14 | 4 | 490 |
| `microsoft_onedrive_invite_recipients` | `microsoft-onedrive-tools` | `write` | 13 | 3 | 71 |

## Built-in Tools

### `llm-task`

Use this when small bounded extraction or classification is needed over supplied evidence. Runs a focused JSON-only LLM task over supplied text, structured input, or text descriptions of media evidence. Returns structured JSON details from the focused task. Do not use this when provider search/read tools or missing evidence are required instead, or raw image/PDF bytes need analysis rather than supplied text evidence. This tool serializes input as JSON text and does not decode raw image bytes or media:// references. For saved file or image attachments, use file_describe or file_extract_data instead of passing raw bytes or media references to llm-task.

- Execution: `builtin`
- Effect: `read`
- Returns: `details` (object)
- Inputs:
  - `authProfileId` (optional, string): Optional auth profile id for provider routing.
  - `input` (optional, object): Optional text or structured input for the JSON-only task.
  - `maxTokens` (optional, integer): Optional maximum output token budget.
  - `model` (optional, string): Optional LLM model override.
  - `prompt` (required, string): Task instructions. The tool should return JSON only.
  - `provider` (optional, string): Optional LLM provider override.
  - `schema` (optional, object): Optional JSON Schema-like shape the task output should satisfy.
  - `temperature` (optional, number): Optional sampling temperature override.
  - `thinking` (optional, string): Optional reasoning/thinking mode override.
  - `timeoutMs` (optional, integer): Optional task timeout in milliseconds.
- Outputs:
  - `details` (object): Structured details returned by the LLM task.
  - `details.json` (object): JSON result returned by the focused LLM task.

Example input:
```json
{
  "authProfileId": "authProfileId_example",
  "input": null,
  "maxTokens": 1,
  "model": "model_example",
  "prompt": "prompt_example",
  "provider": "provider_example",
  "schema": {},
  "temperature": 1,
  "thinking": "thinking_example",
  "timeoutMs": 1
}
```

Example output:
```json
{
  "details": {
    "json": null
  }
}
```

### `message`

Use this when the assistant needs to send a client-visible reply in the current thread. Sends text, optional portable presentation controls, and optionally one native media attachment to the current channel. Returns message send receipt data. Always include short text when using presentation; Telegram and other channels may reject or poorly render presentation-only sends. Use presentation for compact mobile UI such as digest navigation, section drill-down, choices, confirmations, and approval-style next steps; the current channel renderer handles native controls or graceful text fallback. Portable button call shape is { "action": "send", "message": "Pick a section.", "presentation": { "blocks": [{ "type": "buttons", "buttons": [{ "label": "Highlights", "value": "brief:highlights" }] }] } }; do not put buttons at presentation root. For buttons, use presentation.blocks[].buttons[].value as a short stable callback token like brief:headlines; do not include secrets, JSON, URLs, local paths, provider ids, or bulky payloads. Button objects use label plus value or url; do not use callback, callback_data, action_id, or provider-native action objects. URL buttons must use HTTPS and should only point to links safe for the client to open. Do not pass provider-native fields such as reply_markup, callback_data objects, Slack blocks, Discord components, or Teams cards. External write: sends a visible message to the client. Before calling, the user-visible text, presentation, and optional media attachment must be ready to send.

- Execution: `builtin`
- Effect: `write`
- Returns: `channel` (string), `messageId` (string)
- Inputs:
  - `action` (required, "send"): Send a visible message to the current channel.
  - `delivery` (optional, object): Optional generic delivery preferences such as pinning.
  - `delivery.pin` (optional, union): Generic message pinning preference for channels that support it.
  - `media` (optional, string): Optional media URL or assistant media reference to send as a native channel attachment. Prefer dedicated file delivery tools for saved profile files.
  - `message` (optional, string): Client-visible message text to send to the current user/thread. Required unless sending media-only.
  - `presentation` (optional, object): Optional portable assistant message presentation attached to the message text for compact buttons, selects, dividers, and semantic tone. Do not use provider-native Telegram, Slack, Discord, or Teams fields here.
  - `presentation.blocks` (required, array): Portable assistant message presentation blocks. Channels render these natively when supported or degrade to text.
  - `presentation.title` (optional, string): Optional compact presentation title.
  - `presentation.tone` (optional, "neutral" | "info" | "success" | "warning" | "danger"): Semantic tone hint; channels may render or ignore it.
- Outputs:
  - `channel` (string): Channel that accepted the sent message.
  - `messageId` (string): Provider or channel message id for the sent message, when available.

Example input:
```json
{
  "action": "send",
  "message": "Today's brief is ready.",
  "presentation": {
    "title": "Daily Brief",
    "tone": "info",
    "blocks": [
      {
        "type": "context",
        "text": "Three sections need attention."
      },
      {
        "type": "buttons",
        "buttons": [
          {
            "label": "Headlines",
            "value": "brief:headlines"
          },
          {
            "label": "Decisions",
            "value": "brief:decisions"
          },
          {
            "label": "Schedule",
            "value": "brief:schedule"
          }
        ]
      }
    ]
  }
}
```

Example output:
```json
{
  "channel": "channel_example",
  "messageId": "messageId_example"
}
```

### `web_search`

Use this when current public web information is needed and the answer cannot be produced from user-provided context or connected client data. Searches the web through the configured managed web search provider. Returns provider search results or a provider-synthesized answer with citations when available. Do not use this when for JS-heavy pages, login-only content, or fetching a known URL; use browser automation or web_fetch when those tools are available and appropriate. Prefer connected client sources of truth such as email, calendar, Drive, OneDrive, Monday, or signed-document tools when the user asks about their private work. For current public facts, prices, news, laws, schedules, products, or other time-sensitive information, search before answering. Explain provider/auth/rate-limit failures plainly instead of guessing.

- Execution: `builtin`
- Effect: `read`
- Runtime profile note: disabled for profile assistants; use public_web_search.
- Returns: `answer` (string), `citations` (array), `provider` (string), `query` (string), `results` (array)
- Inputs:
  - `count` (optional, integer): Number of search results to return.
  - `country` (optional, string): Optional two-letter ISO country code for localized results.
  - `date_after` (optional, string): Only include results after this date.
  - `date_before` (optional, string): Only include results before this date.
  - `domain_filter` (optional, array): Optional provider-specific domain allowlist or denylist.
  - `freshness` (optional, "day" | "week" | "month" | "year"): Optional recency filter.
  - `language` (optional, string): Optional ISO 639-1 language code for results.
  - `max_tokens` (optional, integer): Optional provider-specific total content budget.
  - `max_tokens_per_page` (optional, integer): Optional provider-specific per-page content budget.
  - `query` (required, string): Search query to send to the configured web search provider.
  - `search_lang` (optional, string): Optional Brave search-language code.
  - `ui_lang` (optional, string): Optional Brave UI language code.
- Outputs:
  - `answer` (string): Synthesized answer when returned by the provider.
  - `citations` (array): Citations or source references returned by the provider.
  - `citations[].title` (string): Citation title when returned by the provider.
  - `citations[].url` (string): Citation URL when returned by the provider.
  - `provider` (string): Resolved web search provider id.
  - `query` (string): Search query executed by the provider.
  - `results` (array): Structured search results.
  - `results[].snippet` (string): Search result snippet or description.
  - `results[].title` (string): Search result title.
  - `results[].url` (string): Search result URL.

Example input:
```json
{
  "count": 5,
  "country": "country_example",
  "date_after": "date_after_example",
  "date_before": "date_before_example",
  "domain_filter": [
    "domain_filter_example"
  ],
  "freshness": "day",
  "language": "language_example",
  "max_tokens": 1,
  "max_tokens_per_page": 1,
  "query": "query_example",
  "search_lang": "search_lang_example",
  "ui_lang": "ui_lang_example"
}
```

Example output:
```json
{
  "answer": "answer_example",
  "citations": [
    {
      "title": "title_example",
      "url": "url_example"
    }
  ],
  "provider": "provider_example",
  "query": "query_example",
  "results": [
    {
      "snippet": "snippet_example",
      "title": "title_example",
      "url": "url_example"
    }
  ]
}
```

## Assistant Capability Tools

### `action_decide`

Use this when the user clearly approves or rejects one pending approval-governed provider write action. Records the user's decision for one pending action. Returns the action lifecycle status and failure details. External write: approval may continue provider processing; rejection is terminal. Before calling, the action id, decision, and match to the user's decision must be clear; requires a trusted user messaging session.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `action` (object)
- Inputs:
  - `actionId` (required, string): Backend profile provider action id from a write result that returned needs_review, action_list, or action_get.
  - `decision` (required, "approve" | "reject"): Whether the user approved or rejected the pending action.
- Outputs:
  - `action` (object): Profile action status result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `action.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `action.failure` (object): Structured detail for failed or uncertain writes.
  - `action.failure.field` (string): Input field related to the failure.
  - `action.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `action.failure.message` (string): Short safe failure detail.
  - `action.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `action.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `action.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `action.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `action.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "actionId": "actionId_example",
  "decision": "approve"
}
```

Example output:
```json
{
  "action": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `action_get`

Use this when one approval-governed provider write action needs inspection by id. Fetches one profile action. Returns action id, current write/approval lifecycle status, title, and expiration.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `action` (object)
- Inputs:
  - `actionId` (required, string): Backend profile provider action id.
- Outputs:
  - `action` (object): Requested profile provider action.
  - `action.actionId` (string): Backend profile action id for this approval-backed provider write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `action.expiresAt` (union): Expiration timestamp for this pending action, or null when it does not expire. Example: `"2026-05-21T14:30:00.000Z"`.
  - `action.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current assistant-facing provider write status.
  - `action.title` (string): Short human-readable title for the approval request.

Example input:
```json
{
  "actionId": "actionId_example"
}
```

Example output:
```json
{
  "action": {
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "expiresAt": "2026-05-21T14:30:00.000Z",
    "status": "needs_review",
    "title": "title_example"
  }
}
```

### `action_list`

Use this when the user asks about approval-governed provider write actions. Lists approval-governed provider write actions for this profile. Returns action summaries and lifecycle statuses.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `actions` (array)
- Inputs:
  - `limit` (required, integer): Maximum number of actions to return.
  - `scope` (required, "pending" | "active" | "recent"): Which profile provider actions to list: pending awaits a user decision, active is a broader in-flight/problem set that includes pending approvals, and recent returns the most recently updated actions regardless of status. Use this field name only; do not pass status or filter.
- Outputs:
  - `actions` (array): Profile provider actions matching the request.
  - `actions[].actionId` (string): Backend profile action id for this approval-backed provider write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `actions[].expiresAt` (union): Expiration timestamp for this pending action, or null when it does not expire. Example: `"2026-05-21T14:30:00.000Z"`.
  - `actions[].status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current assistant-facing provider write status.
  - `actions[].title` (string): Short human-readable title for the approval request.

Example input:
```json
{
  "limit": 10,
  "scope": "pending"
}
```

Example output:
```json
{
  "actions": [
    {
      "actionId": "550e8400-e29b-41d4-a716-446655440000",
      "expiresAt": "2026-05-21T14:30:00.000Z",
      "status": "needs_review",
      "title": "title_example"
    }
  ]
}
```

### `boldsign_file_download`

Use this when a completed or signed BoldSign document PDF must be delivered, filed, or attached later. Downloads a BoldSign document PDF and stores it as a bounded profile artifact. Returns saved artifact metadata and safe failure details. External write: creates a durable profile artifact but does not send the file to the user by itself. Before calling, the BoldSign document id must come from a prior scoped BoldSign result for this profile and identify the intended completed or signed document.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `accountEmail` (union), `byteSize` (integer), `filename` (string), `mimeType` (string), `profileFileId` (string), `provider` ("boldsign"), `sha256` (string)
- Inputs:
  - `connectedAccountId` (optional, string): Optional profile-configured BoldSign connected account id when multiple accounts exist; profile document scope is still enforced.
  - `documentId` (required, string): BoldSign completed/signed document id from a prior scoped result for this profile to download.
  - `filename` (optional, string): Optional stored artifact filename including .pdf extension.
  - `onBehalfOf` (optional, string): Sender identity email when the document was sent on behalf of another user.
- Outputs:
  - `accountEmail` (union): Provider account email used to fetch or create the artifact, when known. Example: `"client@example.com"`.
  - `byteSize` (integer): Profile file size in bytes. Example: `24576`.
  - `filename` (string): Stored profile-file filename including extension. Example: `"signed-agreement.pdf"`.
  - `mimeType` (string): MIME type of the saved artifact. Example: `"application/pdf"`.
  - `profileFileId` (string): Durable profile file id for the saved file. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `provider` ("boldsign"): Provider that produced the saved profile file.
  - `sha256` (string): SHA-256 hex digest for stale-file protection. Example: `"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "documentId": "documentId_example",
  "filename": "filename_example",
  "onBehalfOf": "onBehalfOf_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "byteSize": 24576,
  "filename": "signed-agreement.pdf",
  "mimeType": "application/pdf",
  "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "boldsign",
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

### `boldsign_send_document_for_signature`

Use this when the user wants to send a finalized PDF artifact for signature through BoldSign. Sends the PDF artifact for signature with artifact ownership, hash, and idempotency checks. Returns the write lifecycle status and safe failure details. expectedSha256 is optional; supply it when a known digest is available to verify the PDF artifact. This send tool uses the profile default BoldSign account; it does not accept connectedAccountId or onBehalfOf. The PDF must come from a rendered mandate template that includes hidden BoldSign definition markers {{@clientSig}} and {{@clientDate}}; placement is template-owned, not coordinate-based. External write: may create a BoldSign signature request or create an approval-governed signature action. Before calling, the PDF content must be ready for signing, include the required BoldSign definition markers, and artifact id, signer email/name, and signing intent must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `expectedSha256` (optional, string): Optional SHA-256 expected for the artifact being sent.
  - `profileFileId` (required, string): Profile file id for the finalized PDF to send for signature.
  - `signerEmail` (required, string): Signer email.
  - `signerName` (required, string): Signer display name.
  - `title` (optional, string): Optional signing request title.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "expectedSha256": "expectedSha256_example",
  "profileFileId": "profileFileId_example",
  "signerEmail": "signerEmail_example",
  "signerName": "signerName_example",
  "title": "title_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `boldsign_signature_request_cancel`

Use this when the user wants to cancel an incomplete BoldSign signature request. Revokes the signature request so signers can no longer view or sign it. Returns the write lifecycle status and safe failure details. message is required and is sent to signers as the cancellation reason. External write: may revoke a BoldSign signature request or create an approval-governed signature action. Before calling, the correct document id must come from a prior scoped BoldSign result for this profile and be confirmed because this is a destructive external write.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Optional profile-configured BoldSign connected account id when multiple accounts exist; profile document scope is still enforced.
  - `documentId` (required, string): BoldSign document id from a prior scoped result for this profile to cancel/revoke.
  - `message` (required, string): Cancellation reason sent by BoldSign to signers.
  - `onBehalfOf` (optional, string): Sender identity email when the document was sent on behalf of another user.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "documentId": "documentId_example",
  "message": "message_example",
  "onBehalfOf": "onBehalfOf_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `boldsign_signature_request_remind`

Use this when the user wants to remind signers for an in-progress BoldSign request. Sends a BoldSign reminder email for a signature request. Returns the write lifecycle status and safe failure details. Do not use this when the request is not pending or signers no longer need to act. message is required and is sent to signers via BoldSign. External write: may send a BoldSign reminder email or create an approval-governed signature action. Before calling, the exact pending signature request must come from a prior scoped BoldSign result for this profile.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Optional profile-configured BoldSign connected account id when multiple accounts exist; profile document scope is still enforced.
  - `documentId` (required, string): BoldSign document id from a prior scoped result for this profile to remind signers for.
  - `message` (required, string): Reminder message sent by BoldSign to pending signers.
  - `onBehalfOf` (optional, string): Sender identity email when the document was sent on behalf of another user.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "documentId": "documentId_example",
  "message": "message_example",
  "onBehalfOf": "onBehalfOf_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `boldsign_signature_requests_list`

Use this when the user needs BoldSign signature request statuses, document/signature blockers, missing/next-action evidence for signed documents, or deal update drafts where signed-document status may matter. Searches, filters, and reads BoldSign signature requests. Returns profile-scoped assigned signature request summaries, ISO timestamps, status counts, latest request, latest completed request, and whether viewed/opened evidence is available. Results are scoped to the current profile's assigned BoldSign documents; user filters narrow that assigned set and must not be used as a client isolation mechanism. For a deal, mandate, or document blocker request, use this to check live signature status before claiming there are no active signature blockers. If BoldSign auth, setup, quota, rate limit, or provider availability prevents the read, surface that structured failure instead of inferring signature state. Use query for search text; do not pass searchText. Use limit for result count; do not pass pageSize. Use page=1 for the first page; increase page for ordinary pagination. Use nextCursor only when BoldSign returns a cursor for deep pagination. Use dateFilterType only with both startDate and endDate. If viewedStatusAvailable is false, answer viewed/opened status as unavailable instead of guessing from InProgress or Completed. InProgress means not completed; it does not prove the signer has not opened or viewed the request. When multiple matching requests exist, compare latestRequest with latestCompletedRequest before summarizing current state. If latestRequest is InProgress and newer than latestCompletedRequest, treat that newest request as active outstanding evidence unless current data proves it was superseded. If any returned request or statusCounts entry is InProgress, do not conclude there is no valid outstanding signature request merely because latestRequest is Revoked or a completed request exists. Treat each InProgress request as active outstanding evidence until current provider data proves that exact request was revoked, completed, expired, or superseded. Do not call returned signature requests test data, test duplicates, fake data, mock data, or invalid duplicates unless current BoldSign fields prove those exact document ids are invalid or superseded. Do not recommend sending a fresh mandate or signature request while InProgress requests exist unless the user explicitly asked to replace them or current evidence proves they are invalid; the clean next step is owner confirmation, follow-up, reminder, or a cleanup decision. For ordinary next-action recommendations, make the practical next step a follow-up, reminder, or owner-confirmation around the newest active request; do not recommend canceling in-progress requests as duplicates or prioritizing unrelated email cleanup unless the user asked about cleanup and current evidence proves which requests are superseded. Use sentAtProfileLocal and completedAtProfileLocal for client-visible dates/times when present. sentAt and completedAt are UTC ISO strings; do not infer local dates from them mentally. Provider Completed status and PDF content can conflict. If PDF analysis says the client signature is missing, incomplete, or placeholder-only, do not call the document fully signed without naming that caveat. If the user asks whether a signed copy is filed or saved, also use Google Drive tools such as google_drive_search or google_drive_folder_list before making a positive or negative filing claim; BoldSign status and profile activity alone do not prove live Drive filing. Never expose full or shortened BoldSign document ids in client-visible replies; use ids only for follow-up tool calls.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `connectedAccountId` (string), `nextCursor` (union), `provider` ("boldsign"), `requests` (array), `summary` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Optional profile-configured BoldSign connected account id when multiple accounts exist; profile document scope is still enforced.
  - `dateFilterType` (optional, "SentBetween" | "Expiring"): Date filter mode; when set, provide both startDate and endDate.
  - `documentId` (optional, string): Optional BoldSign document id from a prior scoped result for this profile.
  - `endDate` (optional, string): End date-time filter; required with dateFilterType.
  - `labels` (optional, array): Additional BoldSign label/tag filter inside the current profile's assigned document scope.
  - `limit` (required, integer): Maximum requests to return (latest first). Use this field, not pageSize.
  - `nextCursor` (optional, integer): BoldSign nextCursor for pagination beyond 10,000 records.
  - `page` (required, integer): BoldSign result page to return.
  - `query` (optional, string): Optional search text. Maps to BoldSign searchKey for title, document id, sender, or recipient names. Use this field, not searchText.
  - `recipients` (optional, array): Signer/recipient email address filter.
  - `sentBy` (optional, array): Sender email address filter.
  - `startDate` (optional, string): Start date-time filter; required with dateFilterType.
  - `status` (optional, union): Alias for statuses when filtering by one status or a short status list.
  - `statuses` (optional, array): BoldSign document status filter.
  - `transmitType` (optional, "Sent" | "Received" | "Both"): Whether to list sent requests, received requests, or both.
- Outputs:
  - `accountEmail` (union): BoldSign account email used for this result. Example: `"client@example.com"`.
  - `connectedAccountId` (string): Connected account id used for this read. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `nextCursor` (union): BoldSign pagination cursor for the next page, or null when complete.
  - `provider` ("boldsign"): Provider backing this result.
  - `requests` (array): BoldSign signature requests assigned to the current profile and returned.
  - `requests[].completedAt` (union): Timestamp when signing completed, or null if incomplete. Convert offset/Z timestamps before telling the client a local date or time. Example: `"2026-05-21T14:30:00.000Z"`.
  - `requests[].completedAtProfileLocal` (union): Profile-local formatted completion timestamp when completedAt is parseable.
  - `requests[].documentId` (union): Internal BoldSign document id for follow-up tool calls; never show to clients.
  - `requests[].sentAt` (union): Timestamp when the signature request was sent, when known. Convert offset/Z timestamps before telling the client a local date or time. Example: `"2026-05-21T14:30:00.000Z"`.
  - `requests[].sentAtProfileLocal` (union): Profile-local formatted send timestamp when sentAt is parseable.
  - `requests[].status` (string): BoldSign signature request status.
  - `requests[].title` (union): Signature request title.
  - `summary` (object): Normalized summary of returned BoldSign signature requests.
  - `summary.latestCompletedRequest` (union): Most recently completed returned signature request, or null when none completed.
  - `summary.latestCompletedRequest.completedAt` (union): Timestamp when signing completed, or null if incomplete. Convert offset/Z timestamps before telling the client a local date or time. Example: `"2026-05-21T14:30:00.000Z"`.
  - `summary.latestCompletedRequest.completedAtProfileLocal` (union): Profile-local formatted completion timestamp when completedAt is parseable.
  - `summary.latestCompletedRequest.sentAt` (union): Timestamp when the signature request was sent, when known. Convert offset/Z timestamps before telling the client a local date or time. Example: `"2026-05-21T14:30:00.000Z"`.
  - `summary.latestCompletedRequest.sentAtProfileLocal` (union): Profile-local formatted send timestamp when sentAt is parseable.
  - `summary.latestCompletedRequest.status` (string): BoldSign signature request status.
  - `summary.latestCompletedRequest.title` (union): Signature request title.
  - `summary.latestRequest` (union): Most recently sent returned signature request, or null when none were returned.
  - `summary.latestRequest.completedAt` (union): Timestamp when signing completed, or null if incomplete. Convert offset/Z timestamps before telling the client a local date or time. Example: `"2026-05-21T14:30:00.000Z"`.
  - `summary.latestRequest.completedAtProfileLocal` (union): Profile-local formatted completion timestamp when completedAt is parseable.
  - `summary.latestRequest.sentAt` (union): Timestamp when the signature request was sent, when known. Convert offset/Z timestamps before telling the client a local date or time. Example: `"2026-05-21T14:30:00.000Z"`.
  - `summary.latestRequest.sentAtProfileLocal` (union): Profile-local formatted send timestamp when sentAt is parseable.
  - `summary.latestRequest.status` (string): BoldSign signature request status.
  - `summary.latestRequest.title` (union): Signature request title.
  - `summary.statusCounts` (array): Counts by status for the returned signature requests.
  - `summary.statusCounts[].count` (integer): Number of returned requests with this status.
  - `summary.statusCounts[].status` (string): BoldSign signature request status.
  - `summary.viewedStatusAvailable` (false): This list result does not include separate viewed/opened event evidence; do not claim viewed status from this tool.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "dateFilterType": "SentBetween",
  "documentId": "documentId_example",
  "endDate": "2026-05-21T14:30:00.000Z",
  "labels": [
    "labels_example"
  ],
  "limit": 25,
  "nextCursor": 1,
  "page": 1,
  "query": "query_example",
  "recipients": [
    "recipients_example"
  ],
  "sentBy": [
    "sentBy_example"
  ],
  "startDate": "2026-05-21T14:30:00.000Z",
  "status": "status_example",
  "statuses": [
    "statuses_example"
  ],
  "transmitType": "Sent"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "nextCursor": 1,
  "provider": "boldsign",
  "requests": [
    {
      "completedAt": "2026-05-21T14:30:00.000Z",
      "completedAtProfileLocal": "completedAtProfileLocal_example",
      "documentId": "documentId_example",
      "sentAt": "2026-05-21T14:30:00.000Z",
      "sentAtProfileLocal": "sentAtProfileLocal_example",
      "status": "status_example",
      "title": "title_example"
    }
  ],
  "summary": {
    "latestCompletedRequest": {
      "completedAt": "2026-05-21T14:30:00.000Z",
      "completedAtProfileLocal": "completedAtProfileLocal_example",
      "sentAt": "2026-05-21T14:30:00.000Z",
      "sentAtProfileLocal": "sentAtProfileLocal_example",
      "status": "status_example",
      "title": "title_example"
    },
    "latestRequest": {
      "completedAt": "2026-05-21T14:30:00.000Z",
      "completedAtProfileLocal": "completedAtProfileLocal_example",
      "sentAt": "2026-05-21T14:30:00.000Z",
      "sentAtProfileLocal": "sentAtProfileLocal_example",
      "status": "status_example",
      "title": "title_example"
    },
    "statusCounts": [
      {
        "count": 1,
        "status": "status_example"
      }
    ],
    "viewedStatusAvailable": false
  }
}
```

### `document_convert_to_pdf`

Use this when a complete non-template document profile file needs to be converted to a PDF. Do not use this to fill/render templates or replace fields; use document_template_render for that. Supported formats: .docx, .doc, .odt, .rtf, .xlsx, .xls, .csv, .pptx, .ppt, .txt. Converts the provided document profile file into a new PDF profile file. Returns metadata for the original and newly generated PDF profile files. External write: creates a new internal PDF profile file. Before calling, the source profile file must be a non-PDF file in one of the explicitly supported formats; never use this to inspect, fill, validate, or preview an unrendered template.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `convertedAt` (string), `pdfFile` (object), `provider` ("document-tools"), `sourceFile` (object)
- Inputs:
  - `profileFileId` (required, string): Profile file id for the document to convert to PDF.
- Outputs:
  - `convertedAt` (string): Timestamp when the document was converted. Example: `"2026-05-21T14:30:00.000Z"`.
  - `pdfFile` (object): Generated PDF profile file.
  - `pdfFile.artifactType` (string): Internal document file kind, such as source, docx, pdf, or preview.
  - `pdfFile.byteSize` (union): Profile file size in bytes, when known.
  - `pdfFile.createdAt` (string): Timestamp when the profile file was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `pdfFile.filename` (string): Profile file filename including extension. Example: `"rendered-document.pdf"`.
  - `pdfFile.mimeType` (union): MIME type of the profile file. Example: `"application/pdf"`.
  - `pdfFile.profileFileId` (string): Durable profile file id for this document file. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `pdfFile.sha256` (union): SHA-256 hex digest for stale-artifact protection, when known. Example: `"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`.
  - `provider` ("document-tools"): Provider/tool surface that converted the document.
  - `sourceFile` (object): Original document profile file.
  - `sourceFile.artifactType` (string): Internal document file kind, such as source, docx, pdf, or preview.
  - `sourceFile.byteSize` (union): Profile file size in bytes, when known.
  - `sourceFile.createdAt` (string): Timestamp when the profile file was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `sourceFile.filename` (string): Profile file filename including extension. Example: `"rendered-document.pdf"`.
  - `sourceFile.mimeType` (union): MIME type of the profile file. Example: `"application/pdf"`.
  - `sourceFile.profileFileId` (string): Durable profile file id for this document file. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `sourceFile.sha256` (union): SHA-256 hex digest for stale-artifact protection, when known. Example: `"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`.

Example input:
```json
{
  "profileFileId": "profileFileId_example"
}
```

Example output:
```json
{
  "convertedAt": "2026-05-21T14:30:00.000Z",
  "pdfFile": {
    "artifactType": "artifactType_example",
    "byteSize": 1,
    "createdAt": "2026-05-21T14:30:00.000Z",
    "filename": "rendered-document.pdf",
    "mimeType": "application/pdf",
    "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  },
  "provider": "document-tools",
  "sourceFile": {
    "artifactType": "artifactType_example",
    "byteSize": 1,
    "createdAt": "2026-05-21T14:30:00.000Z",
    "filename": "rendered-document.pdf",
    "mimeType": "application/pdf",
    "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}
```

### `document_create_pdf`

Use this when plain text, Markdown, or safe self-contained HTML content needs to become a durable PDF profile file, such as an email body, invoice text, report, note, or assistant-authored document. Creates a new internal PDF profile file from explicit plain text, Markdown, or safe HTML content. Returns editable source file metadata, generated PDF file metadata, creation timestamp, and source content hash/provenance. Use contentFormat=markdown for structured reports, contentFormat=plain_text for ordinary source-preserving text, and contentFormat=html only for self-contained HTML with no scripts or remote resources. Keep the returned sourceFile when the PDF may need revision; retrieve that source with document_source_get, edit the source, then call document_create_pdf again. Use document_template_render for existing DOCX templates and document_convert_to_pdf for existing document profile files. External write: creates a new internal editable source profile file and PDF profile file. Before calling, the content, output filename, and source provenance must be clear to the assistant; optional sourceRefs can record provenance. Unsafe HTML is rejected instead of fetched or executed.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `createdAt` (string), `pdfFile` (object), `provider` ("document-tools"), `source` (object), `sourceFile` (object)
- Inputs:
  - `content` (required, string): Plain text, Markdown, or safe self-contained HTML content to render into a PDF.
  - `contentFormat` (required, "plain_text" | "html" | "markdown"): Source content format to render into a PDF.
  - `description` (optional, string): Optional durable profile-file description.
  - `filename` (required, string): Output PDF filename. .pdf is added when omitted.
  - `sourceRefs` (optional, object): Optional caller-supplied provenance for the source content.
  - `title` (optional, string): Optional document title for PDF metadata/description.
- Outputs:
  - `createdAt` (string): Timestamp when the PDF was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `pdfFile` (object): Generated PDF profile file.
  - `pdfFile.artifactType` (string): Internal document file kind, such as source, docx, pdf, or preview.
  - `pdfFile.byteSize` (union): Profile file size in bytes, when known.
  - `pdfFile.createdAt` (string): Timestamp when the profile file was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `pdfFile.filename` (string): Profile file filename including extension. Example: `"rendered-document.pdf"`.
  - `pdfFile.mimeType` (union): MIME type of the profile file. Example: `"application/pdf"`.
  - `pdfFile.profileFileId` (string): Durable profile file id for this document file. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `pdfFile.sha256` (union): SHA-256 hex digest for stale-artifact protection, when known. Example: `"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`.
  - `provider` ("document-tools"): Provider/tool surface that created the PDF.
  - `source` (object): Source content provenance and hash metadata.
  - `source.contentFormat` ("plain_text" | "html" | "markdown"): Source content format.
  - `source.contentSha256` (string): SHA-256 hex digest of the source content.
  - `source.sourceRefKeys` (array): Source reference keys supplied.
  - `sourceFile` (object): Editable source profile file used to generate the PDF.
  - `sourceFile.artifactType` (string): Internal document file kind, such as source, docx, pdf, or preview.
  - `sourceFile.byteSize` (union): Profile file size in bytes, when known.
  - `sourceFile.createdAt` (string): Timestamp when the profile file was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `sourceFile.filename` (string): Profile file filename including extension. Example: `"rendered-document.pdf"`.
  - `sourceFile.mimeType` (union): MIME type of the profile file. Example: `"application/pdf"`.
  - `sourceFile.profileFileId` (string): Durable profile file id for this document file. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `sourceFile.sha256` (union): SHA-256 hex digest for stale-artifact protection, when known. Example: `"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`.

Example input:
```json
{
  "content": "content_example",
  "contentFormat": "plain_text",
  "description": "description_example",
  "filename": "filename_example",
  "sourceRefs": {},
  "title": "title_example"
}
```

Example output:
```json
{
  "createdAt": "2026-05-21T14:30:00.000Z",
  "pdfFile": {
    "artifactType": "artifactType_example",
    "byteSize": 1,
    "createdAt": "2026-05-21T14:30:00.000Z",
    "filename": "rendered-document.pdf",
    "mimeType": "application/pdf",
    "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  },
  "provider": "document-tools",
  "source": {
    "contentFormat": "plain_text",
    "contentSha256": "contentSha256_example",
    "sourceRefKeys": [
      "sourceRefKeys_example"
    ]
  },
  "sourceFile": {
    "artifactType": "artifactType_example",
    "byteSize": 1,
    "createdAt": "2026-05-21T14:30:00.000Z",
    "filename": "rendered-document.pdf",
    "mimeType": "application/pdf",
    "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}
```

### `document_pdf_preview_create`

Use this when a PDF profile file needs visual inspection before sending, filing, or regenerating from source. Creates a PNG preview profile file for the first page of a profile-owned PDF file. Returns source PDF file metadata, generated PNG preview file metadata, and preview dimensions. Use this to inspect PDF layout; pass the PDF profile file id as pdfProfileFileId. Use document_source_get plus document_create_pdf for revisions. v1 supports pageSelection.kind=first_page only. External write: creates a new internal PNG preview profile file. Before calling, requires the expected PDF hash and rejects missing, cross-profile, non-PDF, or stale artifacts.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `createdAt` (string), `preview` (object), `previewFile` (object), `provider` ("document-tools"), `sourcePdfFile` (object)
- Inputs:
  - `expectedSha256` (required, string): Expected SHA-256 from the PDF profile file summary.
  - `pageSelection` (required, object): Optional preview page selection. v1 supports first_page only.
  - `pageSelection.kind` (required, "first_page"): Render only the first PDF page.
  - `pdfProfileFileId` (required, string): PDF profile file id to preview. Use this exact field name.
- Outputs:
  - `createdAt` (string): Timestamp when the preview profile file was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `preview` (object): Preview rendering metadata.
  - `preview.heightPx` (integer): Preview image height in pixels.
  - `preview.pageNumber` (integer): One-based PDF page number rendered.
  - `preview.pageSelection` (object): Preview page selection used.
  - `preview.pageSelection.kind` ("first_page"): Render only the first PDF page.
  - `preview.renderer` ("pdfjs"): Backend PDF preview renderer used.
  - `preview.sourcePdfSha256` (string): SHA-256 hex digest of the previewed PDF bytes.
  - `preview.widthPx` (integer): Preview image width in pixels.
  - `previewFile` (object): Generated PNG preview profile file.
  - `previewFile.artifactType` (string): Internal document file kind, such as source, docx, pdf, or preview.
  - `previewFile.byteSize` (union): Profile file size in bytes, when known.
  - `previewFile.createdAt` (string): Timestamp when the profile file was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `previewFile.filename` (string): Profile file filename including extension. Example: `"rendered-document.pdf"`.
  - `previewFile.mimeType` (union): MIME type of the profile file. Example: `"application/pdf"`.
  - `previewFile.profileFileId` (string): Durable profile file id for this document file. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `previewFile.sha256` (union): SHA-256 hex digest for stale-artifact protection, when known. Example: `"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`.
  - `provider` ("document-tools"): Provider/tool surface that created the preview.
  - `sourcePdfFile` (object): PDF profile file used for preview.
  - `sourcePdfFile.artifactType` (string): Internal document file kind, such as source, docx, pdf, or preview.
  - `sourcePdfFile.byteSize` (union): Profile file size in bytes, when known.
  - `sourcePdfFile.createdAt` (string): Timestamp when the profile file was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `sourcePdfFile.filename` (string): Profile file filename including extension. Example: `"rendered-document.pdf"`.
  - `sourcePdfFile.mimeType` (union): MIME type of the profile file. Example: `"application/pdf"`.
  - `sourcePdfFile.profileFileId` (string): Durable profile file id for this document file. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `sourcePdfFile.sha256` (union): SHA-256 hex digest for stale-artifact protection, when known. Example: `"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`.

Example input:
```json
{
  "expectedSha256": "expectedSha256_example",
  "pageSelection": {
    "kind": "first_page"
  },
  "pdfProfileFileId": "pdfProfileFileId_example"
}
```

Example output:
```json
{
  "createdAt": "2026-05-21T14:30:00.000Z",
  "preview": {
    "heightPx": 1,
    "pageNumber": 1,
    "pageSelection": {
      "kind": "first_page"
    },
    "renderer": "pdfjs",
    "sourcePdfSha256": "sourcePdfSha256_example",
    "widthPx": 1
  },
  "previewFile": {
    "artifactType": "artifactType_example",
    "byteSize": 1,
    "createdAt": "2026-05-21T14:30:00.000Z",
    "filename": "rendered-document.pdf",
    "mimeType": "application/pdf",
    "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  },
  "provider": "document-tools",
  "sourcePdfFile": {
    "artifactType": "artifactType_example",
    "byteSize": 1,
    "createdAt": "2026-05-21T14:30:00.000Z",
    "filename": "rendered-document.pdf",
    "mimeType": "application/pdf",
    "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}
```

### `document_source_get`

Use this when an editable source profile file returned by document_create_pdf needs to be retrieved so the assistant can revise and regenerate the PDF. Loads a profile-owned editable source artifact and returns its bounded UTF-8 plain text, Markdown, or HTML content. Returns source file metadata, source content format, source content, and source content hash. Use this instead of trying to mutate an existing PDF artifact. After revising the returned content, call document_create_pdf again to create a new source/PDF pair.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `provider` ("document-tools"), `retrievedAt` (string), `source` (object), `sourceFile` (object)
- Inputs:
  - `expectedSha256` (required, string): Expected SHA-256 from the source file summary or document_create_pdf source.contentSha256.
  - `sourceProfileFileId` (required, string): Source profile file id returned by document_create_pdf. Use this exact field name.
- Outputs:
  - `provider` ("document-tools"): Provider/tool surface that retrieved the source.
  - `retrievedAt` (string): Timestamp when the source content was retrieved. Example: `"2026-05-21T14:30:00.000Z"`.
  - `source` (object): Retrieved editable source content.
  - `source.content` (string): Editable UTF-8 source content for revision and regeneration.
  - `source.contentFormat` ("plain_text" | "html" | "markdown"): Editable source format.
  - `source.contentSha256` (string): SHA-256 hex digest of the returned source content.
  - `sourceFile` (object): Editable source profile file retrieved.
  - `sourceFile.artifactType` (string): Internal document file kind, such as source, docx, pdf, or preview.
  - `sourceFile.byteSize` (union): Profile file size in bytes, when known.
  - `sourceFile.createdAt` (string): Timestamp when the profile file was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `sourceFile.filename` (string): Profile file filename including extension. Example: `"rendered-document.pdf"`.
  - `sourceFile.mimeType` (union): MIME type of the profile file. Example: `"application/pdf"`.
  - `sourceFile.profileFileId` (string): Durable profile file id for this document file. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `sourceFile.sha256` (union): SHA-256 hex digest for stale-artifact protection, when known. Example: `"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`.

Example input:
```json
{
  "expectedSha256": "expectedSha256_example",
  "sourceProfileFileId": "sourceProfileFileId_example"
}
```

Example output:
```json
{
  "provider": "document-tools",
  "retrievedAt": "2026-05-21T14:30:00.000Z",
  "source": {
    "content": "content_example",
    "contentFormat": "plain_text",
    "contentSha256": "contentSha256_example"
  },
  "sourceFile": {
    "artifactType": "artifactType_example",
    "byteSize": 1,
    "createdAt": "2026-05-21T14:30:00.000Z",
    "filename": "rendered-document.pdf",
    "mimeType": "application/pdf",
    "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}
```

### `document_template_render`

Use this when an existing DOCX template profile file must be filled/rendered with explicit field values; use this for templates with placeholders, not document_convert_to_pdf. Renders the template into new internal DOCX and PDF profile files. Returns rendered file metadata and safe failure details; if provided fields and template fields do not match, the error lists the template keys, missing values, and unknown provided values. Input fields are templateProfileFileId and fieldValues; do not call this tool with profileFileId, fields, templateId, or values. Before saying all placeholders were replaced, verify the result through the returned template field coverage or call file_extract_text on the returned PDF profile file when text-level PDF verification is needed. If render metadata includes signing tags, treat them as internal signing-field placement metadata. In client-visible replies, say the signature fields are ready or configured; do not mention BoldSign, text tags, raw marker syntax, or definition ids unless the user explicitly asks for implementation details. External write: creates new internal DOCX and PDF profile files. Before calling, the template artifact and all field values must be explicit because this does not fetch source data by itself or send files.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `files` (object), `provider` ("document-tools"), `render` (object), `template` (object)
- Inputs:
  - `fieldValues` (required, object): Explicit replacement values supplied by the assistant from user input, provider reads, or file evidence. Use this exact field name, not fields or values.
  - `outputFilename` (optional, string): Optional output filename for the generated PDF; .pdf is added when omitted.
  - `sourceRefs` (optional, object): Optional caller-supplied provenance for field values; document tools do not fetch these sources.
  - `templateProfileFileId` (required, string): Profile file id for the DOCX template to render. Use this exact field name.
- Outputs:
  - `files` (object): Profile files created by the render operation.
  - `files.docx` (object): Generated DOCX profile file.
  - `files.docx.artifactType` (string): Internal document file kind, such as source, docx, pdf, or preview.
  - `files.docx.byteSize` (union): Profile file size in bytes, when known.
  - `files.docx.createdAt` (string): Timestamp when the profile file was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `files.docx.filename` (string): Profile file filename including extension. Example: `"rendered-document.pdf"`.
  - `files.docx.mimeType` (union): MIME type of the profile file. Example: `"application/pdf"`.
  - `files.docx.profileFileId` (string): Durable profile file id for this document file. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `files.docx.sha256` (union): SHA-256 hex digest for stale-artifact protection, when known. Example: `"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`.
  - `files.pdf` (object): Generated PDF profile file.
  - `files.pdf.artifactType` (string): Internal document file kind, such as source, docx, pdf, or preview.
  - `files.pdf.byteSize` (union): Profile file size in bytes, when known.
  - `files.pdf.createdAt` (string): Timestamp when the profile file was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `files.pdf.filename` (string): Profile file filename including extension. Example: `"rendered-document.pdf"`.
  - `files.pdf.mimeType` (union): MIME type of the profile file. Example: `"application/pdf"`.
  - `files.pdf.profileFileId` (string): Durable profile file id for this document file. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `files.pdf.sha256` (union): SHA-256 hex digest for stale-artifact protection, when known. Example: `"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`.
  - `provider` ("document-tools"): Provider/tool surface that rendered the document.
  - `render` (object): Render metadata for the document generation.
  - `render.boldSignTextTags` (array): Internal signing tags preserved in the rendered document for signature placement. Use this metadata for tool calls and verification, but describe it to clients only as signature fields being ready or configured.
  - `render.boldSignTextTags[].definitionId` (union): Internal signing definition id, such as clientSig or clientDate, when the marker uses a definition tag. Never show this id in client-visible replies.
  - `render.boldSignTextTags[].fieldId` (union): Stable field id encoded by the BoldSign marker, when provided.
  - `render.boldSignTextTags[].fieldType` (string): Signing field kind represented by the marker, such as sign or date.
  - `render.boldSignTextTags[].isRequired` (boolean): Whether the BoldSign marker requires signer input before completion.
  - `render.boldSignTextTags[].raw` (string): Internal signing marker text preserved from the DOCX template. Never show this raw marker in client-visible replies.
  - `render.boldSignTextTags[].signerIndex` (union): One-based signer index targeted by the marker, when encoded.
  - `render.fieldKeys` (array): Template field keys populated.
  - `render.renderedAt` (string): Timestamp when the document was rendered. Example: `"2026-05-21T14:30:00.000Z"`.
  - `render.sourceRefKeys` (array): Source reference keys supplied for provenance.
  - `render.templateFieldKeys` (array): Template field keys found in the DOCX before rendering.
  - `template` (object): Template profile file used for rendering.
  - `template.artifactType` (string): Internal document file kind, such as source, docx, pdf, or preview.
  - `template.byteSize` (union): Profile file size in bytes, when known.
  - `template.createdAt` (string): Timestamp when the profile file was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `template.filename` (string): Profile file filename including extension. Example: `"rendered-document.pdf"`.
  - `template.mimeType` (union): MIME type of the profile file. Example: `"application/pdf"`.
  - `template.profileFileId` (string): Durable profile file id for this document file. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `template.sha256` (union): SHA-256 hex digest for stale-artifact protection, when known. Example: `"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`.

Example input:
```json
{
  "fieldValues": {},
  "outputFilename": "outputFilename_example",
  "sourceRefs": {},
  "templateProfileFileId": "templateProfileFileId_example"
}
```

Example output:
```json
{
  "files": {
    "docx": {
      "artifactType": "artifactType_example",
      "byteSize": 1,
      "createdAt": "2026-05-21T14:30:00.000Z",
      "filename": "rendered-document.pdf",
      "mimeType": "application/pdf",
      "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    },
    "pdf": {
      "artifactType": "artifactType_example",
      "byteSize": 1,
      "createdAt": "2026-05-21T14:30:00.000Z",
      "filename": "rendered-document.pdf",
      "mimeType": "application/pdf",
      "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
  },
  "provider": "document-tools",
  "render": {
    "boldSignTextTags": [
      {
        "definitionId": "definitionId_example",
        "fieldId": "fieldId_example",
        "fieldType": "fieldType_example",
        "isRequired": true,
        "raw": "raw_example",
        "signerIndex": 1
      }
    ],
    "fieldKeys": [
      "fieldKeys_example"
    ],
    "renderedAt": "2026-05-21T14:30:00.000Z",
    "sourceRefKeys": [
      "sourceRefKeys_example"
    ],
    "templateFieldKeys": [
      "templateFieldKeys_example"
    ]
  },
  "template": {
    "artifactType": "artifactType_example",
    "byteSize": 1,
    "createdAt": "2026-05-21T14:30:00.000Z",
    "filename": "rendered-document.pdf",
    "mimeType": "application/pdf",
    "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}
```

### `file_describe`

Use this when a saved profile file needs a natural-language answer, visual inspection, image summary, scanned PDF reading, signature-looking check, or screenshot explanation. Loads one profile-owned file, verifies its expected hash, and answers the supplied question using deterministic text and LLM vision when needed. Returns source file metadata, answer, evidence summary, method used, and warnings. Use this for free-form answers. Use file_extract_data when the next step needs structured JSON. Do not expose profile file ids, hashes, tool names, or internal storage details in client-visible replies.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `analyzedAt` (string), `answer` (string), `evidence` (string), `methodUsed` ("embedded_text" | "utf8_text" | "vision" | "hybrid_text_and_vision"), `provider` ("file-analysis"), `sourceFile` (object), `warnings` (array)
- Inputs:
  - `expectedSha256` (required, string): Expected SHA-256 hex digest for stale-file protection.
  - `profileFileId` (required, string): Durable profile file id.
  - `question` (required, string): Question or description request to answer from the file content.
- Outputs:
  - `analyzedAt` (string): ISO timestamp when file description ran.
  - `answer` (string): Answer to the requested file description question.
  - `evidence` (string): Brief evidence summary supporting the answer without exposing raw internal refs.
  - `methodUsed` ("embedded_text" | "utf8_text" | "vision" | "hybrid_text_and_vision"): Extraction method used internally for this analysis result.
  - `provider` ("file-analysis"): Provider that produced this result.
  - `sourceFile` (object): Durable profile file metadata for the analyzed source.
  - `sourceFile.byteSize` (union): Stored file size in bytes, or null when unavailable.
  - `sourceFile.createdAt` (string): ISO timestamp when the profile file was saved.
  - `sourceFile.filename` (string): Original or stored filename for the analyzed profile file.
  - `sourceFile.mimeType` (union): Stored MIME type, or null when unavailable.
  - `sourceFile.profileFileId` (string): Durable profile file id.
  - `sourceFile.sha256` (union): Stored SHA-256 hex digest, or null when unavailable.
  - `warnings` (array): Non-fatal analysis warnings.
  - `warnings[].code` (string): Stable warning code.
  - `warnings[].message` (string): Human-readable warning message.

Example input:
```json
{
  "expectedSha256": "expectedSha256_example",
  "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
  "question": "Describe the file and note any visible details relevant to the current request."
}
```

Example output:
```json
{
  "analyzedAt": "analyzedAt_example",
  "answer": "answer_example",
  "evidence": "evidence_example",
  "methodUsed": "embedded_text",
  "provider": "file-analysis",
  "sourceFile": {
    "byteSize": 1,
    "createdAt": "createdAt_example",
    "filename": "filename_example",
    "mimeType": "mimeType_example",
    "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
    "sha256": "sha256_example"
  },
  "warnings": [
    {
      "code": "code_example",
      "message": "message_example"
    }
  ]
}
```

### `file_extract_data`

Use this when a saved profile file needs structured JSON extraction, such as identity details, addresses, receipt facts, or form fields. Loads one profile-owned file, verifies its expected hash, and extracts structured JSON according to the supplied instructions and schema. Returns source file metadata, parsed JSON data, evidence summary, method used, and warnings. Keep the schema specific to the current workflow and include only fields needed for the next step. Use file_describe instead for summaries or open-ended visual questions.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `analyzedAt` (string), `data` (object), `evidence` (string), `methodUsed` ("embedded_text" | "utf8_text" | "vision" | "hybrid_text_and_vision"), `provider` ("file-analysis"), `sourceFile` (object), `warnings` (array)
- Inputs:
  - `expectedSha256` (required, string): Expected SHA-256 hex digest for stale-file protection.
  - `instructions` (required, string): Specific structured data extraction instructions.
  - `profileFileId` (required, string): Durable profile file id.
  - `schema` (required, object): JSON Schema-like object describing the exact structured data to return.
- Outputs:
  - `analyzedAt` (string): ISO timestamp when structured extraction ran.
  - `data` (object): Structured data extracted according to the requested schema.
  - `evidence` (string): Brief evidence summary supporting the extracted data without exposing raw internal refs.
  - `methodUsed` ("embedded_text" | "utf8_text" | "vision" | "hybrid_text_and_vision"): Extraction method used internally for this analysis result.
  - `provider` ("file-analysis"): Provider that produced this result.
  - `sourceFile` (object): Durable profile file metadata for the analyzed source.
  - `sourceFile.byteSize` (union): Stored file size in bytes, or null when unavailable.
  - `sourceFile.createdAt` (string): ISO timestamp when the profile file was saved.
  - `sourceFile.filename` (string): Original or stored filename for the analyzed profile file.
  - `sourceFile.mimeType` (union): Stored MIME type, or null when unavailable.
  - `sourceFile.profileFileId` (string): Durable profile file id.
  - `sourceFile.sha256` (union): Stored SHA-256 hex digest, or null when unavailable.
  - `warnings` (array): Non-fatal extraction warnings.
  - `warnings[].code` (string): Stable warning code.
  - `warnings[].message` (string): Human-readable warning message.

Example input:
```json
{
  "expectedSha256": "expectedSha256_example",
  "instructions": "instructions_example",
  "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
  "schema": {}
}
```

Example output:
```json
{
  "analyzedAt": "analyzedAt_example",
  "data": null,
  "evidence": "evidence_example",
  "methodUsed": "embedded_text",
  "provider": "file-analysis",
  "sourceFile": {
    "byteSize": 1,
    "createdAt": "createdAt_example",
    "filename": "filename_example",
    "mimeType": "mimeType_example",
    "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
    "sha256": "sha256_example"
  },
  "warnings": [
    {
      "code": "code_example",
      "message": "message_example"
    }
  ]
}
```

### `file_extract_text`

Use this when a saved profile file needs deterministic readable text, especially PDFs or text-like files. Loads one profile-owned file, verifies its expected hash, and extracts bounded embedded or UTF-8 text without LLM vision. Returns source file metadata, extracted text, method used, and warnings. Do not use this when for images, screenshots, scanned/image-only PDFs, or visual/layout questions; use file_describe or file_extract_data. Provider files must first be saved as profile files by the owning provider tool. Pass the exact profileFileId and sha256 returned by the tool that created or saved the profile file.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `content` (object), `extractedAt` (string), `methodUsed` ("embedded_text" | "utf8_text" | "vision" | "hybrid_text_and_vision"), `provider` ("file-analysis"), `sourceFile` (object), `warnings` (array)
- Inputs:
  - `expectedSha256` (required, string): Expected SHA-256 hex digest for stale-file protection.
  - `profileFileId` (required, string): Durable profile file id.
- Outputs:
  - `content` (object): Extracted text payload.
  - `content.charCount` (integer): Character count of the returned text.
  - `content.text` (string): Extracted text content.
  - `content.truncated` (boolean): Whether returned text was truncated to the tool limit.
  - `extractedAt` (string): ISO timestamp when text extraction ran.
  - `methodUsed` ("embedded_text" | "utf8_text" | "vision" | "hybrid_text_and_vision"): Extraction method used internally for this analysis result.
  - `provider` ("file-analysis"): Provider that produced this result.
  - `sourceFile` (object): Durable profile file metadata for the analyzed source.
  - `sourceFile.byteSize` (union): Stored file size in bytes, or null when unavailable.
  - `sourceFile.createdAt` (string): ISO timestamp when the profile file was saved.
  - `sourceFile.filename` (string): Original or stored filename for the analyzed profile file.
  - `sourceFile.mimeType` (union): Stored MIME type, or null when unavailable.
  - `sourceFile.profileFileId` (string): Durable profile file id.
  - `sourceFile.sha256` (union): Stored SHA-256 hex digest, or null when unavailable.
  - `warnings` (array): Non-fatal extraction warnings.
  - `warnings[].code` (string): Stable warning code.
  - `warnings[].message` (string): Human-readable warning message.

Example input:
```json
{
  "expectedSha256": "expectedSha256_example",
  "profileFileId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Example output:
```json
{
  "content": {
    "charCount": 1,
    "text": "text_example",
    "truncated": true
  },
  "extractedAt": "extractedAt_example",
  "methodUsed": "embedded_text",
  "provider": "file-analysis",
  "sourceFile": {
    "byteSize": 1,
    "createdAt": "createdAt_example",
    "filename": "filename_example",
    "mimeType": "mimeType_example",
    "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
    "sha256": "sha256_example"
  },
  "warnings": [
    {
      "code": "code_example",
      "message": "message_example"
    }
  ]
}
```

### `gmail_accounts_list`

Use this when the agent needs configured Gmail mailbox choices for this profile. Lists enabled Gmail capability instances, including labels and connection health, without calling the provider. Returns mailbox account metadata for choosing connectedAccountId. Use this before mailbox reads or writes when multiple mailboxes may exist.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accounts` (array)
- Inputs:
  - None
- Outputs:
  - `accounts` (array): Provider accounts available for this capability.
  - `accounts[].accountEmail` (union): Email address associated with the provider account when known. Example: `"client@example.com"`.
  - `accounts[].connected` (boolean): Whether credentials currently exist for this account.
  - `accounts[].connectedAccountId` (string): Connected provider account id to pass when selecting this account. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `accounts[].credentialStatus` (union): Credential readiness or blocker status reported by the backend.
  - `accounts[].label` (union): Human-readable account label, preferring provider identity such as email when known.
  - `accounts[].provider` (string): Provider slug for this connected account.
  - `accounts[].ready` (boolean): Whether the account is ready for provider tool calls.

Example input:
```json
{}
```

Example output:
```json
{
  "accounts": [
    {
      "accountEmail": "client@example.com",
      "connected": true,
      "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
      "credentialStatus": "credentialStatus_example",
      "label": "label_example",
      "provider": "provider_example",
      "ready": true
    }
  ]
}
```

### `gmail_attachment_save`

Use this when a Gmail attachment must be reused, delivered later, or passed to another tool. Downloads one Gmail attachment and stores it as a bounded profile artifact for later delivery or provider/tool handoff. Returns saved artifact metadata and safe failure details. Use gmail_accounts_list to pick connectedAccountId when multiple mailboxes are enabled. External write: creates an internal durable profile artifact from Gmail attachment bytes but does not send the file by itself. Before calling, the source message id and attachment id must identify the intended attachment.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `accountEmail` (union), `byteSize` (integer), `filename` (string), `mimeType` (string), `profileFileId` (string), `provider` (string), `sha256` (string)
- Inputs:
  - `attachmentId` (required, string): Provider attachment id.
  - `connectedAccountId` (optional, string): Connected provider account id from gmail_accounts_list when multiple Gmail mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `filename` (optional, string): Stored artifact filename.
  - `messageId` (required, string): Provider message id containing the attachment.
- Outputs:
  - `accountEmail` (union): Provider account email used to fetch or create the artifact, when known. Example: `"client@example.com"`.
  - `byteSize` (integer): Profile file size in bytes. Example: `24576`.
  - `filename` (string): Stored profile-file filename including extension. Example: `"signed-agreement.pdf"`.
  - `mimeType` (string): MIME type of the saved artifact. Example: `"application/pdf"`.
  - `profileFileId` (string): Durable profile file id for the saved file. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `provider` (string): Provider that produced the saved profile file.
  - `sha256` (string): SHA-256 hex digest for stale-file protection. Example: `"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`.

Example input:
```json
{
  "attachmentId": "attachmentId_example",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "filename_example",
  "messageId": "messageId_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "byteSize": 24576,
  "filename": "signed-agreement.pdf",
  "mimeType": "application/pdf",
  "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "provider_example",
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

### `gmail_message_delete`

Use this when the user wants to delete or trash a Gmail message. Deletes or trashes one Gmail message using provider-specific deletion semantics. Returns the write lifecycle status and safe failure details. External write: may remove a mailbox message or create an approval-governed Gmail action. Before calling, the exact message must be confirmed because this is a destructive mailbox write.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from gmail_accounts_list when multiple Gmail mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `messageId` (required, string): Provider message id to delete or move to trash (provider-specific).
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "messageId": "messageId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `gmail_message_forward`

Use this when the user wants to send a lightweight snippet preview of an existing Gmail message to new recipients. Sends a new plain-text Gmail message with an optional comment, a forwarded-message marker, and only the source message snippet; it does not preserve the full body or original subject. Returns the write lifecycle status and safe failure details. Do not use this when replying to the existing thread; use gmail_message_reply instead. Do not use when recipients need the full original message body or attachments; these Gmail tools can send only a snippet preview, a composed summary, and saved attachments, not a native full-body forward. Use [] for cc and bcc when none are needed. Forward attachments are not supported. The outbound subject is synthetic and based on the source message id. External write: may send a Gmail snippet-preview message or create an approval-governed Gmail action. Before calling, the source message, recipients, and optional comment intent must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `additionalComment` (optional, string): Optional short comment to prepend.
  - `bcc` (required, array): BCC recipients for the forwarded email.
  - `cc` (required, array): CC recipients for the forwarded email.
  - `connectedAccountId` (optional, string): Connected provider account id from gmail_accounts_list when multiple Gmail mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `forwardMessageId` (required, string): Provider message id to forward.
  - `to` (required, array): Primary recipients for the forwarded email.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "additionalComment": "additionalComment_example",
  "bcc": [],
  "cc": [],
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "forwardMessageId": "forwardMessageId_example",
  "to": [
    "to_example"
  ]
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `gmail_message_get`

Use this when exact Gmail content, thread metadata, or attachment ids are needed. Reads one mailbox message by provider message id. Returns message content, message metadata, thread metadata, and attachment metadata. Use after gmail_messages_search when the message id is not already known. Use this before saving, forwarding, describing, or denying attachments unless the search result has attachmentMetadataIncluded=true. The returned bodyText can be truncated; check bodyTruncated before claiming you saw the complete body or before using bodyText as complete outbound content. Auth expiry, quota, setup, and provider-limit failures are returned structurally; do not treat them as missing messages.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `message` (object), `provider` ("gmail")
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from gmail_accounts_list when multiple Gmail mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `messageId` (required, string): Provider message id.
- Outputs:
  - `accountEmail` (union): Email account used for this result. Example: `"client@example.com"`.
  - `message` (object): Requested email message.
  - `message.attachments` (array): Attachments on this message.
  - `message.attachments[].byteSize` (union): Attachment size in bytes.
  - `message.attachments[].filename` (union): Attachment filename.
  - `message.attachments[].id` (string): Provider attachment id.
  - `message.attachments[].mimeType` (union): Attachment MIME type. Example: `"application/pdf"`.
  - `message.bcc` (array): BCC recipient mailbox identities.
  - `message.bcc[].email` (string): Email address. Example: `"client@example.com"`.
  - `message.bcc[].name` (union): Display name for this email address.
  - `message.bodyText` (union): Plain text email body, when available.
  - `message.bodyTruncated` (boolean): Whether bodyText was truncated and may not contain the full email body.
  - `message.canReply` (boolean): Whether this message can be used as a reply target.
  - `message.cc` (array): CC recipient mailbox identities.
  - `message.cc[].email` (string): Email address. Example: `"client@example.com"`.
  - `message.cc[].name` (union): Display name for this email address.
  - `message.from` (union): Sender mailbox identity, when available.
  - `message.from.email` (string): Email address. Example: `"client@example.com"`.
  - `message.from.name` (union): Display name for this email address.
  - `message.id` (string): Provider message id.
  - `message.labels` (array): Provider labels or folder markers.
  - `message.provider` ("gmail"): Email provider backing this message.
  - `message.receivedAt` (union): Timestamp when the email was received, when available. Convert offset/Z timestamps before telling the client a local date or time. Example: `"2026-05-21T14:30:00.000Z"`.
  - `message.receivedAtProfileLocal` (union): Received timestamp formatted in the profile timezone for client-facing summaries. Prefer this over the UTC receivedAt value when telling the client a local date or time.
  - `message.sentAt` (union): Timestamp when the email was sent, when available. Convert offset/Z timestamps before telling the client a local date or time. Example: `"2026-05-21T14:30:00.000Z"`.
  - `message.sentAtProfileLocal` (union): Sent timestamp formatted in the profile timezone for client-facing summaries. Prefer this over the UTC sentAt value when telling the client a local date or time.
  - `message.snippet` (union): Provider-supplied message preview text.
  - `message.subject` (union): Email subject.
  - `message.threadId` (union): Provider thread id, when available.
  - `message.to` (array): Primary recipient mailbox identities.
  - `message.to[].email` (string): Email address. Example: `"client@example.com"`.
  - `message.to[].name` (union): Display name for this email address.
  - `provider` ("gmail"): Email provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "messageId": "messageId_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "message": {
    "attachments": [
      {
        "byteSize": 1,
        "filename": "filename_example",
        "id": "id_example",
        "mimeType": "application/pdf"
      }
    ],
    "bcc": [
      {
        "email": "client@example.com",
        "name": "name_example"
      }
    ],
    "bodyText": "bodyText_example",
    "bodyTruncated": true,
    "canReply": true,
    "cc": [
      {
        "email": "client@example.com",
        "name": "name_example"
      }
    ],
    "from": {
      "email": "client@example.com",
      "name": "name_example"
    },
    "id": "id_example",
    "labels": [
      "labels_example"
    ],
    "provider": "gmail",
    "receivedAt": "2026-05-21T14:30:00.000Z",
    "receivedAtProfileLocal": "receivedAtProfileLocal_example",
    "sentAt": "2026-05-21T14:30:00.000Z",
    "sentAtProfileLocal": "sentAtProfileLocal_example",
    "snippet": "snippet_example",
    "subject": "subject_example",
    "threadId": "threadId_example",
    "to": [
      {
        "email": "client@example.com",
        "name": "name_example"
      }
    ]
  },
  "provider": "gmail"
}
```

### `gmail_message_mark_read`

Use this when the user wants to mark a Gmail message read or unread. Changes the read state for one provider mailbox message. Returns the write lifecycle status and safe failure details. Use isRead=true for read and isRead=false for unread. External write: may update mailbox message state or create an approval-governed Gmail action. Before calling, the exact message and desired read state must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from gmail_accounts_list when multiple Gmail mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `isRead` (required, boolean): true marks the message read; false marks it unread.
  - `messageId` (required, string): Provider message id.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "isRead": true,
  "messageId": "messageId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `gmail_message_move`

Use this when the user wants to move a Gmail message to another label. Moves one Gmail message using Gmail label semantics. Returns the write lifecycle status and safe failure details. Use a known Gmail label id from prior mailbox context or client guidance. External write: may move a mailbox message or create an approval-governed Gmail action. Before calling, the exact message and destination Gmail label id must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from gmail_accounts_list when multiple Gmail mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `destinationMailboxId` (required, string): Destination Gmail label id.
  - `messageId` (required, string): Provider message id.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "destinationMailboxId": "destinationMailboxId_example",
  "messageId": "messageId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `gmail_message_reply`

Use this when the user wants to reply to an existing Gmail message. Submits a reply through provider reply semantics for the existing message thread. Returns the write lifecycle status and safe failure details. Do not use this when sending a new standalone Gmail message; use gmail_message_send instead. Use [] for cc and bcc when no copied recipients are needed. Omit explicit recipients for Gmail-normal reply targeting, or provide to/cc/bcc when the reply recipients must be overridden. Reply attachments are not supported. External write: may send a Gmail reply or create an approval-governed Gmail action. Before calling, the source message and reply body must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `bcc` (required, array): BCC recipients for the reply.
  - `bodyText` (required, string): Plain text reply body.
  - `cc` (required, array): CC recipients for the reply.
  - `connectedAccountId` (optional, string): Connected provider account id from gmail_accounts_list when multiple Gmail mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `replyToMessageId` (required, string): Provider message id to reply to.
  - `to` (optional, array): Explicit reply recipients; omit for Gmail-normal reply targeting.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "bcc": [],
  "bodyText": "bodyText_example",
  "cc": [],
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "replyToMessageId": "replyToMessageId_example",
  "to": [
    "to_example"
  ]
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `gmail_message_send`

Use this when the user wants to send a new outbound Gmail message. Submits a new Gmail message through the connected Gmail provider with idempotency plus profileFileIds ownership and expectedProfileFileSha256ById checks for optional attachments. Returns the write lifecycle status and safe failure details. Do not use this when replying to or forwarding an existing message; use gmail_message_reply or gmail_message_forward instead. Use [] for cc, bcc, and profileFileIds when none are needed; use {} for expectedProfileFileSha256ById when there are no attachments. Use threadId only for a new standalone message that should be placed in an existing Gmail thread; use gmail_message_reply for normal replies. External write: may send a Gmail message or create an approval-governed Gmail action. Before calling, to, subject, bodyText, and attachment intent must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `bcc` (required, array): BCC recipients for the outbound email.
  - `bodyText` (required, string): Plain text email body.
  - `cc` (required, array): CC recipients for the outbound email.
  - `connectedAccountId` (optional, string): Connected provider account id from gmail_accounts_list when multiple Gmail mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `expectedProfileFileSha256ById` (required, object): Optional stale-file protection map keyed by profile file id; keys must also appear in profileFileIds.
  - `profileFileIds` (required, array): Profile files to attach to the outbound email.
  - `subject` (required, string): Email subject.
  - `threadId` (optional, string): Optional Gmail thread id when sending into a thread.
  - `to` (required, array): Primary recipients for the outbound email.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "bcc": [],
  "bodyText": "bodyText_example",
  "cc": [],
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "expectedProfileFileSha256ById": {},
  "profileFileIds": [],
  "subject": "subject_example",
  "threadId": "threadId_example",
  "to": [
    "to_example"
  ]
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `gmail_messages_search`

Use this when the user needs mailbox messages found or listed from the connected provider. Searches or lists Gmail messages using Gmail search syntax and pagination; by default this uses lightweight summary hydration. Returns message summaries, whether attachment metadata was fully loaded, and pagination details. When the user explicitly asks for a Gmail or mailbox search, stay within Gmail tools unless the user asks to broaden the search or a Gmail result points to an attachment/file workflow. Omit query to list recent mailbox messages; default search scope excludes spam and trash. To include spam or trash, broaden explicitly with Gmail query operators such as in:anywhere, in:spam, or in:trash. Use query for Gmail search and messagesPageCursor for additional pages. messagesPageCursor should be the previous gmail_messages_search result's nextCursor. limit is an alias for maxResults; if both are supplied, they must match. Do not pass an `in` field; mailbox scopes such as in:sent, in:anywhere, in:spam, and in:trash belong inside query. Do not pass `after`, `before`, `fromDate`, `toDate`, or other date fields; date constraints belong inside query using Gmail operators such as after:2026/5/1 before:2026/6/1 or newer_than:30d. Auth expiry, quota, setup, and provider-limit failures are returned structurally; do not treat them as empty result sets. Default search summaries do not authoritatively prove whether attachments exist; call with includeAttachmentMetadata=true for focused attachment-aware searches, or call gmail_message_get on selected messages before saying a message has no attachments. When the user asks for unread or pending mail from CRM contacts, first get the CRM contact email addresses from the CRM provider, then search Gmail with exact from:/to:/thread queries for those addresses. A generic is:unread inbox search is not enough to claim CRM-contact mailbox coverage. Do not treat a sender as a CRM contact merely because they appear in Gmail, signatures, files, or another provider; CRM-contact scope requires CRM evidence such as a matching contact row, email column, or selected CRM record. For broad receipt, invoice, or accounting searches, search every relevant connectedAccountId, use date and keyword query variants, follow messagesPageCursor until exhausted, and inspect likely hits with gmail_message_get before claiming completeness. A found inbound message does not prove no one replied. Before saying no reply or follow-up was sent, search sent mail by exact recipient/sender email address or inspect the thread; an empty display-name-only sent search is insufficient. For deal/client follow-up status checks, use the CRM contact email when available, for example `in:sent to:client@example.com`, or inspect the known Gmail thread before making a negative follow-up claim. If you only searched a display name, say the follow-up is not verified instead of saying no reply was sent.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `attachmentMetadataIncluded` (boolean), `messages` (array), `nextCursor` (union), `provider` ("gmail")
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from gmail_accounts_list when multiple Gmail mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `includeAttachmentMetadata` (optional, boolean): When true, hydrates returned messages with full Gmail metadata so the attachments array is authoritative. Leave false for normal lightweight searches, then call gmail_message_get on selected messages before acting on attachments.
  - `limit` (optional, integer): Alias for maxResults when the agent naturally thinks in result limits.
  - `maxResults` (optional, integer): Maximum messages to return. Defaults to 25.
  - `messagesPageCursor` (optional, string): Gmail page token from a previous gmail_messages_search result.
  - `query` (optional, string): Gmail `q` search syntax. Default scope excludes spam and trash; for exhaustive archive/trash coverage, broaden with Gmail operators such as in:anywhere, in:spam, or in:trash.
- Outputs:
  - `accountEmail` (union): Email account used for this result. Example: `"client@example.com"`.
  - `attachmentMetadataIncluded` (boolean): Whether each search result was fully hydrated so its attachments array is authoritative.
  - `messages` (array): Messages matching the search.
  - `messages[].attachments` (array): Attachment metadata for this search item. This is authoritative only when gmail_messages_search was called with includeAttachmentMetadata=true; otherwise an empty array can mean attachment metadata was not loaded.
  - `messages[].attachments[].byteSize` (union): Attachment size in bytes.
  - `messages[].attachments[].filename` (union): Attachment filename.
  - `messages[].attachments[].id` (string): Provider attachment id.
  - `messages[].attachments[].mimeType` (union): Attachment MIME type. Example: `"application/pdf"`.
  - `messages[].canReply` (boolean): Whether this message can be used as a reply target.
  - `messages[].from` (union): Sender mailbox identity, when available.
  - `messages[].from.email` (string): Email address. Example: `"client@example.com"`.
  - `messages[].from.name` (union): Display name for this email address.
  - `messages[].id` (string): Provider message id.
  - `messages[].provider` ("gmail"): Email provider backing this message.
  - `messages[].receivedAt` (union): Timestamp when the email was received, when available. Convert offset/Z timestamps before telling the client a local date or time. Example: `"2026-05-21T14:30:00.000Z"`.
  - `messages[].receivedAtProfileLocal` (union): Received timestamp formatted in the profile timezone for client-facing summaries. Prefer this over the UTC receivedAt value when telling the client a local date or time.
  - `messages[].snippet` (union): Provider-supplied message preview text.
  - `messages[].subject` (union): Email subject.
  - `messages[].threadId` (union): Provider thread id, when available.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("gmail"): Email provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "includeAttachmentMetadata": true,
  "limit": 1,
  "maxResults": 1,
  "messagesPageCursor": "messagesPageCursor_example",
  "query": "query_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "attachmentMetadataIncluded": true,
  "messages": [
    {
      "attachments": [
        {
          "byteSize": 1,
          "filename": "filename_example",
          "id": "id_example",
          "mimeType": "application/pdf"
        }
      ],
      "canReply": true,
      "from": {
        "email": "client@example.com",
        "name": "name_example"
      },
      "id": "id_example",
      "provider": "gmail",
      "receivedAt": "2026-05-21T14:30:00.000Z",
      "receivedAtProfileLocal": "receivedAtProfileLocal_example",
      "snippet": "snippet_example",
      "subject": "subject_example",
      "threadId": "threadId_example"
    }
  ],
  "nextCursor": "nextCursor_example",
  "provider": "gmail"
}
```

### `google_calendar_accounts_list`

Use this when the agent needs configured Google Calendar account choices for this profile. Lists enabled Google Calendar capability instances, including labels, provider, and connection health, without calling the provider. Returns calendar account metadata for choosing connectedAccountId. Use this before calendar reads or writes when multiple calendar accounts may exist.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accounts` (array)
- Inputs:
  - None
- Outputs:
  - `accounts` (array): Provider accounts available for this capability.
  - `accounts[].accountEmail` (union): Email address associated with the provider account when known. Example: `"client@example.com"`.
  - `accounts[].connected` (boolean): Whether credentials currently exist for this account.
  - `accounts[].connectedAccountId` (string): Connected provider account id to pass when selecting this account. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `accounts[].credentialStatus` (union): Credential readiness or blocker status reported by the backend.
  - `accounts[].label` (union): Human-readable account label, preferring provider identity such as email when known.
  - `accounts[].provider` (string): Provider slug for this connected account.
  - `accounts[].ready` (boolean): Whether the account is ready for provider tool calls.

Example input:
```json
{}
```

Example output:
```json
{
  "accounts": [
    {
      "accountEmail": "client@example.com",
      "connected": true,
      "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
      "credentialStatus": "credentialStatus_example",
      "label": "label_example",
      "provider": "provider_example",
      "ready": true
    }
  ]
}
```

### `google_calendar_calendars_list`

Use this when the target provider calendar id is unknown. Lists calendars from the connected Google Calendar account. Returns calendar ids, names, and provider calendar metadata. Use before event reads or writes when the target calendar id must be chosen. Pass connectedAccountId from google_calendar_accounts_list when multiple calendar accounts may exist.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `calendars` (array), `nextCursor` (union), `provider` ("google-calendar")
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_calendar_accounts_list when multiple Google calendars match. Do not use profile_context_get capability instance ids for this field.
  - `maxResults` (required, integer): Maximum calendars to return.
  - `nextPageToken` (optional, string): Provider pagination token from a prior google_calendar_calendars_list result.
- Outputs:
  - `accountEmail` (union): Calendar account email used for this result. Example: `"client@example.com"`.
  - `calendars` (array): Calendars returned by the provider.
  - `calendars[].description` (union): Calendar description.
  - `calendars[].id` (string): Provider calendar id.
  - `calendars[].name` (union): Calendar display name.
  - `calendars[].primary` (boolean): Whether this is the account's primary calendar.
  - `calendars[].timezone` (union): Calendar IANA timezone when provided by the provider. Example: `"America/Toronto"`.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("google-calendar"): Calendar provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "maxResults": 100,
  "nextPageToken": "nextPageToken_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "calendars": [
    {
      "description": "description_example",
      "id": "id_example",
      "name": "name_example",
      "primary": true,
      "timezone": "America/Toronto"
    }
  ],
  "nextCursor": "nextCursor_example",
  "provider": "google-calendar"
}
```

### `google_calendar_event_cancel`

Use this when the user wants to cancel or delete a calendar event. Cancels or deletes one calendar event using provider attendee notification semantics. Returns the write lifecycle status and safe failure details. sendUpdates controls whether attendees receive cancellation notices when supported, but visible replies should describe notification behavior in plain language instead of naming sendUpdates. External write: may remove or cancel a provider calendar event, notify attendees, or create an approval-governed calendar action. Before calling, the exact event and attendee notification intent must be clear because this is destructive.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `calendarId` (required, string): Provider calendar id, or primary for the account's default calendar.
  - `cancellationMessage` (optional, string): Optional cancellation message sent through the provider when supported.
  - `connectedAccountId` (optional, string): Connected provider account id from google_calendar_accounts_list when multiple Google calendars match. Do not use profile_context_get capability instance ids for this field.
  - `eventId` (required, string): Provider event id.
  - `sendUpdates` (required, "all" | "external_only" | "none"): Provider attendee notification mode for create, update, or cancel.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "calendarId": "calendarId_example",
  "cancellationMessage": "cancellationMessage_example",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "eventId": "eventId_example",
  "sendUpdates": "all"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `google_calendar_event_create`

Use this when the user wants to create a calendar event. Creates an event on a connected provider calendar, including attendees, location, description, and conferencing when supplied. Returns the write lifecycle status and safe failure details. External write: may create a provider calendar event, email attendees depending on sendUpdates, request provider conferencing, or create an approval-governed calendar action. Before calling, calendar, title, time range, attendees, notification intent, and conferencing intent must be clear. sendUpdates is an internal API option; in visible replies, describe notification behavior in plain language instead of naming sendUpdates.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `attendees` (required, array): Attendees to invite.
  - `attendees[].displayName` (optional, string): Optional attendee display name.
  - `attendees[].email` (required, string): Attendee email address.
  - `calendarId` (required, string): Provider calendar id, or primary for the account's default calendar.
  - `conferencePreference` (required, "provider_default" | "none"): Whether to request the provider's default conferencing link or no conference link.
  - `connectedAccountId` (optional, string): Connected provider account id from google_calendar_accounts_list when multiple Google calendars match. Do not use profile_context_get capability instance ids for this field.
  - `description` (optional, string): Optional event body/description.
  - `end` (required, object): Calendar event instant with explicit date-time and IANA time zone.
  - `end.dateTime` (required, string): ISO 8601 date-time with offset.
  - `end.timeZone` (required, string): IANA time zone, e.g. America/Toronto.
  - `location` (optional, string): Optional event location.
  - `sendUpdates` (required, "all" | "external_only" | "none"): Provider attendee notification mode for create, update, or cancel.
  - `start` (required, object): Calendar event instant with explicit date-time and IANA time zone.
  - `start.dateTime` (required, string): ISO 8601 date-time with offset.
  - `start.timeZone` (required, string): IANA time zone, e.g. America/Toronto.
  - `title` (required, string): Event title.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "attendees": [],
  "calendarId": "primary",
  "conferencePreference": "provider_default",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "description": "description_example",
  "end": {
    "dateTime": "2026-05-21T14:30:00.000Z",
    "timeZone": "timeZone_example"
  },
  "location": "location_example",
  "sendUpdates": "all",
  "start": {
    "dateTime": "2026-05-21T14:30:00.000Z",
    "timeZone": "timeZone_example"
  },
  "title": "title_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `google_calendar_event_get`

Use this when exact calendar event details are needed. Gets one calendar event by provider event id from a specific calendar. Returns event details, timing, attendees, conferencing, and provider metadata. Use after google_calendar_events_list or google_calendar_events_search when you have an event id but need full event details not present in summaries.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `calendarId` (string), `event` (object), `eventId` (string), `provider` ("google-calendar")
- Inputs:
  - `calendarId` (required, string): Provider calendar id, or primary for the account's default calendar.
  - `connectedAccountId` (optional, string): Connected provider account id from google_calendar_accounts_list when multiple Google calendars match. Do not use profile_context_get capability instance ids for this field.
  - `eventId` (required, string): Provider event id.
  - `timeZone` (optional, string): Optional timezone for returned event times.
- Outputs:
  - `accountEmail` (union): Calendar account email used for this result. Example: `"client@example.com"`.
  - `calendarId` (string): Calendar id containing the event.
  - `event` (object): Requested calendar event.
  - `event.allDay` (boolean): Whether this is an all-day event.
  - `event.attendees` (array): Event attendees.
  - `event.attendees[].email` (string): Attendee email address. Example: `"client@example.com"`.
  - `event.attendees[].name` (union): Attendee display name.
  - `event.attendees[].responseStatus` (union): Provider attendee response status, when known.
  - `event.calendarId` (string): Provider calendar id containing the event.
  - `event.description` (union): Event body or description.
  - `event.end` (union): Event end timestamp, or null when unavailable. Example: `"2026-05-21T15:00:00.000Z"`.
  - `event.id` (string): Provider event id.
  - `event.location` (union): Event location.
  - `event.meetingUrl` (union): Online meeting URL, when the event has one. Example: `"https://meet.google.com/abc-defg-hij"`.
  - `event.organizer` (union): Event organizer, when known.
  - `event.organizer.email` (string): Attendee email address. Example: `"client@example.com"`.
  - `event.organizer.name` (union): Attendee display name.
  - `event.organizer.responseStatus` (union): Provider attendee response status, when known.
  - `event.start` (union): Event start timestamp, or null when unavailable. Example: `"2026-05-21T14:30:00.000Z"`.
  - `event.status` (union): Provider event status.
  - `event.title` (union): Event title.
  - `eventId` (string): Provider event id requested.
  - `provider` ("google-calendar"): Calendar provider backing this result.

Example input:
```json
{
  "calendarId": "primary",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "eventId": "eventId_example",
  "timeZone": "timeZone_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "calendarId": "calendarId_example",
  "event": {
    "allDay": true,
    "attendees": [
      {
        "email": "client@example.com",
        "name": "name_example",
        "responseStatus": "responseStatus_example"
      }
    ],
    "calendarId": "calendarId_example",
    "description": "description_example",
    "end": "2026-05-21T15:00:00.000Z",
    "id": "id_example",
    "location": "location_example",
    "meetingUrl": "https://meet.google.com/abc-defg-hij",
    "organizer": {
      "email": "client@example.com",
      "name": "name_example",
      "responseStatus": "responseStatus_example"
    },
    "start": "2026-05-21T14:30:00.000Z",
    "status": "status_example",
    "title": "title_example"
  },
  "eventId": "eventId_example",
  "provider": "google-calendar"
}
```

### `google_calendar_event_update`

Use this when the user wants to update an existing calendar event. Updates one provider calendar event with the supplied changed fields; sendUpdates only controls attendee notifications. Returns the write lifecycle status and safe failure details. When attendees is supplied, it replaces the entire attendee list; omit it to leave attendees unchanged. conferencePreference is an actual updatable field when conferencing behavior must change. External write: may modify a provider calendar event, email attendees depending on sendUpdates, or create an approval-governed calendar action. Before calling, the exact calendar event and at least one actual field change must be clear; sendUpdates alone is not a valid update. sendUpdates is an internal API option; in visible replies, describe notification behavior in plain language instead of naming sendUpdates.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `attendees` (optional, array): Replacement attendee list; omit to leave attendees unchanged.
  - `attendees[].displayName` (optional, string): Optional attendee display name.
  - `attendees[].email` (required, string): Attendee email address.
  - `calendarId` (required, string): Provider calendar id, or primary for the account's default calendar.
  - `conferencePreference` (optional, "provider_default" | "none"): Whether to request the provider's default conferencing link or no conference link.
  - `connectedAccountId` (optional, string): Connected provider account id from google_calendar_accounts_list when multiple Google calendars match. Do not use profile_context_get capability instance ids for this field.
  - `description` (optional, string): New event body/description; omit to leave unchanged.
  - `end` (optional, object): Calendar event instant with explicit date-time and IANA time zone.
  - `end.dateTime` (required, string): ISO 8601 date-time with offset.
  - `end.timeZone` (required, string): IANA time zone, e.g. America/Toronto.
  - `eventId` (required, string): Provider event id.
  - `location` (optional, string): New event location; omit to leave unchanged.
  - `sendUpdates` (required, "all" | "external_only" | "none"): Provider attendee notification mode for create, update, or cancel.
  - `start` (optional, object): Calendar event instant with explicit date-time and IANA time zone.
  - `start.dateTime` (required, string): ISO 8601 date-time with offset.
  - `start.timeZone` (required, string): IANA time zone, e.g. America/Toronto.
  - `title` (optional, string): Event title.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "attendees": [
    {
      "displayName": "displayName_example",
      "email": "email_example"
    }
  ],
  "calendarId": "calendarId_example",
  "conferencePreference": "provider_default",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "description": "description_example",
  "end": {
    "dateTime": "2026-05-21T14:30:00.000Z",
    "timeZone": "timeZone_example"
  },
  "eventId": "eventId_example",
  "location": "location_example",
  "sendUpdates": "all",
  "start": {
    "dateTime": "2026-05-21T14:30:00.000Z",
    "timeZone": "timeZone_example"
  },
  "title": "title_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `google_calendar_events_list`

Use this when the user needs Google Calendar schedule review or time-window event discovery. Lists events in a bounded time window from one Google calendar. Returns calendar event summaries and pagination details. calendarId is required on every call; omit it only when the default primary calendar is intended (schema default). Use calendarId primary for the user's default calendar when they did not name a specific calendar; call google_calendar_calendars_list when a non-default calendar id is needed. Pass an IANA timeZone with timeMin and timeMax so the provider interprets the event window correctly. When displaying returned event times to the user, convert UTC or offset timestamps to the requested/profile timezone before writing local clock times. Do not use google_calendar_events_search for plain today/tomorrow schedule review on Google; use google_calendar_events_list with a bounded time window instead.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `calendarId` (string), `events` (array), `nextCursor` (union), `provider` ("google-calendar")
- Inputs:
  - `calendarId` (required, string): Provider calendar id, or primary for the account's default calendar.
  - `connectedAccountId` (optional, string): Connected provider account id from google_calendar_accounts_list when multiple Google calendars match. Do not use profile_context_get capability instance ids for this field.
  - `maxResults` (required, integer): Maximum events to return.
  - `nextPageToken` (optional, string): Google Calendar page token from a prior google_calendar_events_list result.
  - `timeMax` (required, string): Exclusive ISO 8601 window end.
  - `timeMin` (required, string): Inclusive ISO 8601 window start.
  - `timeZone` (required, string): IANA time zone, e.g. America/Toronto.
- Outputs:
  - `accountEmail` (union): Calendar account email used for this result. Example: `"client@example.com"`.
  - `calendarId` (string): Calendar id searched or listed.
  - `events` (array): Calendar events returned.
  - `events[].allDay` (boolean): Whether this is an all-day event.
  - `events[].calendarId` (string): Provider calendar id containing the event.
  - `events[].end` (union): Event end timestamp, or null when unavailable. Example: `"2026-05-21T15:00:00.000Z"`.
  - `events[].id` (string): Provider event id.
  - `events[].location` (union): Event location.
  - `events[].meetingUrl` (union): Online meeting URL, when the event has one. Example: `"https://meet.google.com/abc-defg-hij"`.
  - `events[].organizer` (union): Event organizer, when known.
  - `events[].organizer.email` (string): Attendee email address. Example: `"client@example.com"`.
  - `events[].organizer.name` (union): Attendee display name.
  - `events[].organizer.responseStatus` (union): Provider attendee response status, when known.
  - `events[].start` (union): Event start timestamp, or null when unavailable. Example: `"2026-05-21T14:30:00.000Z"`.
  - `events[].status` (union): Provider event status.
  - `events[].title` (union): Event title.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("google-calendar"): Calendar provider backing this result.

Example input:
```json
{
  "calendarId": "primary",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "maxResults": 50,
  "nextPageToken": "nextPageToken_example",
  "timeMax": "2026-05-21T14:30:00.000Z",
  "timeMin": "2026-05-21T14:30:00.000Z",
  "timeZone": "timeZone_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "calendarId": "calendarId_example",
  "events": [
    {
      "allDay": true,
      "calendarId": "calendarId_example",
      "end": "2026-05-21T15:00:00.000Z",
      "id": "id_example",
      "location": "location_example",
      "meetingUrl": "https://meet.google.com/abc-defg-hij",
      "organizer": {
        "email": "client@example.com",
        "name": "name_example",
        "responseStatus": "responseStatus_example"
      },
      "start": "2026-05-21T14:30:00.000Z",
      "status": "status_example",
      "title": "title_example"
    }
  ],
  "nextCursor": "nextCursor_example",
  "provider": "google-calendar"
}
```

### `google_calendar_events_search`

Use this when Google Calendar text search is needed for event discovery. Searches Google Calendar events by text query. Returns matching event summaries and pagination details. Do not use this when the account is not Google Calendar, the user only needs a schedule window such as today or tomorrow, or google_calendar_events_list already covers the request. calendarId is required; use primary for the default calendar unless a specific calendar id is known. Requires a free-text query; for schedule review without text search, use google_calendar_events_list with timeMin and timeMax instead.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `calendarId` (string), `events` (array), `nextCursor` (union), `provider` ("google-calendar")
- Inputs:
  - `calendarId` (required, string): Provider calendar id, or primary for the account's default calendar.
  - `connectedAccountId` (optional, string): Connected provider account id from google_calendar_accounts_list when multiple Google calendars match. Do not use profile_context_get capability instance ids for this field.
  - `maxResults` (required, integer): Maximum events to return.
  - `nextPageToken` (optional, string): Pagination token from a prior google_calendar_events_search result.
  - `query` (required, string): Free-text search query.
  - `timeMax` (optional, string): Optional upper bound for event end time (RFC3339).
  - `timeMin` (optional, string): Optional lower bound for event start time (RFC3339).
- Outputs:
  - `accountEmail` (union): Calendar account email used for this result. Example: `"client@example.com"`.
  - `calendarId` (string): Calendar id searched or listed.
  - `events` (array): Calendar events returned.
  - `events[].allDay` (boolean): Whether this is an all-day event.
  - `events[].calendarId` (string): Provider calendar id containing the event.
  - `events[].end` (union): Event end timestamp, or null when unavailable. Example: `"2026-05-21T15:00:00.000Z"`.
  - `events[].id` (string): Provider event id.
  - `events[].location` (union): Event location.
  - `events[].meetingUrl` (union): Online meeting URL, when the event has one. Example: `"https://meet.google.com/abc-defg-hij"`.
  - `events[].organizer` (union): Event organizer, when known.
  - `events[].organizer.email` (string): Attendee email address. Example: `"client@example.com"`.
  - `events[].organizer.name` (union): Attendee display name.
  - `events[].organizer.responseStatus` (union): Provider attendee response status, when known.
  - `events[].start` (union): Event start timestamp, or null when unavailable. Example: `"2026-05-21T14:30:00.000Z"`.
  - `events[].status` (union): Provider event status.
  - `events[].title` (union): Event title.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("google-calendar"): Calendar provider backing this result.

Example input:
```json
{
  "calendarId": "primary",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "maxResults": 50,
  "nextPageToken": "nextPageToken_example",
  "query": "query_example",
  "timeMax": "2026-05-21T14:30:00.000Z",
  "timeMin": "2026-05-21T14:30:00.000Z"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "calendarId": "calendarId_example",
  "events": [
    {
      "allDay": true,
      "calendarId": "calendarId_example",
      "end": "2026-05-21T15:00:00.000Z",
      "id": "id_example",
      "location": "location_example",
      "meetingUrl": "https://meet.google.com/abc-defg-hij",
      "organizer": {
        "email": "client@example.com",
        "name": "name_example",
        "responseStatus": "responseStatus_example"
      },
      "start": "2026-05-21T14:30:00.000Z",
      "status": "status_example",
      "title": "title_example"
    }
  ],
  "nextCursor": "nextCursor_example",
  "provider": "google-calendar"
}
```

### `google_calendar_free_slots_find`

Use this when the user needs scheduling suggestions before proposing meeting times. Finds contiguous free slots meeting a minimum duration across selected calendars and a bounded time window. Returns candidate free time slots that satisfy the requested duration. Pass an IANA timeZone with timeMin and timeMax so slot calculation uses the intended timezone. Finding and proposing slots is read-only. If an attendee email is missing, still return/propose candidate times and ask for the email before event creation.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `calendarsChecked` (integer), `freeSlots` (array), `provider` ("google-calendar")
- Inputs:
  - `calendarIds` (required, array): Calendar ids to consider when finding free slots.
  - `connectedAccountId` (optional, string): Connected provider account id from google_calendar_accounts_list when multiple Google calendars match. Do not use profile_context_get capability instance ids for this field.
  - `durationMinutes` (required, integer): Minimum contiguous free duration to return, in minutes.
  - `timeMax` (required, string): Exclusive ISO 8601 window end.
  - `timeMin` (required, string): Inclusive ISO 8601 window start.
  - `timeZone` (required, string): IANA time zone, e.g. America/Toronto.
- Outputs:
  - `accountEmail` (union): Calendar account email used for this result. Example: `"client@example.com"`.
  - `calendarsChecked` (integer): Number of calendars checked for availability.
  - `freeSlots` (array): Available slots found.
  - `freeSlots[].durationMinutes` (integer): Free slot duration in minutes.
  - `freeSlots[].end` (string): Free slot end timestamp. Example: `"2026-05-21T15:00:00.000Z"`.
  - `freeSlots[].start` (string): Free slot start timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `provider` ("google-calendar"): Calendar provider backing this result.

Example input:
```json
{
  "calendarIds": [
    "calendarIds_example"
  ],
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "durationMinutes": 1,
  "timeMax": "2026-05-21T14:30:00.000Z",
  "timeMin": "2026-05-21T14:30:00.000Z",
  "timeZone": "timeZone_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "calendarsChecked": 1,
  "freeSlots": [
    {
      "durationMinutes": 1,
      "end": "2026-05-21T15:00:00.000Z",
      "start": "2026-05-21T14:30:00.000Z"
    }
  ],
  "provider": "google-calendar"
}
```

### `google_calendar_freebusy_query`

Use this when raw occupied intervals are needed before suggesting availability. Queries busy blocks across selected calendars for a bounded time window. Returns busy intervals with calendarId on each block. Pass an IANA timeZone with timeMin and timeMax so busy intervals are interpreted in the intended timezone.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `busy` (array), `calendarIds` (array), `provider` ("google-calendar"), `timeMax` (string), `timeMin` (string)
- Inputs:
  - `calendarIds` (required, array): Calendar ids to query for busy blocks.
  - `connectedAccountId` (optional, string): Connected provider account id from google_calendar_accounts_list when multiple Google calendars match. Do not use profile_context_get capability instance ids for this field.
  - `timeMax` (required, string): Exclusive ISO 8601 availability window end.
  - `timeMin` (required, string): Inclusive ISO 8601 availability window start.
  - `timeZone` (required, string): IANA time zone, e.g. America/Toronto.
- Outputs:
  - `accountEmail` (union): Calendar account email used for this result. Example: `"client@example.com"`.
  - `busy` (array): Busy blocks returned by the provider.
  - `busy[].calendarId` (string): Calendar id that has this busy block.
  - `busy[].end` (string): Busy block end timestamp. Example: `"2026-05-21T15:00:00.000Z"`.
  - `busy[].start` (string): Busy block start timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `calendarIds` (array): Calendar ids included in the query.
  - `provider` ("google-calendar"): Calendar provider backing this result.
  - `timeMax` (string): Exclusive availability window end.
  - `timeMin` (string): Inclusive availability window start.

Example input:
```json
{
  "calendarIds": [
    "calendarIds_example"
  ],
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "timeMax": "2026-05-21T14:30:00.000Z",
  "timeMin": "2026-05-21T14:30:00.000Z",
  "timeZone": "timeZone_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "busy": [
    {
      "calendarId": "calendarId_example",
      "end": "2026-05-21T15:00:00.000Z",
      "start": "2026-05-21T14:30:00.000Z"
    }
  ],
  "calendarIds": [
    "calendarIds_example"
  ],
  "provider": "google-calendar",
  "timeMax": "timeMax_example",
  "timeMin": "timeMin_example"
}
```

### `google_drive_accounts_list`

Use this when the agent needs configured Google Drive account choices for this profile. Lists enabled Google Drive capability instances, including labels and connection health, without calling the provider. Returns Drive account metadata for choosing connectedAccountId. Use this before Drive reads or writes when multiple Drive accounts may exist.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accounts` (array)
- Inputs:
  - None
- Outputs:
  - `accounts` (array): Provider accounts available for this capability.
  - `accounts[].accountEmail` (union): Email address associated with the provider account when known. Example: `"client@example.com"`.
  - `accounts[].connected` (boolean): Whether credentials currently exist for this account.
  - `accounts[].connectedAccountId` (string): Connected provider account id to pass when selecting this account. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `accounts[].credentialStatus` (union): Credential readiness or blocker status reported by the backend.
  - `accounts[].label` (union): Human-readable account label, preferring provider identity such as email when known.
  - `accounts[].provider` (string): Provider slug for this connected account.
  - `accounts[].ready` (boolean): Whether the account is ready for provider tool calls.

Example input:
```json
{}
```

Example output:
```json
{
  "accounts": [
    {
      "accountEmail": "client@example.com",
      "connected": true,
      "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
      "credentialStatus": "credentialStatus_example",
      "label": "label_example",
      "provider": "provider_example",
      "ready": true
    }
  ]
}
```

### `google_drive_file_copy`

Use this when the user wants to copy a Google Drive file. Copies one Drive file, optionally renaming the copy or placing it in a destination folder. Returns the write lifecycle status and safe failure details. External write: may create a Drive file copy or create an approval-governed Drive action. Before calling, the source file and optional destination/name must be clear. If multiple plausible destination folders match the client/deal, ask which one to use before copying.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `destinationFolderId` (optional, string): Folder id for the copy.
  - `fileId` (required, string): Source file id.
  - `name` (optional, string): Name for the copy.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "destinationFolderId": "destinationFolderId_example",
  "fileId": "fileId_example",
  "name": "name_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `google_drive_file_delete`

Use this when the user wants to permanently delete a Google Drive file. Permanently deletes one Drive file. Returns the write lifecycle status and safe failure details. Do not use this when the user wants reversible removal; use google_drive_file_trash instead. External write: may permanently delete a Drive file or create an approval-governed Drive action. Before calling, the exact file must be confirmed because this is destructive and not the same as trash.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `fileId` (required, string): File id to permanently delete.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "fileId": "fileId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `google_drive_file_get`

Use this when current metadata for one Google Drive file is needed before download or mutation. Fetches one Google Drive file's current metadata. Returns name, MIME type, parents, links, state, and other Drive file metadata.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `file` (object), `provider` ("google-drive")
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `fileId` (required, string): Google Drive file id.
- Outputs:
  - `accountEmail` (union): Google account email used for this result. Example: `"client@example.com"`.
  - `file` (object): Requested Drive file or folder.
  - `file.createdAt` (union): Provider creation timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `file.description` (union): Drive item description.
  - `file.driveId` (union): Shared drive id, when applicable.
  - `file.id` (string): Google Drive file or folder id.
  - `file.mimeType` (union): Drive item MIME type. Example: `"application/pdf"`.
  - `file.modifiedAt` (union): Provider last-modified timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `file.name` (union): Drive item display name.
  - `file.parents` (array): Parent folder ids for this item.
  - `file.sizeBytes` (union): File size in bytes, if known.
  - `file.starred` (boolean): Whether the file is starred.
  - `file.trashed` (boolean): Whether the item is in Google Drive trash.
  - `file.webUrl` (union): Browser URL for opening the Drive item. Example: `"https://drive.google.com/file/d/example/view"`.
  - `provider` ("google-drive"): Provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "fileId": "fileId_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "file": {
    "createdAt": "2026-05-21T14:30:00.000Z",
    "description": "description_example",
    "driveId": "driveId_example",
    "id": "id_example",
    "mimeType": "application/pdf",
    "modifiedAt": "2026-05-21T14:30:00.000Z",
    "name": "name_example",
    "parents": [
      "parents_example"
    ],
    "sizeBytes": 1,
    "starred": true,
    "trashed": true,
    "webUrl": "https://drive.google.com/file/d/example/view"
  },
  "provider": "google-drive"
}
```

### `google_drive_file_move`

Use this when the user wants to move a Google Drive file between parent folders. Moves one Drive file from its current parent folder to a destination parent folder. Returns the write lifecycle status and safe failure details. External write: may move a Drive file or create an approval-governed Drive action. Before calling, both current and destination parent folder ids must be clear to avoid moving the wrong file. If multiple plausible destination folders match the client/deal, ask which one to use before moving.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `fileId` (required, string): File id to move.
  - `fromFolderId` (required, string): Current parent folder id.
  - `toFolderId` (required, string): Destination parent folder id.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "fileId": "fileId_example",
  "fromFolderId": "fromFolderId_example",
  "toFolderId": "toFolderId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `google_drive_file_rename`

Use this when the user wants to rename an existing Google Drive file. Changes only the file metadata name; it does not move the file between folders. Returns the write lifecycle status and safe failure details. Do not use this when the user wants to change parent folders; use google_drive_file_move instead. External write: may rename a Drive file or create an approval-governed Drive action. Before calling, the exact file id and new name must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `fileId` (required, string): File id.
  - `name` (required, string): New file name.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "fileId": "fileId_example",
  "name": "name_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `google_drive_file_restore`

Use this when the user wants to restore a trashed Google Drive file. Restores one trashed Drive file. Returns the write lifecycle status and safe failure details. Do not use this when the file is not currently in trash. External write: may restore a Drive file or create an approval-governed Drive action. Before calling, the exact trashed file must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `fileId` (required, string): Trashed file id to restore.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "fileId": "fileId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `google_drive_file_save`

Use this when a Google Drive file must be delivered later or passed to another tool as an artifact. Downloads or exports Google Drive file bytes and stores them as a bounded profile file for later delivery or tool handoff. Returns saved artifact metadata and safe failure details. Use fileId for the Google Drive file id; do not pass id. Use mode=media for binary files and mode=export with exportMimeType for Google Docs/Sheets/Slides. When mode=export, provide filename with the intended extension, such as Proposal.pdf or Sheet.xlsx. This is an internal read/delivery handoff. If saved file analysis conflicts with live provider evidence or fails extraction, do not fall back to profile files as a source of truth for the current provider file. External write: creates an internal durable profile file; it does not mutate Drive or send the file by itself. Before calling, the source file id and export mode must match the intended file.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `accountEmail` (union), `byteSize` (integer), `filename` (string), `mimeType` (string), `profileFileId` (string), `provider` ("google-drive"), `sha256` (string)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `exportMimeType` (optional, string): Required when mode=export, e.g. application/pdf.
  - `fileId` (required, string): Google Drive file id.
  - `filename` (optional, string): Artifact filename including extension. Required when mode=export.
  - `mode` (required, "media" | "export"): Use media for binary files; use export for Google Workspace native files such as Docs, Sheets, or Slides.
- Outputs:
  - `accountEmail` (union): Provider account email used to fetch or create the artifact, when known. Example: `"client@example.com"`.
  - `byteSize` (integer): Profile file size in bytes. Example: `24576`.
  - `filename` (string): Stored profile-file filename including extension. Example: `"signed-agreement.pdf"`.
  - `mimeType` (string): MIME type of the saved artifact. Example: `"application/pdf"`.
  - `profileFileId` (string): Durable profile file id for the saved file. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `provider` ("google-drive"): Provider that produced the saved profile file.
  - `sha256` (string): SHA-256 hex digest for stale-file protection. Example: `"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "exportMimeType": "exportMimeType_example",
  "fileId": "fileId_example",
  "filename": "filename_example",
  "mode": "media"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "byteSize": 24576,
  "filename": "signed-agreement.pdf",
  "mimeType": "application/pdf",
  "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "google-drive",
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

### `google_drive_file_share`

Use this when the user wants to share a Google Drive file. Creates a Drive permission for a user, group, domain, or anyone share. Returns the write lifecycle status and safe failure details. user/group shares require emailAddress; domain shares require domain; anyone shares do not use either. role=owner transfers ownership; use it only when the user explicitly wants ownership transfer, not merely edit access. External write: may grant Drive file access or create an approval-governed Drive action. Before calling, the exact file, grantee/scope, and role must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `allowFileDiscovery` (optional, boolean): For anyone/domain shares, whether the file can be discovered in search.
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `domain` (optional, string): Domain for type=domain.
  - `emailAddress` (optional, string): Required when type is user or group.
  - `fileId` (required, string): File id.
  - `role` (required, "owner" | "organizer" | "fileOrganizer" | "writer" | "commenter" | "reader"): Google Drive permission role to grant.
  - `sendNotificationEmail` (optional, boolean): Whether Google Drive should send a sharing notification email when supported.
  - `type` (required, "user" | "group" | "domain" | "anyone"): Permission grantee type.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "allowFileDiscovery": true,
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "domain": "domain_example",
  "emailAddress": "emailAddress_example",
  "fileId": "fileId_example",
  "role": "owner",
  "sendNotificationEmail": true,
  "type": "user"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `google_drive_file_trash`

Use this when the user wants to move a Google Drive file to trash. Moves one Drive file to trash. Returns the write lifecycle status and safe failure details. This is reversible through restore when provider state still allows it. External write: may trash a Drive file or create an approval-governed Drive action. Before calling, the exact file must be confirmed because this is a destructive provider write.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `fileId` (required, string): File id to move to trash.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "fileId": "fileId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `google_drive_file_update_description`

Use this when the user wants to update a Google Drive file description. Changes only the file description metadata, not document contents. Returns the write lifecycle status and safe failure details. External write: may update Drive file metadata or create an approval-governed Drive action. Before calling, the exact file id and new description must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `description` (required, string): New file description.
  - `fileId` (required, string): File id.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "description": "description_example",
  "fileId": "fileId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `google_drive_file_upload`

Use this when small direct content or an existing profile file must be uploaded to Google Drive. Uploads direct content or profile file bytes to Google Drive. Returns the write lifecycle status and safe failure details. Do not use this when content cannot fit safely in a single provider upload or requires a resumable upload path; no resumable Drive upload tool is exposed here. Use top-level name for the Drive filename; do not pass filename. Use source.kind=profile_file for assistant-created or provider-saved files. When uploading an artifact and a MIME type override is needed, put mimeType inside source; do not pass top-level mimeType. Use source.kind=direct_content for small explicit text/base64 bytes; folderId sets the destination folder and omitting it uses the provider default/root. External write: may create a Drive file or create an approval-governed Drive action. Before calling, the filename, source file/content, MIME type, and destination folder/root intent must be clear. If multiple plausible destination folders match the client/deal, ask which one to use before uploading.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `description` (optional, string): File description.
  - `folderId` (optional, string): Destination parent folder id; omit for the provider default/root.
  - `name` (required, string): File name including extension.
  - `source` (required, union): File source to upload: direct small content or an existing profile file.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "description": "description_example",
  "folderId": "folderId_example",
  "name": "name_example",
  "source": {
    "content": "content_example",
    "isBase64": true,
    "kind": "direct_content",
    "mimeType": "mimeType_example"
  }
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `google_drive_folder_create`

Use this when the user wants to create a Google Drive folder. Creates a folder in Google Drive. Returns the write lifecycle status and safe failure details. Use parentId to create inside a known folder; omit parentId only when the Drive root is intended. External write: may create a Drive folder or create an approval-governed Drive action. Before calling, the folder name and parent/root destination must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `name` (required, string): New folder name.
  - `parentId` (optional, string): Parent folder id (omit for drive root).
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "name_example",
  "parentId": "parentId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `google_drive_folder_list`

Use this when the user needs to browse a known Google Drive folder location. Lists immediate children for a Google Drive folder, or the My Drive root when no folder is provided. Returns Drive file and folder metadata plus pagination details. Do not use this when the user needs full-drive search; use google_drive_search instead. Set includeSharedDrives when shared-drive folder contents should be included. Only returned child file entries prove the folder contains files. A folder metadata match from search does not prove folder contents.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `files` (array), `nextCursor` (union), `provider` ("google-drive")
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `cursor` (optional, string): Pagination cursor from a prior result.
  - `folderId` (optional, string): Drive folder id, or omit for My Drive root.
  - `includeSharedDrives` (optional, boolean): When true, include items from shared drives in folder listing results where the provider supports it.
  - `limit` (optional, integer): Maximum files to return.
- Outputs:
  - `accountEmail` (union): Google account email used for this result. Example: `"client@example.com"`.
  - `files` (array): Drive files or folders returned.
  - `files[].createdAt` (union): Provider creation timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `files[].id` (string): Google Drive file or folder id.
  - `files[].mimeType` (union): Drive item MIME type. Example: `"application/pdf"`.
  - `files[].modifiedAt` (union): Provider last-modified timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `files[].name` (union): Drive item display name.
  - `files[].sizeBytes` (union): File size in bytes, if known.
  - `files[].trashed` (boolean): Whether the item is in Google Drive trash.
  - `files[].webUrl` (union): Browser URL for opening the Drive item. Example: `"https://drive.google.com/file/d/example/view"`.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("google-drive"): Provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "cursor": "cursor_example",
  "folderId": "folderId_example",
  "includeSharedDrives": true,
  "limit": 1
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "files": [
    {
      "createdAt": "2026-05-21T14:30:00.000Z",
      "id": "id_example",
      "mimeType": "application/pdf",
      "modifiedAt": "2026-05-21T14:30:00.000Z",
      "name": "name_example",
      "sizeBytes": 1,
      "trashed": true,
      "webUrl": "https://drive.google.com/file/d/example/view"
    }
  ],
  "nextCursor": "nextCursor_example",
  "provider": "google-drive"
}
```

### `google_drive_permission_delete`

Use this when the user wants to remove a Google Drive permission. Deletes one Drive permission. Returns the write lifecycle status and safe failure details. External write: may revoke Drive file access or create an approval-governed Drive action. Before calling, the exact file and permission id must be confirmed because access can be revoked.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `fileId` (required, string): File id.
  - `permissionId` (required, string): Permission id.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "fileId": "fileId_example",
  "permissionId": "permissionId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `google_drive_permission_get`

Use this when exact role, grantee, or permission metadata is needed. Gets one Google Drive file permission by permission id. Returns the selected permission's role, grantee, and metadata.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `permission` (object), `provider` ("google-drive")
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `fileId` (required, string): File or shared drive id.
  - `permissionId` (required, string): Permission id.
- Outputs:
  - `accountEmail` (union): Google account email used for this result. Example: `"client@example.com"`.
  - `permission` (object): Requested Drive permission.
  - `permission.deleted` (boolean): Whether the grantee account is deleted.
  - `permission.displayName` (union): Grantee display name.
  - `permission.emailAddress` (union): Grantee email address, when applicable. Example: `"client@example.com"`.
  - `permission.id` (string): Google Drive permission id.
  - `permission.role` (union): Permission role.
  - `permission.type` (union): Permission grantee type.
  - `provider` ("google-drive"): Provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "fileId": "fileId_example",
  "permissionId": "permissionId_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "permission": {
    "deleted": true,
    "displayName": "displayName_example",
    "emailAddress": "client@example.com",
    "id": "id_example",
    "role": "role_example",
    "type": "type_example"
  },
  "provider": "google-drive"
}
```

### `google_drive_permission_update`

Use this when the user wants to update an existing Google Drive permission role. Updates one existing Drive permission role. Returns the write lifecycle status and safe failure details. Use permission ids from google_drive_permissions_list or google_drive_permission_get. role=owner transfers ownership; use it only when the user explicitly wants ownership transfer, not merely edit access. External write: may change Drive file access or create an approval-governed Drive action. Before calling, the exact permission id, grantee context, and new role must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `fileId` (required, string): File or shared drive id.
  - `permissionId` (required, string): Permission id.
  - `role` (required, "owner" | "organizer" | "fileOrganizer" | "writer" | "commenter" | "reader"): Google Drive permission role to set.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "fileId": "fileId_example",
  "permissionId": "permissionId_example",
  "role": "owner"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `google_drive_permissions_list`

Use this when the user needs to confirm who has access before sharing changes. Lists permissions on a Google Drive file or shared drive. Returns permission ids, roles, grantees, and permission metadata.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `nextCursor` (union), `permissions` (array), `provider` ("google-drive")
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `cursor` (optional, string): Pagination cursor from a prior result.
  - `fileId` (required, string): File or shared drive id.
  - `pageSize` (optional, integer): Maximum permissions to return.
- Outputs:
  - `accountEmail` (union): Google account email used for this result. Example: `"client@example.com"`.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `permissions` (array): Permissions returned.
  - `permissions[].deleted` (boolean): Whether the grantee account is deleted.
  - `permissions[].displayName` (union): Grantee display name.
  - `permissions[].emailAddress` (union): Grantee email address, when applicable. Example: `"client@example.com"`.
  - `permissions[].id` (string): Google Drive permission id.
  - `permissions[].role` (union): Permission role.
  - `permissions[].type` (union): Permission grantee type.
  - `provider` ("google-drive"): Provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "cursor": "cursor_example",
  "fileId": "fileId_example",
  "pageSize": 1
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "nextCursor": "nextCursor_example",
  "permissions": [
    {
      "deleted": true,
      "displayName": "displayName_example",
      "emailAddress": "client@example.com",
      "id": "id_example",
      "role": "role_example",
      "type": "type_example"
    }
  ],
  "provider": "google-drive"
}
```

### `google_drive_search`

Use this when the user needs to search or list Google Drive files from current Drive data. Searches Drive files using plain-language query or advanced Drive q syntax. Returns matching Drive file metadata and pagination details. Callers must supply query or driveQuery. Use query for plain-language search, driveQuery for advanced Drive q syntax, and pageSize/cursor for pagination. This tool has no folderId input; use google_drive_folder_list to list children of a known folder. Use driveQuery with `sharedWithMe and trashed = false` to find files or folders shared with the connected Google account. A matching folder result only proves the folder exists. Do not say it contains supporting files, completed documents, filed records, or deal evidence unless a folder listing or file-targeted search returns those file entries. An empty folder or empty search result only proves no matching files were found in that searched Drive scope. It is not evidence of a required-document checklist. Only report specific missing required documents when another current source defines the requirements, such as CRM file/link columns, checklist subitems, a named template, or an explicit user-provided checklist. If no current requirement source is found, say the requirement source is missing; report present/absent Drive and CRM evidence without inventing standard required documents.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `files` (array), `nextCursor` (union), `provider` ("google-drive")
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `cursor` (optional, string): Pagination cursor from a prior result.
  - `driveQuery` (optional, string): Advanced Google Drive `q` search string. Use only when exact Drive query syntax is needed.
  - `pageSize` (optional, integer): Maximum files to return.
  - `query` (optional, string): Plain-language file search text, such as a file name, client name, or document topic.
- Outputs:
  - `accountEmail` (union): Google account email used for this result. Example: `"client@example.com"`.
  - `files` (array): Drive files or folders returned.
  - `files[].createdAt` (union): Provider creation timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `files[].id` (string): Google Drive file or folder id.
  - `files[].mimeType` (union): Drive item MIME type. Example: `"application/pdf"`.
  - `files[].modifiedAt` (union): Provider last-modified timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `files[].name` (union): Drive item display name.
  - `files[].sizeBytes` (union): File size in bytes, if known.
  - `files[].trashed` (boolean): Whether the item is in Google Drive trash.
  - `files[].webUrl` (union): Browser URL for opening the Drive item. Example: `"https://drive.google.com/file/d/example/view"`.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("google-drive"): Provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "cursor": "cursor_example",
  "driveQuery": "driveQuery_example",
  "pageSize": 1,
  "query": "query_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "files": [
    {
      "createdAt": "2026-05-21T14:30:00.000Z",
      "id": "id_example",
      "mimeType": "application/pdf",
      "modifiedAt": "2026-05-21T14:30:00.000Z",
      "name": "name_example",
      "sizeBytes": 1,
      "trashed": true,
      "webUrl": "https://drive.google.com/file/d/example/view"
    }
  ],
  "nextCursor": "nextCursor_example",
  "provider": "google-drive"
}
```

### `google_drive_shared_drives_list`

Use this when the agent needs shared-drive ids before browsing or searching shared-drive content. Lists shared drives available to the connected Google Drive account. Returns shared-drive ids, names, and metadata.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `drives` (array), `nextCursor` (union), `provider` ("google-drive")
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.
  - `cursor` (optional, string): Pagination cursor from a prior result.
  - `limit` (optional, integer): Maximum shared drives to return.
  - `query` (optional, string): Shared drive search query (optional).
- Outputs:
  - `accountEmail` (union): Google account email used for this result. Example: `"client@example.com"`.
  - `drives` (array): Shared drives returned.
  - `drives[].id` (string): Google shared drive id.
  - `drives[].name` (union): Shared drive display name.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("google-drive"): Provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "cursor": "cursor_example",
  "limit": 1,
  "query": "query_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "drives": [
    {
      "id": "id_example",
      "name": "name_example"
    }
  ],
  "nextCursor": "nextCursor_example",
  "provider": "google-drive"
}
```

### `microsoft_onedrive_accounts_list`

Use this when the agent needs configured OneDrive account choices for this profile. Lists connected OneDrive accounts and current health without fetching files. Returns OneDrive account metadata for choosing connectedAccountId. Use when multiple OneDrive accounts may exist.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accounts` (array)
- Inputs:
  - None
- Outputs:
  - `accounts` (array): Provider accounts available for this capability.
  - `accounts[].accountEmail` (union): Email address associated with the provider account when known. Example: `"client@example.com"`.
  - `accounts[].connected` (boolean): Whether credentials currently exist for this account.
  - `accounts[].connectedAccountId` (string): Connected provider account id to pass when selecting this account. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `accounts[].credentialStatus` (union): Credential readiness or blocker status reported by the backend.
  - `accounts[].label` (union): Human-readable account label, preferring provider identity such as email when known.
  - `accounts[].provider` (string): Provider slug for this connected account.
  - `accounts[].ready` (boolean): Whether the account is ready for provider tool calls.

Example input:
```json
{}
```

Example output:
```json
{
  "accounts": [
    {
      "accountEmail": "client@example.com",
      "connected": true,
      "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
      "credentialStatus": "credentialStatus_example",
      "label": "label_example",
      "provider": "provider_example",
      "ready": true
    }
  ]
}
```

### `microsoft_onedrive_drive_get`

Use this when root or default OneDrive drive identity is needed for browsing or file operations. Gets the signed-in user's default OneDrive drive. Returns default OneDrive drive metadata.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `item` (object), `provider` ("microsoft-onedrive")
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
- Outputs:
  - `accountEmail` (union): Microsoft account email used for this result. Example: `"client@example.com"`.
  - `item` (object): Requested OneDrive item.
  - `item.createdAt` (union): Provider creation timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `item.description` (union): Item description.
  - `item.driveId` (union): OneDrive drive id.
  - `item.id` (string): OneDrive drive item or drive id.
  - `item.mimeType` (union): File MIME type, when known. Example: `"application/pdf"`.
  - `item.modifiedAt` (union): Provider last-modified timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `item.name` (union): OneDrive item display name.
  - `item.parentId` (union): Parent folder item id.
  - `item.sizeBytes` (union): File size in bytes, if known.
  - `item.type` ("file" | "folder" | "drive" | "site" | "unknown"): OneDrive item kind.
  - `item.webUrl` (union): Browser URL for opening the Microsoft item. Example: `"https://contoso.sharepoint.com/sites/example"`.
  - `provider` ("microsoft-onedrive"): Provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "item": {
    "createdAt": "2026-05-21T14:30:00.000Z",
    "description": "description_example",
    "driveId": "driveId_example",
    "id": "id_example",
    "mimeType": "application/pdf",
    "modifiedAt": "2026-05-21T14:30:00.000Z",
    "name": "name_example",
    "parentId": "parentId_example",
    "sizeBytes": 1,
    "type": "file",
    "webUrl": "https://contoso.sharepoint.com/sites/example"
  },
  "provider": "microsoft-onedrive"
}
```

### `microsoft_onedrive_drives_list`

Use this when the agent needs OneDrive drive metadata for account or default-drive context. Lists OneDrive drives available to the connected account. Returns OneDrive drive ids, names, and metadata. This surface's browse, search, and write tools operate on the connected account's default OneDrive drive.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `drives` (array), `nextCursor` (union), `provider` ("microsoft-onedrive")
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
- Outputs:
  - `accountEmail` (union): Microsoft account email used for this result. Example: `"client@example.com"`.
  - `drives` (array): OneDrive drives returned.
  - `drives[].createdAt` (union): Provider creation timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `drives[].id` (string): OneDrive drive item or drive id.
  - `drives[].modifiedAt` (union): Provider last-modified timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `drives[].name` (union): OneDrive item display name.
  - `drives[].sizeBytes` (union): File size in bytes, if known.
  - `drives[].type` ("file" | "folder" | "drive" | "site" | "unknown"): OneDrive item kind.
  - `drives[].webUrl` (union): Browser URL for opening the Microsoft item. Example: `"https://contoso.sharepoint.com/sites/example"`.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("microsoft-onedrive"): Provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "drives": [
    {
      "createdAt": "2026-05-21T14:30:00.000Z",
      "id": "id_example",
      "modifiedAt": "2026-05-21T14:30:00.000Z",
      "name": "name_example",
      "sizeBytes": 1,
      "type": "file",
      "webUrl": "https://contoso.sharepoint.com/sites/example"
    }
  ],
  "nextCursor": "nextCursor_example",
  "provider": "microsoft-onedrive"
}
```

### `microsoft_onedrive_file_save`

Use this when a OneDrive file must be delivered later or passed to another tool as an artifact. Downloads OneDrive file bytes and stores them as a bounded profile file. Returns saved artifact metadata and safe failure details. If filename is omitted, the artifact filename is derived from provider metadata. External write: creates an internal durable profile file; it does not mutate OneDrive or send the file by itself. Before calling, the source OneDrive file must identify the intended file.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `accountEmail` (union), `byteSize` (integer), `filename` (string), `mimeType` (string), `profileFileId` (string), `provider` ("microsoft-onedrive"), `sha256` (string)
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `filename` (optional, string): Artifact filename including extension.
  - `itemId` (required, string): OneDrive drive item id.
- Outputs:
  - `accountEmail` (union): Provider account email used to fetch or create the artifact, when known. Example: `"client@example.com"`.
  - `byteSize` (integer): Profile file size in bytes. Example: `24576`.
  - `filename` (string): Stored profile-file filename including extension. Example: `"signed-agreement.pdf"`.
  - `mimeType` (string): MIME type of the saved artifact. Example: `"application/pdf"`.
  - `profileFileId` (string): Durable profile file id for the saved file. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `provider` ("microsoft-onedrive"): Provider that produced the saved profile file.
  - `sha256` (string): SHA-256 hex digest for stale-file protection. Example: `"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "filename_example",
  "itemId": "itemId_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "byteSize": 24576,
  "filename": "signed-agreement.pdf",
  "mimeType": "application/pdf",
  "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "microsoft-onedrive",
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

### `microsoft_onedrive_files_search`

Use this when OneDrive item ids are unknown before metadata, download, move, share, or delete actions. Searches OneDrive items by query string. Returns matching OneDrive item metadata.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `items` (array), `nextCursor` (union), `provider` ("microsoft-onedrive")
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `query` (required, string): OneDrive search query string.
- Outputs:
  - `accountEmail` (union): Microsoft account email used for this result. Example: `"client@example.com"`.
  - `items` (array): OneDrive items returned.
  - `items[].createdAt` (union): Provider creation timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `items[].id` (string): OneDrive drive item or drive id.
  - `items[].modifiedAt` (union): Provider last-modified timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `items[].name` (union): OneDrive item display name.
  - `items[].sizeBytes` (union): File size in bytes, if known.
  - `items[].type` ("file" | "folder" | "drive" | "site" | "unknown"): OneDrive item kind.
  - `items[].webUrl` (union): Browser URL for opening the Microsoft item. Example: `"https://contoso.sharepoint.com/sites/example"`.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("microsoft-onedrive"): Provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "query": "query_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "items": [
    {
      "createdAt": "2026-05-21T14:30:00.000Z",
      "id": "id_example",
      "modifiedAt": "2026-05-21T14:30:00.000Z",
      "name": "name_example",
      "sizeBytes": 1,
      "type": "file",
      "webUrl": "https://contoso.sharepoint.com/sites/example"
    }
  ],
  "nextCursor": "nextCursor_example",
  "provider": "microsoft-onedrive"
}
```

### `microsoft_onedrive_folder_children_list`

Use this when the user needs to browse a known OneDrive folder location. Lists children under a OneDrive folder. Returns OneDrive item metadata and pagination details. Do not use this when the user needs item search; use microsoft_onedrive_files_search instead. Omit itemId or use root for the drive root.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `items` (array), `nextCursor` (union), `provider` ("microsoft-onedrive")
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `itemId` (optional, string): Folder item id; omit or use "root" for root.
- Outputs:
  - `accountEmail` (union): Microsoft account email used for this result. Example: `"client@example.com"`.
  - `items` (array): OneDrive items returned.
  - `items[].createdAt` (union): Provider creation timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `items[].id` (string): OneDrive drive item or drive id.
  - `items[].modifiedAt` (union): Provider last-modified timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `items[].name` (union): OneDrive item display name.
  - `items[].sizeBytes` (union): File size in bytes, if known.
  - `items[].type` ("file" | "folder" | "drive" | "site" | "unknown"): OneDrive item kind.
  - `items[].webUrl` (union): Browser URL for opening the Microsoft item. Example: `"https://contoso.sharepoint.com/sites/example"`.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("microsoft-onedrive"): Provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "itemId": "itemId_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "items": [
    {
      "createdAt": "2026-05-21T14:30:00.000Z",
      "id": "id_example",
      "modifiedAt": "2026-05-21T14:30:00.000Z",
      "name": "name_example",
      "sizeBytes": 1,
      "type": "file",
      "webUrl": "https://contoso.sharepoint.com/sites/example"
    }
  ],
  "nextCursor": "nextCursor_example",
  "provider": "microsoft-onedrive"
}
```

### `microsoft_onedrive_folder_create`

Use this when the user wants to create a OneDrive folder. Creates a folder in OneDrive. Returns the write lifecycle status and safe failure details. Use parentItemId=root only when the drive root is intended. External write: may create a OneDrive folder or create an approval-governed OneDrive action. Before calling, the folder name and parent/root destination must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `conflictBehavior` (optional, "fail" | "replace" | "rename"): Provider conflict behavior when the folder name already exists.
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `name` (required, string): New folder name.
  - `parentItemId` (required, string): Parent folder id; use "root" for root.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "conflictBehavior": "fail",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "name_example",
  "parentItemId": "parentItemId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `microsoft_onedrive_invite_recipients`

Use this when the user wants to invite recipients to a OneDrive item. Invites recipients to a OneDrive item with selected roles. Returns the write lifecycle status and safe failure details. Each recipient must include email, objectId, or alias; roles controls read/write access. External write: may grant recipient access and notify invitees or create an approval-governed OneDrive action. Before calling, the exact item, recipients, roles, and notification intent must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `expirationDateTime` (optional, string): Optional access expiration timestamp.
  - `itemId` (required, string): Drive item id.
  - `message` (optional, string): Optional invitation message.
  - `password` (optional, string): Optional sharing password when supported.
  - `recipients` (required, array): Recipients to invite; each recipient needs email, objectId, or alias.
  - `recipients[].alias` (optional, string): Provider alias for the recipient.
  - `recipients[].email` (optional, string): Recipient email address.
  - `recipients[].objectId` (optional, string): Directory object id for the recipient.
  - `requireSignIn` (optional, boolean): Whether recipients must sign in to access the item.
  - `retainInheritedPermissions` (optional, boolean): Whether to retain inherited permissions when inviting recipients.
  - `roles` (required, array): Permission roles to grant.
  - `sendInvitation` (optional, boolean): Whether Microsoft should email invitations.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "expirationDateTime": "expirationDateTime_example",
  "itemId": "itemId_example",
  "message": "message_example",
  "password": "password_example",
  "recipients": [
    {
      "alias": "alias_example",
      "email": "email_example",
      "objectId": "550e8400-e29b-41d4-a716-446655440000"
    }
  ],
  "requireSignIn": true,
  "retainInheritedPermissions": true,
  "roles": [
    "read"
  ],
  "sendInvitation": true
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `microsoft_onedrive_item_copy`

Use this when the user wants to copy a OneDrive item. Copies one OneDrive item into a target parent folder, optionally with a new name. Returns the write lifecycle status and safe failure details. External write: may create a OneDrive item copy or create an approval-governed OneDrive action. Before calling, the source item and target parent folder must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `itemId` (required, string): Drive item id to copy.
  - `newName` (optional, string): Optional name for the copied item.
  - `targetParentId` (required, string): Destination folder id.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "itemId": "itemId_example",
  "newName": "newName_example",
  "targetParentId": "targetParentId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `microsoft_onedrive_item_delete`

Use this when the user wants to delete a OneDrive item. Deletes one OneDrive item using provider delete semantics. Returns the write lifecycle status and safe failure details. External write: may delete a OneDrive item or create an approval-governed OneDrive action. Before calling, the exact item must be confirmed because this is a destructive external write.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `itemId` (required, string): Drive item id to delete.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "itemId": "itemId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `microsoft_onedrive_item_get`

Use this when OneDrive item metadata must be confirmed before save or mutation. Gets a OneDrive item by id or path. Returns OneDrive item metadata. Provide exactly one of itemId or itemPath, not both.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `item` (object), `provider` ("microsoft-onedrive")
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `itemId` (optional, string): OneDrive drive item id. Provide exactly one of itemId or itemPath.
  - `itemPath` (optional, string): Path relative to the drive root, e.g. /Documents/file.txt. Provide exactly one of itemPath or itemId.
- Outputs:
  - `accountEmail` (union): Microsoft account email used for this result. Example: `"client@example.com"`.
  - `item` (object): Requested OneDrive item.
  - `item.createdAt` (union): Provider creation timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `item.description` (union): Item description.
  - `item.driveId` (union): OneDrive drive id.
  - `item.id` (string): OneDrive drive item or drive id.
  - `item.mimeType` (union): File MIME type, when known. Example: `"application/pdf"`.
  - `item.modifiedAt` (union): Provider last-modified timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `item.name` (union): OneDrive item display name.
  - `item.parentId` (union): Parent folder item id.
  - `item.sizeBytes` (union): File size in bytes, if known.
  - `item.type` ("file" | "folder" | "drive" | "site" | "unknown"): OneDrive item kind.
  - `item.webUrl` (union): Browser URL for opening the Microsoft item. Example: `"https://contoso.sharepoint.com/sites/example"`.
  - `provider` ("microsoft-onedrive"): Provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "itemId": "itemId_example",
  "itemPath": "itemPath_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "item": {
    "createdAt": "2026-05-21T14:30:00.000Z",
    "description": "description_example",
    "driveId": "driveId_example",
    "id": "id_example",
    "mimeType": "application/pdf",
    "modifiedAt": "2026-05-21T14:30:00.000Z",
    "name": "name_example",
    "parentId": "parentId_example",
    "sizeBytes": 1,
    "type": "file",
    "webUrl": "https://contoso.sharepoint.com/sites/example"
  },
  "provider": "microsoft-onedrive"
}
```

### `microsoft_onedrive_item_move`

Use this when the user wants to move or rename a OneDrive item. Moves a OneDrive item, renames it, or does both in one provider action. Returns the write lifecycle status and safe failure details. Provide parentFolderId to move, name to rename, or both. Prefer this tool for ordinary filesystem move or rename requests instead of microsoft_onedrive_item_update. External write: may move or rename a OneDrive item or create an approval-governed OneDrive action. Before calling, the exact item and destination folder and/or new name must be clear; itemId alone is not useful.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `itemId` (required, string): Drive item id to move or rename.
  - `name` (optional, string): New item name; provide when renaming.
  - `parentFolderId` (optional, string): Destination parent folder id; provide when moving.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "itemId": "itemId_example",
  "name": "name_example",
  "parentFolderId": "parentFolderId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `microsoft_onedrive_item_update`

Use this when the user wants to update OneDrive item metadata. Updates metadata fields on one OneDrive item. Returns the write lifecycle status and safe failure details. Prefer microsoft_onedrive_item_move for ordinary filesystem move or rename requests; use this for metadata patches such as description or fileSystemInfo. External write: may update OneDrive item metadata or create an approval-governed OneDrive action. Before calling, the exact item and at least one actual metadata field such as name, description, fileSystemInfo, or parentReference must be clear; itemId alone is not useful.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `description` (optional, union): New item description, null to clear, or omit to leave unchanged.
  - `fileSystemInfo` (optional, object): Optional filesystem timestamp metadata to update.
  - `fileSystemInfo.createdDateTime` (optional, string): Optional created timestamp override.
  - `fileSystemInfo.lastModifiedDateTime` (optional, string): Optional modified timestamp override.
  - `itemId` (required, string): Drive item id.
  - `name` (optional, string): New item name; omit to leave unchanged.
  - `parentReference` (optional, object): Optional parent reference for metadata-level moves.
  - `parentReference.driveId` (optional, string): Destination drive id when moving across drives.
  - `parentReference.id` (optional, string): Destination parent item id.
  - `parentReference.path` (optional, string): Destination parent path.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "description": "description_example",
  "fileSystemInfo": {
    "createdDateTime": "createdDateTime_example",
    "lastModifiedDateTime": "lastModifiedDateTime_example"
  },
  "itemId": "itemId_example",
  "name": "name_example",
  "parentReference": {
    "driveId": "driveId_example",
    "id": "id_example",
    "path": "path_example"
  }
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `microsoft_onedrive_permission_delete`

Use this when the user wants to remove a OneDrive permission. Deletes one OneDrive item permission. Returns the write lifecycle status and safe failure details. External write: may revoke OneDrive item access or create an approval-governed OneDrive action. Before calling, the exact permission id and item must be confirmed because access can be revoked.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `itemId` (required, string): Drive item id.
  - `permissionId` (required, string): Permission id.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "itemId": "itemId_example",
  "permissionId": "permissionId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `microsoft_onedrive_permission_get`

Use this when exact OneDrive permission role or grantee metadata is needed. Gets one OneDrive item permission by permission id. Returns the selected OneDrive permission's role, grantee, and metadata.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `permission` (object), `provider` ("microsoft-onedrive")
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `itemId` (required, string): Drive item id.
  - `permissionId` (required, string): Permission id.
- Outputs:
  - `accountEmail` (union): Microsoft account email used for this result. Example: `"client@example.com"`.
  - `permission` (object): Requested OneDrive permission.
  - `permission.grantedTo` (union): User or group the permission grants.
  - `permission.id` (string): OneDrive permission id.
  - `permission.linkType` (union): Sharing link type, when applicable.
  - `permission.roles` (array): Permission roles granted.
  - `provider` ("microsoft-onedrive"): Provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "itemId": "itemId_example",
  "permissionId": "permissionId_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "permission": {
    "grantedTo": "grantedTo_example",
    "id": "id_example",
    "linkType": "linkType_example",
    "roles": [
      "roles_example"
    ]
  },
  "provider": "microsoft-onedrive"
}
```

### `microsoft_onedrive_permissions_list`

Use this when the user needs to confirm who has access before sharing changes. Lists permissions on a OneDrive item. Returns OneDrive permission ids, roles, grantees, and metadata.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `nextCursor` (union), `permissions` (array), `provider` ("microsoft-onedrive")
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `itemId` (required, string): Drive item id.
- Outputs:
  - `accountEmail` (union): Microsoft account email used for this result. Example: `"client@example.com"`.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `permissions` (array): Permissions returned.
  - `permissions[].grantedTo` (union): User or group the permission grants.
  - `permissions[].id` (string): OneDrive permission id.
  - `permissions[].linkType` (union): Sharing link type, when applicable.
  - `permissions[].roles` (array): Permission roles granted.
  - `provider` ("microsoft-onedrive"): Provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "itemId": "itemId_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "nextCursor": "nextCursor_example",
  "permissions": [
    {
      "grantedTo": "grantedTo_example",
      "id": "id_example",
      "linkType": "linkType_example",
      "roles": [
        "roles_example"
      ]
    }
  ],
  "provider": "microsoft-onedrive"
}
```

### `microsoft_onedrive_recent_items_list`

Use this when the user refers to a recent OneDrive file but the exact location or id is unknown. Lists recently used OneDrive items. Returns recent OneDrive item metadata.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `items` (array), `nextCursor` (union), `provider` ("microsoft-onedrive")
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
- Outputs:
  - `accountEmail` (union): Microsoft account email used for this result. Example: `"client@example.com"`.
  - `items` (array): OneDrive items returned.
  - `items[].createdAt` (union): Provider creation timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `items[].id` (string): OneDrive drive item or drive id.
  - `items[].modifiedAt` (union): Provider last-modified timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `items[].name` (union): OneDrive item display name.
  - `items[].sizeBytes` (union): File size in bytes, if known.
  - `items[].type` ("file" | "folder" | "drive" | "site" | "unknown"): OneDrive item kind.
  - `items[].webUrl` (union): Browser URL for opening the Microsoft item. Example: `"https://contoso.sharepoint.com/sites/example"`.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("microsoft-onedrive"): Provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "items": [
    {
      "createdAt": "2026-05-21T14:30:00.000Z",
      "id": "id_example",
      "modifiedAt": "2026-05-21T14:30:00.000Z",
      "name": "name_example",
      "sizeBytes": 1,
      "type": "file",
      "webUrl": "https://contoso.sharepoint.com/sites/example"
    }
  ],
  "nextCursor": "nextCursor_example",
  "provider": "microsoft-onedrive"
}
```

### `microsoft_onedrive_shared_items_list`

Use this when the user asks about OneDrive files shared with them rather than files they own. Lists OneDrive items shared with the user. Returns shared OneDrive item metadata.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `items` (array), `nextCursor` (union), `provider` ("microsoft-onedrive")
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
- Outputs:
  - `accountEmail` (union): Microsoft account email used for this result. Example: `"client@example.com"`.
  - `items` (array): OneDrive items returned.
  - `items[].createdAt` (union): Provider creation timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `items[].id` (string): OneDrive drive item or drive id.
  - `items[].modifiedAt` (union): Provider last-modified timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `items[].name` (union): OneDrive item display name.
  - `items[].sizeBytes` (union): File size in bytes, if known.
  - `items[].type` ("file" | "folder" | "drive" | "site" | "unknown"): OneDrive item kind.
  - `items[].webUrl` (union): Browser URL for opening the Microsoft item. Example: `"https://contoso.sharepoint.com/sites/example"`.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("microsoft-onedrive"): Provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "items": [
    {
      "createdAt": "2026-05-21T14:30:00.000Z",
      "id": "id_example",
      "modifiedAt": "2026-05-21T14:30:00.000Z",
      "name": "name_example",
      "sizeBytes": 1,
      "type": "file",
      "webUrl": "https://contoso.sharepoint.com/sites/example"
    }
  ],
  "nextCursor": "nextCursor_example",
  "provider": "microsoft-onedrive"
}
```

### `microsoft_onedrive_sharing_link_create`

Use this when the user wants to create a OneDrive sharing link. Creates a sharing link for one OneDrive item. Returns the write lifecycle status and safe failure details. Use type/scope to control view/edit/embed and anonymous/organization access; choose scope deliberately, and omit it only when the provider default is intended. External write: may grant link-based access or create an approval-governed OneDrive action. Before calling, the exact item, link type, and chosen or intentionally omitted access scope must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `expirationDateTime` (optional, string): Optional sharing link expiration timestamp.
  - `itemId` (required, string): Drive item id.
  - `password` (optional, string): Optional sharing link password.
  - `scope` (optional, "anonymous" | "organization"): Sharing link audience scope.
  - `type` (required, "view" | "edit" | "embed"): Sharing link permission type.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "expirationDateTime": "expirationDateTime_example",
  "itemId": "itemId_example",
  "password": "password_example",
  "scope": "anonymous",
  "type": "view"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `microsoft_onedrive_small_file_upload`

Use this when small base64 content or an existing profile file must be uploaded to OneDrive. Uploads direct base64 content or profile file bytes to OneDrive using the simple single-request upload path. Returns the write lifecycle status and safe failure details. Do not use this when large or resumable uploads are required; this surface only supports simple small-file uploads. Use source.kind=profile_file for assistant-created or provider-saved files. External write: may create a OneDrive file or create an approval-governed OneDrive action. Before calling, the filename, source file/content, destination, and content type must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `contentType` (optional, string): Optional MIME type of the uploaded file.
  - `fileName` (required, string): Created file name.
  - `parentItemId` (required, string): Parent folder item id.
  - `source` (required, union): File source to upload: direct small base64 content or an existing profile file.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "contentType": "contentType_example",
  "fileName": "fileName_example",
  "parentItemId": "parentItemId_example",
  "source": {
    "content": "content_example",
    "isBase64": true,
    "kind": "direct_content"
  }
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `microsoft_onedrive_versions_list`

Use this when the user asks about version history or a historical file state must be chosen. Lists versions for a OneDrive file. Returns OneDrive file version metadata.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `items` (array), `nextCursor` (union), `provider` ("microsoft-onedrive")
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `itemId` (required, string): Drive item id for a file.
- Outputs:
  - `accountEmail` (union): Microsoft account email used for this result. Example: `"client@example.com"`.
  - `items` (array): OneDrive items returned.
  - `items[].createdAt` (union): Provider creation timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `items[].id` (string): OneDrive drive item or drive id.
  - `items[].modifiedAt` (union): Provider last-modified timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `items[].name` (union): OneDrive item display name.
  - `items[].sizeBytes` (union): File size in bytes, if known.
  - `items[].type` ("file" | "folder" | "drive" | "site" | "unknown"): OneDrive item kind.
  - `items[].webUrl` (union): Browser URL for opening the Microsoft item. Example: `"https://contoso.sharepoint.com/sites/example"`.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("microsoft-onedrive"): Provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "itemId": "itemId_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "items": [
    {
      "createdAt": "2026-05-21T14:30:00.000Z",
      "id": "id_example",
      "modifiedAt": "2026-05-21T14:30:00.000Z",
      "name": "name_example",
      "sizeBytes": 1,
      "type": "file",
      "webUrl": "https://contoso.sharepoint.com/sites/example"
    }
  ],
  "nextCursor": "nextCursor_example",
  "provider": "microsoft-onedrive"
}
```

### `microsoft_sharepoint_accounts_list`

Use this when the agent needs configured SharePoint account choices for this profile. Lists connected SharePoint accounts and current health without fetching files. Returns SharePoint account metadata for choosing connectedAccountId. Use when multiple SharePoint accounts may exist.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accounts` (array)
- Inputs:
  - None
- Outputs:
  - `accounts` (array): Provider accounts available for this capability.
  - `accounts[].accountEmail` (union): Email address associated with the provider account when known. Example: `"client@example.com"`.
  - `accounts[].connected` (boolean): Whether credentials currently exist for this account.
  - `accounts[].connectedAccountId` (string): Connected provider account id to pass when selecting this account. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `accounts[].credentialStatus` (union): Credential readiness or blocker status reported by the backend.
  - `accounts[].label` (union): Human-readable account label, preferring provider identity such as email when known.
  - `accounts[].provider` (string): Provider slug for this connected account.
  - `accounts[].ready` (boolean): Whether the account is ready for provider tool calls.

Example input:
```json
{}
```

Example output:
```json
{
  "accounts": [
    {
      "accountEmail": "client@example.com",
      "connected": true,
      "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
      "credentialStatus": "credentialStatus_example",
      "label": "label_example",
      "provider": "provider_example",
      "ready": true
    }
  ]
}
```

### `microsoft_sharepoint_file_fetch`

Use this when SharePoint file identity and metadata are needed without saving it. Resolves SharePoint file metadata by site id and item id. Returns SharePoint file metadata; no download URL is returned. This read-only lookup does not persist an artifact.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `file` (object), `provider` ("microsoft-sharepoint")
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected SharePoint account exists; use microsoft_sharepoint_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `itemId` (required, string): Drive item id within the site drive.
  - `siteId` (required, string): SharePoint site id.
- Outputs:
  - `accountEmail` (union): Microsoft account email used for this result. Example: `"client@example.com"`.
  - `file` (object): Requested SharePoint file.
  - `file.createdAt` (union): Provider creation timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `file.description` (union): Item description.
  - `file.driveId` (union): SharePoint drive id.
  - `file.id` (string): SharePoint drive item, drive, or site id.
  - `file.mimeType` (union): File MIME type, when known. Example: `"application/pdf"`.
  - `file.modifiedAt` (union): Provider last-modified timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `file.name` (union): SharePoint item display name.
  - `file.parentId` (union): Parent folder item id.
  - `file.sizeBytes` (union): File size in bytes, if known.
  - `file.type` ("file" | "folder" | "drive" | "site" | "unknown"): SharePoint item kind.
  - `file.webUrl` (union): Browser URL for opening the Microsoft item. Example: `"https://contoso.sharepoint.com/sites/example"`.
  - `provider` ("microsoft-sharepoint"): Provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "itemId": "itemId_example",
  "siteId": "siteId_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "file": {
    "createdAt": "2026-05-21T14:30:00.000Z",
    "description": "description_example",
    "driveId": "driveId_example",
    "id": "id_example",
    "mimeType": "application/pdf",
    "modifiedAt": "2026-05-21T14:30:00.000Z",
    "name": "name_example",
    "parentId": "parentId_example",
    "sizeBytes": 1,
    "type": "file",
    "webUrl": "https://contoso.sharepoint.com/sites/example"
  },
  "provider": "microsoft-sharepoint"
}
```

### `microsoft_sharepoint_file_save`

Use this when a SharePoint file must be delivered later or passed to another tool as an artifact. Downloads SharePoint file bytes and stores them as a bounded profile artifact. Returns saved artifact metadata and safe failure details. If filename is omitted, the artifact filename falls back to sharepoint-{siteId}-{itemId}. Saves fail when the file exceeds the platform artifact size limit. External write: creates a durable profile artifact but does not send the file by itself. Before calling, the source SharePoint site id and item id must identify the intended file.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `accountEmail` (union), `byteSize` (integer), `filename` (string), `mimeType` (string), `profileFileId` (string), `provider` ("microsoft-sharepoint"), `sha256` (string)
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected SharePoint account exists; use microsoft_sharepoint_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
  - `filename` (optional, string): Artifact filename including extension.
  - `itemId` (required, string): Drive item id within the site drive.
  - `siteId` (required, string): SharePoint site id.
- Outputs:
  - `accountEmail` (union): Provider account email used to fetch or create the artifact, when known. Example: `"client@example.com"`.
  - `byteSize` (integer): Profile file size in bytes. Example: `24576`.
  - `filename` (string): Stored profile-file filename including extension. Example: `"signed-agreement.pdf"`.
  - `mimeType` (string): MIME type of the saved artifact. Example: `"application/pdf"`.
  - `profileFileId` (string): Durable profile file id for the saved file. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `provider` ("microsoft-sharepoint"): Provider that produced the saved profile file.
  - `sha256` (string): SHA-256 hex digest for stale-file protection. Example: `"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "filename_example",
  "itemId": "itemId_example",
  "siteId": "siteId_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "byteSize": 24576,
  "filename": "signed-agreement.pdf",
  "mimeType": "application/pdf",
  "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "microsoft-sharepoint",
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

### `microsoft_sharepoint_shared_sites_list`

Use this when the SharePoint site id is unknown before file fetch or save. Lists SharePoint sites available to the connected account. Returns SharePoint site ids, names, and metadata. Current provider proxy returns the available site page without a continuation cursor.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `nextCursor` (union), `sites` (array)
- Inputs:
  - `connectedAccountId` (optional, string): Required when more than one connected SharePoint account exists; use microsoft_sharepoint_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.
- Outputs:
  - `accountEmail` (union): Microsoft account email used for this result. Example: `"client@example.com"`.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `sites` (array): SharePoint sites returned.
  - `sites[].modifiedAt` (union): Provider last-modified timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `sites[].name` (union): SharePoint site display name.
  - `sites[].siteId` (string): SharePoint site id to pass to file tools.
  - `sites[].webUrl` (union): Browser URL for opening the SharePoint site. Example: `"https://contoso.sharepoint.com/sites/example"`.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "nextCursor": "nextCursor_example",
  "sites": [
    {
      "modifiedAt": "2026-05-21T14:30:00.000Z",
      "name": "name_example",
      "siteId": "siteId_example",
      "webUrl": "https://contoso.sharepoint.com/sites/example"
    }
  ]
}
```

### `microsoft_todo_accounts_list`

Use this when the agent needs configured Microsoft To Do account choices for this profile. Lists enabled Microsoft To Do capability instances, including labels, provider, and connection health, without calling Microsoft Graph. Returns Microsoft To Do account metadata for choosing connectedAccountId. Use this before To Do reads or writes when multiple Microsoft accounts may exist.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accounts` (array)
- Inputs:
  - None
- Outputs:
  - `accounts` (array): Provider accounts available for this capability.
  - `accounts[].accountEmail` (union): Email address associated with the provider account when known. Example: `"client@example.com"`.
  - `accounts[].connected` (boolean): Whether credentials currently exist for this account.
  - `accounts[].connectedAccountId` (string): Connected provider account id to pass when selecting this account. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `accounts[].credentialStatus` (union): Credential readiness or blocker status reported by the backend.
  - `accounts[].label` (union): Human-readable account label, preferring provider identity such as email when known.
  - `accounts[].provider` (string): Provider slug for this connected account.
  - `accounts[].ready` (boolean): Whether the account is ready for provider tool calls.

Example input:
```json
{}
```

Example output:
```json
{
  "accounts": [
    {
      "accountEmail": "client@example.com",
      "connected": true,
      "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
      "credentialStatus": "credentialStatus_example",
      "label": "label_example",
      "provider": "provider_example",
      "ready": true
    }
  ]
}
```

### `microsoft_todo_lists_list`

Use this when the target Microsoft To Do task list id is unknown. Lists task lists from the connected Microsoft To Do account. Returns task list ids, display names, ownership, sharing, well-known list metadata, and pagination details. Call this before task reads or writes when the target list id must be chosen. Use the well-known defaultList entry for the user's main Tasks list when appropriate.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `lists` (array), `nextCursor` (union), `provider` ("microsoft-todo")
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from microsoft_todo_accounts_list when multiple Microsoft To Do accounts match. Do not use profile_context_get capability instance ids for this field.
  - `maxResults` (required, integer): Maximum provider records to return.
  - `nextPageToken` (optional, string): Provider nextCursor from a prior microsoft_todo_lists_list result.
- Outputs:
  - `accountEmail` (union): Microsoft account email used for this result. Example: `"client@example.com"`.
  - `lists` (array): Task lists returned by Microsoft To Do.
  - `lists[].displayName` (union): Task list display name.
  - `lists[].id` (string): Provider task list id.
  - `lists[].isOwner` (union): Whether the connected user owns this list.
  - `lists[].isShared` (union): Whether the list is shared.
  - `lists[].wellknownListName` (union): Microsoft well-known list name when supplied.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("microsoft-todo"): Task provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "maxResults": 50,
  "nextPageToken": "nextPageToken_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "lists": [
    {
      "displayName": "displayName_example",
      "id": "id_example",
      "isOwner": true,
      "isShared": true,
      "wellknownListName": "wellknownListName_example"
    }
  ],
  "nextCursor": "nextCursor_example",
  "provider": "microsoft-todo"
}
```

### `microsoft_todo_task_complete`

Use this when the user wants to mark a Microsoft To Do task complete. Marks one Microsoft To Do task as completed. Returns the write lifecycle status and safe failure details. External write: may complete a provider task or create an approval-governed Microsoft To Do action. Before calling, the exact task must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from microsoft_todo_accounts_list when multiple Microsoft To Do accounts match. Do not use profile_context_get capability instance ids for this field.
  - `listId` (required, string): Microsoft To Do task list id.
  - `taskId` (required, string): Microsoft To Do task id.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "listId": "listId_example",
  "taskId": "taskId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `microsoft_todo_task_create`

Use this when the user wants to add a Microsoft To Do task. Creates a task in a selected Microsoft To Do task list with title, optional body, importance, status, due date, start date, and reminder fields. Returns the write lifecycle status and safe failure details. External write: may create a provider task or create an approval-governed Microsoft To Do action. Before calling, the target task list and task title must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `bodyText` (optional, string): Optional task body as plain text.
  - `connectedAccountId` (optional, string): Connected provider account id from microsoft_todo_accounts_list when multiple Microsoft To Do accounts match. Do not use profile_context_get capability instance ids for this field.
  - `dueDateTime` (optional, object): Microsoft Graph dateTimeTimeZone value.
  - `dueDateTime.dateTime` (required, string): Provider date-time value, e.g. 2026-06-10T09:00:00.
  - `dueDateTime.timeZone` (required, string): Provider time zone value, e.g. Eastern Standard Time or America/Toronto.
  - `importance` (required, "low" | "normal" | "high"): Microsoft To Do task importance.
  - `isReminderOn` (optional, boolean): Whether Microsoft To Do should show a reminder for reminderDateTime.
  - `listId` (required, string): Microsoft To Do task list id.
  - `reminderDateTime` (optional, object): Microsoft Graph dateTimeTimeZone value.
  - `reminderDateTime.dateTime` (required, string): Provider date-time value, e.g. 2026-06-10T09:00:00.
  - `reminderDateTime.timeZone` (required, string): Provider time zone value, e.g. Eastern Standard Time or America/Toronto.
  - `startDateTime` (optional, object): Microsoft Graph dateTimeTimeZone value.
  - `startDateTime.dateTime` (required, string): Provider date-time value, e.g. 2026-06-10T09:00:00.
  - `startDateTime.timeZone` (required, string): Provider time zone value, e.g. Eastern Standard Time or America/Toronto.
  - `status` (required, "notStarted" | "inProgress" | "waitingOnOthers" | "deferred"): Task status for ordinary task updates; use microsoft_todo_task_complete to complete a task.
  - `title` (required, string): Task title.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "bodyText": "bodyText_example",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "dueDateTime": {
    "dateTime": "dateTime_example",
    "timeZone": "timeZone_example"
  },
  "importance": "low",
  "isReminderOn": true,
  "listId": "listId_example",
  "reminderDateTime": {
    "dateTime": "dateTime_example",
    "timeZone": "timeZone_example"
  },
  "startDateTime": {
    "dateTime": "dateTime_example",
    "timeZone": "timeZone_example"
  },
  "status": "notStarted",
  "title": "title_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `microsoft_todo_task_delete`

Use this when the user wants to delete a Microsoft To Do task. Deletes one Microsoft To Do task from a selected task list. Returns the write lifecycle status and safe failure details. External write: may permanently remove a provider task or create an approval-governed Microsoft To Do action. Before calling, the exact task must be clear because deletion is destructive.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from microsoft_todo_accounts_list when multiple Microsoft To Do accounts match. Do not use profile_context_get capability instance ids for this field.
  - `listId` (required, string): Microsoft To Do task list id.
  - `taskId` (required, string): Microsoft To Do task id.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "listId": "listId_example",
  "taskId": "taskId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `microsoft_todo_task_get`

Use this when exact Microsoft To Do task details are needed. Gets one task by provider list id and task id. Returns task details including body, status, dates, reminder, categories, and provider metadata. Use after microsoft_todo_tasks_list when a summary is not enough.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `listId` (string), `provider` ("microsoft-todo"), `task` (object), `taskId` (string)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from microsoft_todo_accounts_list when multiple Microsoft To Do accounts match. Do not use profile_context_get capability instance ids for this field.
  - `listId` (required, string): Microsoft To Do task list id.
  - `taskId` (required, string): Microsoft To Do task id.
- Outputs:
  - `accountEmail` (union): Microsoft account email used for this result. Example: `"client@example.com"`.
  - `listId` (string): Provider task list id containing the task.
  - `provider` ("microsoft-todo"): Task provider backing this result.
  - `task` (object): Requested Microsoft To Do task.
  - `task.body` (union): Task body content when supplied by the provider.
  - `task.bodyContentType` (union): Provider body content type.
  - `task.categories` (array): Outlook category names.
  - `task.completedDateTime` (union): Task completed date/time.
  - `task.completedDateTime.dateTime` (string): Provider date-time value, e.g. 2026-06-10T09:00:00.
  - `task.completedDateTime.timeZone` (string): Provider time zone value, e.g. Eastern Standard Time or America/Toronto.
  - `task.createdDateTime` (union): Provider-created timestamp.
  - `task.dueDateTime` (union): Task due date/time.
  - `task.dueDateTime.dateTime` (string): Provider date-time value, e.g. 2026-06-10T09:00:00.
  - `task.dueDateTime.timeZone` (string): Provider time zone value, e.g. Eastern Standard Time or America/Toronto.
  - `task.hasAttachments` (union): Whether the task has provider attachments.
  - `task.id` (string): Provider task id.
  - `task.importance` (union): Task importance.
  - `task.isReminderOn` (union): Whether reminders are enabled.
  - `task.lastModifiedDateTime` (union): Provider last modified timestamp.
  - `task.listId` (string): Provider task list id containing the task.
  - `task.reminderDateTime` (union): Task reminder date/time.
  - `task.reminderDateTime.dateTime` (string): Provider date-time value, e.g. 2026-06-10T09:00:00.
  - `task.reminderDateTime.timeZone` (string): Provider time zone value, e.g. Eastern Standard Time or America/Toronto.
  - `task.startDateTime` (union): Task start date/time.
  - `task.startDateTime.dateTime` (string): Provider date-time value, e.g. 2026-06-10T09:00:00.
  - `task.startDateTime.timeZone` (string): Provider time zone value, e.g. Eastern Standard Time or America/Toronto.
  - `task.status` (union): Task status.
  - `task.title` (union): Task title.
  - `taskId` (string): Provider task id requested.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "listId": "listId_example",
  "taskId": "taskId_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "listId": "listId_example",
  "provider": "microsoft-todo",
  "task": {
    "body": "body_example",
    "bodyContentType": "bodyContentType_example",
    "categories": [
      "categories_example"
    ],
    "completedDateTime": {
      "dateTime": "dateTime_example",
      "timeZone": "timeZone_example"
    },
    "createdDateTime": "createdDateTime_example",
    "dueDateTime": {
      "dateTime": "dateTime_example",
      "timeZone": "timeZone_example"
    },
    "hasAttachments": true,
    "id": "id_example",
    "importance": "low",
    "isReminderOn": true,
    "lastModifiedDateTime": "lastModifiedDateTime_example",
    "listId": "listId_example",
    "reminderDateTime": {
      "dateTime": "dateTime_example",
      "timeZone": "timeZone_example"
    },
    "startDateTime": {
      "dateTime": "dateTime_example",
      "timeZone": "timeZone_example"
    },
    "status": "notStarted",
    "title": "title_example"
  },
  "taskId": "taskId_example"
}
```

### `microsoft_todo_task_update`

Use this when the user wants to update an existing Microsoft To Do task. Updates one task with supplied changed fields; omitted fields are left unchanged. Returns the write lifecycle status and safe failure details. Use microsoft_todo_task_complete when the intended change is completing the task. External write: may modify a provider task or create an approval-governed Microsoft To Do action. Before calling, the exact task and at least one actual field change must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `bodyText` (optional, string): Replacement task body as plain text; omit to leave unchanged.
  - `connectedAccountId` (optional, string): Connected provider account id from microsoft_todo_accounts_list when multiple Microsoft To Do accounts match. Do not use profile_context_get capability instance ids for this field.
  - `dueDateTime` (optional, object): Microsoft Graph dateTimeTimeZone value.
  - `dueDateTime.dateTime` (required, string): Provider date-time value, e.g. 2026-06-10T09:00:00.
  - `dueDateTime.timeZone` (required, string): Provider time zone value, e.g. Eastern Standard Time or America/Toronto.
  - `importance` (optional, "low" | "normal" | "high"): Microsoft To Do task importance.
  - `isReminderOn` (optional, boolean): Whether the task reminder should be enabled.
  - `listId` (required, string): Microsoft To Do task list id.
  - `reminderDateTime` (optional, object): Microsoft Graph dateTimeTimeZone value.
  - `reminderDateTime.dateTime` (required, string): Provider date-time value, e.g. 2026-06-10T09:00:00.
  - `reminderDateTime.timeZone` (required, string): Provider time zone value, e.g. Eastern Standard Time or America/Toronto.
  - `startDateTime` (optional, object): Microsoft Graph dateTimeTimeZone value.
  - `startDateTime.dateTime` (required, string): Provider date-time value, e.g. 2026-06-10T09:00:00.
  - `startDateTime.timeZone` (required, string): Provider time zone value, e.g. Eastern Standard Time or America/Toronto.
  - `status` (optional, "notStarted" | "inProgress" | "waitingOnOthers" | "deferred"): Task status for ordinary task updates; use microsoft_todo_task_complete to complete a task.
  - `taskId` (required, string): Microsoft To Do task id.
  - `title` (optional, string): Task title.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "bodyText": "bodyText_example",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "dueDateTime": {
    "dateTime": "dateTime_example",
    "timeZone": "timeZone_example"
  },
  "importance": "low",
  "isReminderOn": true,
  "listId": "listId_example",
  "reminderDateTime": {
    "dateTime": "dateTime_example",
    "timeZone": "timeZone_example"
  },
  "startDateTime": {
    "dateTime": "dateTime_example",
    "timeZone": "timeZone_example"
  },
  "status": "notStarted",
  "taskId": "taskId_example",
  "title": "title_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `microsoft_todo_tasks_list`

Use this when the user needs Microsoft To Do task discovery or task list review. Lists tasks in one Microsoft To Do task list. Returns task summaries and pagination details. Call microsoft_todo_lists_list first when listId is unknown.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `listId` (string), `nextCursor` (union), `provider` ("microsoft-todo"), `tasks` (array)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from microsoft_todo_accounts_list when multiple Microsoft To Do accounts match. Do not use profile_context_get capability instance ids for this field.
  - `listId` (required, string): Microsoft To Do task list id.
  - `maxResults` (required, integer): Maximum provider records to return.
  - `nextPageToken` (optional, string): Provider nextCursor from a prior microsoft_todo_tasks_list result.
- Outputs:
  - `accountEmail` (union): Microsoft account email used for this result. Example: `"client@example.com"`.
  - `listId` (string): Provider task list id searched.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("microsoft-todo"): Task provider backing this result.
  - `tasks` (array): Tasks returned by Microsoft To Do.
  - `tasks[].categories` (array): Outlook category names.
  - `tasks[].completedDateTime` (union): Task completed date/time.
  - `tasks[].completedDateTime.dateTime` (string): Provider date-time value, e.g. 2026-06-10T09:00:00.
  - `tasks[].completedDateTime.timeZone` (string): Provider time zone value, e.g. Eastern Standard Time or America/Toronto.
  - `tasks[].dueDateTime` (union): Task due date/time.
  - `tasks[].dueDateTime.dateTime` (string): Provider date-time value, e.g. 2026-06-10T09:00:00.
  - `tasks[].dueDateTime.timeZone` (string): Provider time zone value, e.g. Eastern Standard Time or America/Toronto.
  - `tasks[].id` (string): Provider task id.
  - `tasks[].importance` (union): Task importance.
  - `tasks[].isReminderOn` (union): Whether reminders are enabled.
  - `tasks[].lastModifiedDateTime` (union): Provider last modified timestamp.
  - `tasks[].listId` (string): Provider task list id containing the task.
  - `tasks[].reminderDateTime` (union): Task reminder date/time.
  - `tasks[].reminderDateTime.dateTime` (string): Provider date-time value, e.g. 2026-06-10T09:00:00.
  - `tasks[].reminderDateTime.timeZone` (string): Provider time zone value, e.g. Eastern Standard Time or America/Toronto.
  - `tasks[].startDateTime` (union): Task start date/time.
  - `tasks[].startDateTime.dateTime` (string): Provider date-time value, e.g. 2026-06-10T09:00:00.
  - `tasks[].startDateTime.timeZone` (string): Provider time zone value, e.g. Eastern Standard Time or America/Toronto.
  - `tasks[].status` (union): Task status.
  - `tasks[].title` (union): Task title.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "listId": "listId_example",
  "maxResults": 50,
  "nextPageToken": "nextPageToken_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "listId": "listId_example",
  "nextCursor": "nextCursor_example",
  "provider": "microsoft-todo",
  "tasks": [
    {
      "categories": [
        "categories_example"
      ],
      "completedDateTime": {
        "dateTime": "dateTime_example",
        "timeZone": "timeZone_example"
      },
      "dueDateTime": {
        "dateTime": "dateTime_example",
        "timeZone": "timeZone_example"
      },
      "id": "id_example",
      "importance": "low",
      "isReminderOn": true,
      "lastModifiedDateTime": "lastModifiedDateTime_example",
      "listId": "listId_example",
      "reminderDateTime": {
        "dateTime": "dateTime_example",
        "timeZone": "timeZone_example"
      },
      "startDateTime": {
        "dateTime": "dateTime_example",
        "timeZone": "timeZone_example"
      },
      "status": "notStarted",
      "title": "title_example"
    }
  ]
}
```

### `mini_app_link_create`

Use this when the user needs a Telegram Mini App link for integrations or approvals. Creates a short-lived Telegram Mini App launch link. Returns Mini App link data safe to send in Telegram. Do not use this when a non-Telegram browser portal link is needed; use portal_link_create. External write: creates a short-lived Mini App launch intent. Before calling, the Telegram link target intent must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `link` (object)
- Inputs:
  - `intent` (required, union): Token-free Telegram Mini App launch target.
  - `section` (required, "integrations" | "approvals"): Connect portal section to open after Telegram Mini App sign-in.
- Outputs:
  - `link` (object): Telegram Mini App launch link.
  - `link.expiresAt` (string): Timestamp when this Mini App launch link expires. Example: `"2026-05-21T14:30:00.000Z"`.
  - `link.section` ("integrations" | "approvals"): Portal section the app opens.
  - `link.surface` ("telegram_mini_app"): Launch surface for this link.
  - `link.url` (string): Short-lived Telegram Mini App launch URL. Example: `"https://t.me/example_assistant_bot?startapp=abc123"`.

Example input:
```json
{
  "intent": {
    "type": "section"
  },
  "section": "integrations"
}
```

Example output:
```json
{
  "link": {
    "expiresAt": "2026-05-21T14:30:00.000Z",
    "section": "integrations",
    "surface": "telegram_mini_app",
    "url": "https://t.me/example_assistant_bot?startapp=abc123"
  }
}
```

### `monday_board_create`

Use this when the user wants to create a new Monday board. Creates a new Monday board in the connected account with optional workspace placement. Returns the write lifecycle status and safe failure details. Use monday_workspace_list when a specific workspace is requested. When completed, use the returned boardId directly for follow-up board, group, or column work. Creating a board does not require any schema refresh; follow-up structure tools can use returned provider ids directly. External write: may create a Monday board or create an approval-governed Monday action. Before calling, board name, kind, workspace intent, and empty-board intent must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `boardKind` (required, "public" | "private" | "share"): Monday board visibility kind: public, private, or share.
  - `boardName` (required, string): New board display name.
  - `description` (optional, string): Optional board description.
  - `empty` (optional, boolean): When true, create an empty board without default starter items.
  - `workspaceId` (optional, string): Monday workspace id to create the board in; omit for the main workspace.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "boardKind": "public",
  "boardName": "boardName_example",
  "description": "description_example",
  "empty": true,
  "workspaceId": "workspaceId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_board_delete`

Use this when the user wants to permanently delete a Monday board. Permanently deletes a Monday board by provider board id. Returns the write lifecycle status and safe failure details. Do not use this when the exact board is not confirmed; call monday_board_list or monday_board_get first. External write: may permanently delete a Monday board or create an approval-governed Monday action. Before calling, the exact board must be confirmed because this is destructive at the provider.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `boardId` (required, string): Monday provider board id to delete.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "boardId": "boardId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_board_get`

Use this when the agent needs exact columns, groups, labels, settings, and value hints before reading or writing items on a board. Fetches live detail for one Monday board by provider board id. Returns board identity, groups, columns, parsed status/dropdown labels, column settings, and raw columnValues hints. Use this before monday_item_create or monday_item_update unless fresh board detail is already available. For status/dropdown columns, choose labels from the returned labels when possible. Use group ids from this result for item creation, item moves, and group structure changes. Board detail explains column meaning; it does not make blank values blockers. A blank column becomes a blocker only when the board schema/status, checklist, template, user request, or another current source marks that field required. Provider ids are for tool calls and internal planning only; in client-visible replies, use human board, item, group, and column names unless the user explicitly asks for raw Monday ids.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `board` (object)
- Inputs:
  - `boardId` (required, string): Monday provider board id.
- Outputs:
  - `board` (object): Live Monday board detail for raw item writes.
  - `board.boardId` (string): Monday provider board id.
  - `board.columns` (array): Live columns on the Monday board.
  - `board.columns[].columnId` (string): Monday provider column id.
  - `board.columns[].labels` (array): Status/dropdown labels parsed from settings when available.
  - `board.columns[].settings` (union): Parsed Monday column settings JSON when available.
  - `board.columns[].settingsRaw` (union): Raw Monday settings_str when available.
  - `board.columns[].title` (string): Monday column title.
  - `board.columns[].type` (string): Monday provider column type.
  - `board.columns[].valueHint` (union): Common raw value shape hint.
  - `board.columns[].valueHint.columnType` (string): Monday provider column type.
  - `board.columns[].valueHint.example` (object): Example value for columnValues[columnId].
  - `board.columns[].valueHint.valueShape` (string): Short description of the accepted raw column value shape.
  - `board.groups` (array): Live groups on the Monday board.
  - `board.groups[].groupId` (string): Monday provider group id.
  - `board.groups[].title` (string): Monday group title.
  - `board.name` (string): Monday board display name.

Example input:
```json
{
  "boardId": "boardId_example"
}
```

Example output:
```json
{
  "board": {
    "boardId": "boardId_example",
    "columns": [
      {
        "columnId": "columnId_example",
        "labels": [
          "labels_example"
        ],
        "settings": null,
        "settingsRaw": "settingsRaw_example",
        "title": "title_example",
        "type": "type_example",
        "valueHint": {
          "columnType": "columnType_example",
          "example": null,
          "valueShape": "valueShape_example"
        }
      }
    ],
    "groups": [
      {
        "groupId": "groupId_example",
        "title": "title_example"
      }
    ],
    "name": "name_example"
  }
}
```

### `monday_board_list`

Use this when the agent needs live Monday board ids, board names, column ids, or group ids. Lists live Monday boards visible to the connected account with compact structure. Returns board ids, board names, group ids/titles, and column ids/titles/types. Use board ids and column ids exactly as returned by Monday. This is compact discovery; call monday_board_get for full labels, settings, and value hints before item writes. Provider ids are for tool calls and internal planning only; in client-visible replies, use human board, item, group, and column names unless the user explicitly asks for raw Monday ids.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `boards` (array)
- Inputs:
  - `limit` (optional, integer): Maximum boards to return.
  - `nameContains` (optional, string): Optional case-insensitive substring filter for board names.
- Outputs:
  - `boards` (array): Live Monday boards visible to the connected account.
  - `boards[].boardId` (string): Monday provider board id.
  - `boards[].columns` (array): Compact live columns on the Monday board.
  - `boards[].columns[].columnId` (string): Monday provider column id.
  - `boards[].columns[].title` (string): Monday column title.
  - `boards[].columns[].type` (string): Monday provider column type.
  - `boards[].groups` (array): Live groups on the Monday board.
  - `boards[].groups[].groupId` (string): Monday provider group id.
  - `boards[].groups[].title` (string): Monday group title.
  - `boards[].name` (string): Monday board display name.

Example input:
```json
{
  "limit": 1,
  "nameContains": "nameContains_example"
}
```

Example output:
```json
{
  "boards": [
    {
      "boardId": "boardId_example",
      "columns": [
        {
          "columnId": "columnId_example",
          "title": "title_example",
          "type": "type_example"
        }
      ],
      "groups": [
        {
          "groupId": "groupId_example",
          "title": "title_example"
        }
      ],
      "name": "name_example"
    }
  ]
}
```

### `monday_board_rename`

Use this when the user wants to rename an existing Monday board. Renames an existing Monday board by provider board id. Returns the write lifecycle status and safe failure details. Do not use this when the board id is uncertain; call monday_board_list first. External write: may rename a Monday board or create an approval-governed Monday action. Before calling, the exact board id and new board name must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `boardId` (required, string): Monday provider board id.
  - `name` (required, string): New board name.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "boardId": "boardId_example",
  "name": "name_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_column_create`

Use this when the user wants to add a column to a Monday board. Creates a Monday board column with a provider ColumnType. Returns the write lifecycle status and safe failure details. Do not use this when board id or Monday ColumnType is uncertain; call monday_board_get and monday_column_type_list first. External write: may create a Monday column or create an approval-governed Monday action. Before calling, board id, column title, and columnType must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `afterColumnId` (optional, string): Optional existing column id from monday_board_get to insert after.
  - `boardId` (required, string): Monday provider board id.
  - `columnType` (required, string): Monday ColumnType enum value, e.g. text, status, numbers; use monday_column_type_list for common supported examples.
  - `description` (optional, string): Optional column description.
  - `title` (required, string): Column title shown in Monday.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "afterColumnId": "afterColumnId_example",
  "boardId": "boardId_example",
  "columnType": "columnType_example",
  "description": "description_example",
  "title": "title_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_column_delete`

Use this when the user wants to remove a column from a Monday board. Deletes a Monday column by board id and column id. Returns the write lifecycle status and safe failure details. Do not use this when board id or column id is uncertain; call monday_board_get first. External write: may delete a Monday column or create an approval-governed Monday action. Before calling, the exact board and column must be confirmed because this can remove stored field data.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `boardId` (required, string): Monday provider board id.
  - `columnId` (required, string): Monday provider column id.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "boardId": "boardId_example",
  "columnId": "columnId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_column_rename`

Use this when the user wants to rename an existing Monday column. Changes the title of an existing column on a Monday board. Returns the write lifecycle status and safe failure details. Do not use this when board id, column id, or new title is uncertain; call monday_board_get first. External write: may rename a Monday column or create an approval-governed Monday action. Before calling, the exact board id, column id, and new title must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `boardId` (required, string): Monday provider board id.
  - `columnId` (required, string): Monday provider column id.
  - `title` (required, string): New column title.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "boardId": "boardId_example",
  "columnId": "columnId_example",
  "title": "title_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_column_type_list`

Use this when the agent needs examples for raw Monday column_values payloads. Returns common supported Monday column types and example columnValues shapes. Returns column type names, value shape notes, and JSON examples. Complex or uncommon Monday column types may still be writable when the user or agent supplies provider-correct JSON. Always key columnValues by exact column id from monday_board_get. Use monday_board_get as the source of actual board labels and settings; this tool only provides generic examples.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `columnTypes` (array)
- Inputs:
  - None
- Outputs:
  - `columnTypes` (array): Supported common Monday column value shapes.
  - `columnTypes[].columnType` (string): Monday provider column type.
  - `columnTypes[].example` (object): Example value for columnValues[columnId].
  - `columnTypes[].valueShape` (string): Short description of the accepted raw column value shape.

Example input:
```json
{}
```

Example output:
```json
{
  "columnTypes": [
    {
      "columnType": "columnType_example",
      "example": null,
      "valueShape": "valueShape_example"
    }
  ]
}
```

### `monday_file_add_to_column`

Use this when the user wants to attach a saved assistant artifact to a Monday file column on an item. Uploads one profile artifact to a Monday file column using Monday's native file column attachment API. Returns the write lifecycle status and safe failure details. Do not use this when the item id, file column id, or artifact id is uncertain; call monday_item_get, monday_board_get, and artifact tools first. External write: may upload a file to a Monday item file column or create an approval-governed Monday action. Before calling, verifies the item exists, the column belongs to the item's board and is a file column, and the artifact belongs to the profile before upload.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `columnId` (required, string): Monday file column id from monday_board_get for the item's board.
  - `expectedSha256` (optional, string): Optional expected SHA-256 hash for the artifact bytes being uploaded.
  - `itemId` (required, string): Numeric Monday item id that owns the file column.
  - `profileFileId` (required, string): Profile profile file id for a file already saved in assistant artifacts.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "columnId": "columnId_example",
  "expectedSha256": "expectedSha256_example",
  "itemId": "itemId_example",
  "profileFileId": "profileFileId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_file_add_to_update`

Use this when the user wants to attach a saved assistant artifact to an existing Monday item update/comment. Uploads one profile artifact to a Monday update/comment using Monday's native update attachment API. Returns the write lifecycle status and safe failure details. Do not use this when the update id or artifact id is uncertain; call monday_update_list/create and artifact tools first. External write: may upload a file attachment to a Monday update/comment or create an approval-governed Monday action. Before calling, verifies the artifact belongs to the profile before upload; updateId must come from Monday update tools or a fresh provider result.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `expectedSha256` (optional, string): Optional expected SHA-256 hash for the artifact bytes being uploaded.
  - `profileFileId` (required, string): Profile profile file id for a file already saved in assistant artifacts.
  - `updateId` (required, string): Numeric Monday update/comment id from monday_update_list or monday_update_create.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "expectedSha256": "expectedSha256_example",
  "profileFileId": "profileFileId_example",
  "updateId": "updateId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_group_create`

Use this when the user wants to create an empty group on a Monday board. Creates a Monday board group with optional relative placement. Returns the write lifecycle status and safe failure details. Do not use this when board id is uncertain; call monday_board_get first. Optional placement requires both relativeToGroupId and positionRelativeMethod. External write: may create a Monday group or create an approval-governed Monday action. Before calling, the board id, group name, and optional placement must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `boardId` (required, string): Monday provider board id.
  - `groupColor` (optional, string): Optional group color as hex, e.g. #ff642e.
  - `groupName` (required, string): New group name.
  - `positionRelativeMethod` (optional, "before_at" | "after_at"): When relativeToGroupId is set: before_at places above it; after_at below it.
  - `relativeToGroupId` (optional, string): Optional existing Monday group id from monday_board_get to position relative to.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "boardId": "boardId_example",
  "groupColor": "groupColor_example",
  "groupName": "groupName_example",
  "positionRelativeMethod": "before_at",
  "relativeToGroupId": "relativeToGroupId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_group_delete`

Use this when the user wants to delete a Monday group. Deletes a Monday group and all items in that group using Monday provider behavior. Returns the write lifecycle status and safe failure details. Do not use this when board id or group id is uncertain; call monday_board_get first. External write: may delete a Monday group and its items or create an approval-governed Monday action. Before calling, the exact board and group must be confirmed because this is a high-impact destructive write.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `boardId` (required, string): Monday provider board id.
  - `groupId` (required, string): Monday provider group id to delete.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "boardId": "boardId_example",
  "groupId": "groupId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_group_rename`

Use this when the user wants to rename a Monday board group. Renames a Monday board group by board id and provider group id. Returns the write lifecycle status and safe failure details. Do not use this when board id, group id, or new title is uncertain; call monday_board_get first. External write: may rename a Monday group or create an approval-governed Monday action. Before calling, the exact board id, group id, and new group title must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `boardId` (required, string): Monday provider board id.
  - `groupId` (required, string): Monday provider group id.
  - `title` (required, string): New group title.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "boardId": "boardId_example",
  "groupId": "groupId_example",
  "title": "title_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_item_archive`

Use this when the user wants to archive one or more Monday items. Archives Monday items by numeric item id. Returns the write lifecycle status and safe failure details. Do not use this when the exact item ids are uncertain; call monday_item_list or monday_item_get first. External write: may archive Monday items or create an approval-governed Monday action. Before calling, the exact item ids must be confirmed because archived items leave the active board view.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `targets` (required, array): Monday items to archive.
  - `targets[].itemId` (required, string): Numeric Monday item id from Monday.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "targets": [
    {
      "itemId": "itemId_example"
    }
  ]
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_item_create`

Use this when the user wants to create a new item on a Monday board. Creates a Monday item using provider board/group/column ids and raw Monday columnValues. Returns the write lifecycle status and safe failure details. Do not use this when board id, item name, or raw column ids are uncertain; call monday_board_get first. External write: may create a Monday item or create an approval-governed Monday action. Before calling, boardId/groupId must come from live board detail; columnValues keys must be exact column ids from monday_board_get.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `boardId` (required, string): Monday provider board id.
  - `columnValues` (optional, object): Monday-native column_values JSON keyed by exact provider column id from monday_board_get.
  - `groupId` (optional, string): Optional Monday group id for the new item, from monday_board_get for the same board.
  - `itemName` (required, string): Monday item name/title.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "boardId": "boardId_example",
  "columnValues": {},
  "groupId": "groupId_example",
  "itemName": "itemName_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_item_get`

Use this when the user needs one Monday item by item id. Fetches one live Monday item by numeric item id. Returns item id/name, board/group facts, and raw column values keyed by column id. Input is itemId only; do not pass boardId to this tool. Use this to verify the item board/group before update, archive, or move actions when the current context is stale. Provider ids are for tool calls and internal planning only; in client-visible replies, use human board, item, group, and column names unless the user explicitly asks for raw Monday ids.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `item` (object)
- Inputs:
  - `itemId` (required, string): Numeric Monday item id from Monday.
- Outputs:
  - `item` (object): Live Monday item detail.
  - `item.boardId` (string): Monday provider board id.
  - `item.boardName` (union): Monday board name.
  - `item.columnValuesById` (object): Raw Monday column values keyed by column id.
  - `item.groupId` (union): Monday group id.
  - `item.groupTitle` (union): Monday group title.
  - `item.itemId` (string): Monday item id.
  - `item.name` (union): Monday item title/name.
  - `item.state` (union): Monday item state.

Example input:
```json
{
  "itemId": "itemId_example"
}
```

Example output:
```json
{
  "item": {
    "boardId": "boardId_example",
    "boardName": "boardName_example",
    "columnValuesById": {},
    "groupId": "groupId_example",
    "groupTitle": "groupTitle_example",
    "itemId": "itemId_example",
    "name": "name_example",
    "state": "state_example"
  }
}
```

### `monday_item_list`

Use this when the user needs items from a known Monday board. Lists live Monday items from one board, optionally using Monday server-side column filters and sorting. Returns item ids, names, board/group facts, raw column values keyed by column id, and a pagination cursor for provider-paginated result sets. Pass boardId from monday_board_list or monday_board_get. Call monday_board_get before filters or orderBy so column ids, column types, and labels are fresh. Use filters with exact Monday column ids and Monday ItemsQuery compare values; do not use human labels as column ids or semantic field keys. For text contains filters, pass operator="contains_text" and compareValue as an array, for example filters: [{ columnId: "text_column_id", operator: "contains_text", compareValue: ["Northstar Holdings"] }]. Do not pass compareOperator. Use orderBy with exact Monday column ids. The cursor returned from a filtered/sorted provider query can be passed back by itself with boardId and limit. When groupId or titleContains is used, the backend performs a bounded local scan and returns nextCursor null because provider cursors cannot safely resume local filters. titleContains only searches item names. Results from titleContains alone prove title matches only; they do not prove a record is the only CRM match, the only possible match, the only item in CRM, or absent from CRM overall. For contact, company, address, phone, email, file/link, or other column facts, use monday_board_get to find exact column ids and then use filters; if you only searched titles, state that limitation. For a named client, contact, company, lead, or deal lookup, an unfiltered page of board items is not evidence that the record is absent. Use monday_board_get, then filter the relevant name/contact/company/email columns before saying Monday has no matching CRM row. For named deal status, next-action, verification, or co-broker/client update drafts where signatures may matter, Monday CRM is not complete current-state evidence by itself; also check live signature requests before drafting or recommending. When an item has a subtasks/subitems column and the user asks about required documents, checklist items, blockers, or next actions for that item, call monday_subitem_list for the parent item. Do not search Monday's generated subitems board with monday_item_list as a substitute for the parent item's subitem list. Blank or missing column values mean not recorded in the returned CRM row; they are not unresolved blockers unless the board schema, a file/link column, subitem checklist, status, or the user explicitly defines them as required. Do not put blank CRM fields under an unresolved-blockers heading; if useful, mention them separately as CRM cleanup or not-recorded fields. Use monday_item_get when an exact item id is known or when one selected item needs fresh detail before writing. If multiple plausible rows match a client or deal, do not pick the first row for a write; ask for the distinguishing row or use more evidence. Provider ids are for tool calls and internal planning only; in client-visible replies, use human board, item, group, and column names unless the user explicitly asks for raw Monday ids.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `boardId` (string), `items` (array), `nextCursor` (union)
- Inputs:
  - `boardId` (required, string): Monday provider board id.
  - `cursor` (optional, string): Monday items_page cursor. Use only with boardId and limit; do not combine cursor with filters, orderBy, titleContains, or groupId because the cursor already encodes the original provider query.
  - `filters` (optional, array): Server-side Monday ItemsQuery filters. Call monday_board_get first and use exact column ids. Example: { columnId: "text_column_id", operator: "contains_text", compareValue: ["Northstar Holdings"] }.
  - `filters[].columnId` (required, string): Exact Monday column id from monday_board_get for this board.
  - `filters[].compareAttribute` (optional, string): Optional Monday ItemsQuery compare_attribute for column types that require a specific attribute.
  - `filters[].compareValue` (required, array): Monday ItemsQuery compare_value array for this column type, such as ["Northstar Holdings"] for text contains_text.
  - `filters[].operator` (optional, string): Optional Monday ItemsQuery operator such as any_of, contains_text, greater_than, lower_than, between, is_empty, or is_not_empty. Use operator, not compareOperator.
  - `filtersOperator` (optional, "and" | "or"): Logical operator for combining filters. Defaults to and.
  - `groupId` (optional, string): Optional Monday group id to filter locally.
  - `limit` (optional, integer): Maximum returned items.
  - `orderBy` (optional, array): Server-side Monday ItemsQuery sort clauses using exact column ids from monday_board_get.
  - `orderBy[].columnId` (required, string): Exact Monday column id from monday_board_get for this board.
  - `orderBy[].direction` (optional, "asc" | "desc"): Sort direction. Defaults to Monday's provider default.
  - `titleContains` (optional, string): Optional case-insensitive substring filter against the Monday item title/name only. This does not search contact, company, email, address, file/link, or other CRM columns and cannot prove a result is the only CRM match.
- Outputs:
  - `boardId` (string): Monday provider board id listed.
  - `items` (array): Monday items returned.
  - `items[].boardId` (string): Monday provider board id.
  - `items[].boardName` (union): Monday board name.
  - `items[].columnValuesById` (object): Raw Monday column values keyed by column id.
  - `items[].groupId` (union): Monday group id.
  - `items[].groupTitle` (union): Monday group title.
  - `items[].itemId` (string): Monday item id.
  - `items[].name` (union): Monday item title/name.
  - `items[].state` (union): Monday item state.
  - `nextCursor` (union): Monday pagination cursor for the next unfiltered page; null for filtered local scans and end of pagination.

Example input:
```json
{
  "boardId": "boardId_example",
  "cursor": "cursor_example",
  "filters": [
    {
      "columnId": "columnId_example",
      "compareAttribute": "compareAttribute_example",
      "compareValue": [
        null
      ],
      "operator": "operator_example"
    }
  ],
  "filtersOperator": "and",
  "groupId": "groupId_example",
  "limit": 1,
  "orderBy": [
    {
      "columnId": "columnId_example",
      "direction": "asc"
    }
  ],
  "titleContains": "titleContains_example"
}
```

Example output:
```json
{
  "boardId": "boardId_example",
  "items": [
    {
      "boardId": "boardId_example",
      "boardName": "boardName_example",
      "columnValuesById": {},
      "groupId": "groupId_example",
      "groupTitle": "groupTitle_example",
      "itemId": "itemId_example",
      "name": "name_example",
      "state": "state_example"
    }
  ],
  "nextCursor": "nextCursor_example"
}
```

### `monday_item_move_to_group`

Use this when the user wants to move a Monday item to another group on the same board. Moves a Monday item by item id to a provider group id on a board. Returns the write lifecycle status and safe failure details. Do not use this when board id, item id, or destination group id is uncertain; call monday_board_get and monday_item_get/list first. External write: may move a Monday item or create an approval-governed Monday action. Before calling, verifies the item belongs to the board and destination group id must come from that same board.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `boardId` (required, string): Monday provider board id.
  - `groupId` (required, string): Destination Monday group id from monday_board_get for the same board.
  - `itemId` (required, string): Numeric Monday item id from Monday.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "boardId": "boardId_example",
  "groupId": "groupId_example",
  "itemId": "itemId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_item_update`

Use this when the user wants to update an existing Monday item. Updates item name and/or raw Monday columnValues by provider board id and item id. Returns the write lifecycle status and safe failure details. Do not use this when item id, board id, raw column ids, or exact target row are uncertain; multiple plausible rows matched; the update adds fields the user did not ask to change; or the current CRM value conflicts with another provider source and the user has not explicitly resolved the mismatch after you named both values. External write: may update a Monday item or create an approval-governed Monday action. Before calling, requires at least one requested change, verifies the item belongs to the board, requires exact column ids from monday_board_get, and requires a single unambiguous target row and source-of-truth value. Do not use this tool to test whether a conflicting CRM overwrite will be allowed. If you already know the CRM has one contact, company, address, phone, email, or financial value and another provider has a different value, do not call monday_item_update; first name both values and ask which one to keep. Do not add Last Touch, date, owner, status, cleanup, or housekeeping field changes unless the user explicitly requested those fields. A request like 'update CRM to match this PDF/email/signed mandate' is not conflict resolution when CRM already has a different contact, company, address, phone, email, or financial value.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `boardId` (required, string): Monday provider board id.
  - `columnValues` (optional, object): Monday-native column_values JSON keyed by exact provider column id from monday_board_get.
  - `itemId` (required, string): Numeric Monday item id from Monday.
  - `itemName` (optional, string): Optional new Monday item name/title.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "boardId": "boardId_example",
  "columnValues": {},
  "itemId": "itemId_example",
  "itemName": "itemName_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_subitem_archive`

Use this when the user wants to archive one or more Monday subitems. Archives Monday subitems by numeric subitem id. Returns the write lifecycle status and safe failure details. Do not use this when the exact subitem ids are uncertain; call monday_subitem_list first. External write: may archive Monday subitems or create an approval-governed Monday action. Before calling, the exact subitem ids must be confirmed because archived subitems leave the active parent item view.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `targets` (required, array): Monday subitems to archive.
  - `targets[].subitemId` (required, string): Numeric Monday subitem id.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "targets": [
    {
      "subitemId": "subitemId_example"
    }
  ]
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_subitem_create`

Use this when the user wants to add a checklist-style subitem under a Monday item. Creates a Monday subitem under a parent item, optionally with raw Monday columnValues. Returns the write lifecycle status and safe failure details. Do not use this when the parent item id is uncertain; call monday_item_list/get first. External write: may create a Monday subitem or create an approval-governed Monday action. Before calling, parentItemId must be exact; when columnValues are provided, keys must be Monday subitem board column ids from monday_subitem_list. If no subitem-board column ids are known yet, omit columnValues and update after discovery.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `columnValues` (optional, object): Monday-native subitem column_values JSON keyed by exact generated subitem-board column id from monday_subitem_list.
  - `itemName` (required, string): New Monday subitem title/name.
  - `parentItemId` (required, string): Numeric Monday parent item id to create the subitem under.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "columnValues": {},
  "itemName": "itemName_example",
  "parentItemId": "parentItemId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_subitem_list`

Use this when the user needs checklist-style subitems under a known Monday item. Lists live Monday subitems for one parent item. Returns parent item facts and subitem ids, names, board/group facts, and raw column values keyed by column id. Pass parentItemId from monday_item_list or monday_item_get. Use this for required-document checklists, blockers, missing tasks, and next-action rows under a parent CRM/deal item. Subitems live on Monday's generated subitems board; use returned subitem ids for subitem update/archive calls. Do not use monday_item_list against the generated subitems board to replace this call when the parent item is known. Provider ids are for tool calls and internal planning only; in client-visible replies, use human board, item, group, and column names unless the user explicitly asks for raw Monday ids.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `parentItem` (object), `subitems` (array)
- Inputs:
  - `limit` (optional, integer): Maximum subitems to return.
  - `parentItemId` (required, string): Numeric Monday parent item id whose subitems should be listed.
- Outputs:
  - `parentItem` (object): Live Monday parent item detail.
  - `parentItem.boardId` (string): Monday provider board id.
  - `parentItem.boardName` (union): Monday board name.
  - `parentItem.columnValuesById` (object): Raw Monday column values keyed by column id.
  - `parentItem.groupId` (union): Monday group id.
  - `parentItem.groupTitle` (union): Monday group title.
  - `parentItem.itemId` (string): Monday item id.
  - `parentItem.name` (union): Monday item title/name.
  - `parentItem.state` (union): Monday item state.
  - `subitems` (array): Live Monday subitems under the parent item.
  - `subitems[].boardId` (string): Monday provider board id.
  - `subitems[].boardName` (union): Monday board name.
  - `subitems[].columnValuesById` (object): Raw Monday column values keyed by column id.
  - `subitems[].groupId` (union): Monday group id.
  - `subitems[].groupTitle` (union): Monday group title.
  - `subitems[].itemId` (string): Monday item id.
  - `subitems[].name` (union): Monday item title/name.
  - `subitems[].state` (union): Monday item state.

Example input:
```json
{
  "limit": 1,
  "parentItemId": "parentItemId_example"
}
```

Example output:
```json
{
  "parentItem": {
    "boardId": "boardId_example",
    "boardName": "boardName_example",
    "columnValuesById": {},
    "groupId": "groupId_example",
    "groupTitle": "groupTitle_example",
    "itemId": "itemId_example",
    "name": "name_example",
    "state": "state_example"
  },
  "subitems": [
    {
      "boardId": "boardId_example",
      "boardName": "boardName_example",
      "columnValuesById": {},
      "groupId": "groupId_example",
      "groupTitle": "groupTitle_example",
      "itemId": "itemId_example",
      "name": "name_example",
      "state": "state_example"
    }
  ]
}
```

### `monday_subitem_update`

Use this when the user wants to rename a Monday subitem or update its subitem column values. Updates a Monday subitem name and/or raw Monday columnValues by subitem id. Returns the write lifecycle status and safe failure details. Do not use this when the exact subitem id or subitem column ids are uncertain; call monday_subitem_list first. External write: may update a Monday subitem or create an approval-governed Monday action. Before calling, requires at least one change and validates column ids against the subitem's live board when columnValues are supplied.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `columnValues` (optional, object): Monday-native subitem column_values JSON keyed by exact generated subitem-board column id from monday_subitem_list.
  - `itemName` (optional, string): Optional new Monday subitem title/name.
  - `subitemId` (required, string): Numeric Monday subitem id.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "columnValues": {},
  "itemName": "itemName_example",
  "subitemId": "subitemId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_update_create`

Use this when the user wants to post a comment, note, running-log entry, or update on an existing Monday item. Posts a top-level Monday update/comment on an item using Monday's native item updates surface. Returns the write lifecycle status and safe failure details. Do not use this when the exact item id is uncertain; call monday_item_list or monday_item_get first. Use this for running item comment logs instead of writing into a notes column when the user asks for Monday updates/comments. This posts to Monday's native item update/comment thread, not Monday's separate system Activity Log. The body may use simple Monday-supported HTML such as <b>, <i>, and <br>; do not use Markdown. External write: may create a visible Monday item update/comment or create an approval-governed Monday action. Before calling, the exact target item and comment body must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `body` (required, string): Update/comment body. Monday supports simple HTML tags such as <b>, <i>, and <br>; do not use Markdown.
  - `itemId` (required, string): Numeric Monday item id to post a top-level update/comment on.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "body": "body_example",
  "itemId": "itemId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_update_delete`

Use this when the user wants to delete a previously posted top-level Monday item update/comment. Deletes one top-level Monday update/comment by update id. Returns the write lifecycle status and safe failure details. Do not use this when the exact update id is uncertain; call monday_update_list first. This deletes from Monday's native item update/comment thread, not Monday's separate system Activity Log. This is for top-level item updates only; reply-to-update tools are not exposed. Provider ids are for tool calls and internal planning only; in client-visible replies, use human board, item, group, and column names unless the user explicitly asks for raw Monday ids. External write: may permanently remove a visible Monday item update/comment or create an approval-governed Monday action. Before calling, the exact target update/comment must be confirmed because deletion removes the visible comment.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `updateId` (required, string): Numeric top-level Monday update/comment id from monday_update_list or monday_update_create.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "updateId": "updateId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_update_edit`

Use this when the user wants to revise a previously posted top-level Monday item update/comment. Replaces the body of one top-level Monday update/comment by update id. Returns the write lifecycle status and safe failure details. Do not use this when the exact update id is uncertain; call monday_update_list first or use the id returned by monday_update_create. This edits Monday's native item update/comment thread, not Monday's separate system Activity Log. This is for top-level item updates only; reply-to-update tools are not exposed. The body may use simple Monday-supported HTML such as <b>, <i>, and <br>; do not use Markdown. Provider ids are for tool calls and internal planning only; in client-visible replies, use human board, item, group, and column names unless the user explicitly asks for raw Monday ids. External write: may replace a visible Monday item update/comment body or create an approval-governed Monday action. Before calling, the exact target update/comment and replacement body must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `body` (required, string): Full replacement update/comment body. Monday supports simple HTML tags such as <b>, <i>, and <br>; do not use Markdown.
  - `updateId` (required, string): Numeric top-level Monday update/comment id from monday_update_list or monday_update_create.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "body": "body_example",
  "updateId": "updateId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `monday_update_list`

Use this when the user needs comments, updates, notes, or running comment history posted on a known Monday item. Lists top-level Monday updates/comments from one item's native update thread, with optional threaded replies. Returns update ids, formatted and plain text bodies, timestamps, creator names, and replies when requested. Pass itemId from monday_item_list or monday_item_get. Use this for Monday's native item update/comment thread, not for column values or Monday's separate system Activity Log. Provider ids are for tool calls and internal planning only; in client-visible replies, use human board, item, group, and column names unless the user explicitly asks for raw Monday ids.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `itemId` (string), `limit` (integer), `page` (integer), `updates` (array)
- Inputs:
  - `includeReplies` (optional, boolean): When true, include threaded replies under each top-level item update.
  - `itemId` (required, string): Numeric Monday item id whose update/comment history should be read.
  - `limit` (optional, integer): Maximum updates to return.
  - `page` (optional, integer): Monday updates page number, starting at 1.
- Outputs:
  - `itemId` (string): Monday item id listed.
  - `limit` (integer): Requested page size.
  - `page` (integer): Returned Monday updates page number.
  - `updates` (array): Top-level Monday updates/comments returned.
  - `updates[].assets` (array): Files/assets attached to this update when returned by Monday.
  - `updates[].assets[].assetId` (string): Monday asset id.
  - `updates[].assets[].fileExtension` (union): Provider file extension when returned by Monday.
  - `updates[].assets[].fileSize` (union): Provider file size in bytes when returned by Monday.
  - `updates[].assets[].name` (union): Monday asset filename/name when available.
  - `updates[].assets[].publicUrl` (union): Provider public URL when returned by Monday.
  - `updates[].assets[].url` (union): Provider asset URL when returned by Monday.
  - `updates[].body` (union): Monday update body with provider formatting when available.
  - `updates[].createdAt` (union): Provider creation timestamp.
  - `updates[].creator` (object): Creator facts for the update.
  - `updates[].creator.name` (union): Monday creator display name when available.
  - `updates[].creator.userId` (union): Monday creator user id when available.
  - `updates[].itemId` (string): Monday item id the update belongs to.
  - `updates[].replies` (array): Threaded replies when includeReplies is true and Monday returns them.
  - `updates[].replies[].assets` (array): Files/assets attached to this reply when returned by Monday.
  - `updates[].replies[].assets[].assetId` (string): Monday asset id.
  - `updates[].replies[].assets[].fileExtension` (union): Provider file extension when returned by Monday.
  - `updates[].replies[].assets[].fileSize` (union): Provider file size in bytes when returned by Monday.
  - `updates[].replies[].assets[].name` (union): Monday asset filename/name when available.
  - `updates[].replies[].assets[].publicUrl` (union): Provider public URL when returned by Monday.
  - `updates[].replies[].assets[].url` (union): Provider asset URL when returned by Monday.
  - `updates[].replies[].body` (union): Reply body with provider formatting when available.
  - `updates[].replies[].createdAt` (union): Provider reply creation timestamp.
  - `updates[].replies[].creator` (object): Creator facts for the reply.
  - `updates[].replies[].creator.name` (union): Monday creator display name when available.
  - `updates[].replies[].creator.userId` (union): Monday creator user id when available.
  - `updates[].replies[].textBody` (union): Plain text reply body when returned by Monday.
  - `updates[].replies[].updatedAt` (union): Provider reply update timestamp.
  - `updates[].replies[].updateId` (string): Monday reply update id.
  - `updates[].textBody` (union): Plain text update body when returned by Monday.
  - `updates[].updatedAt` (union): Provider update timestamp.
  - `updates[].updateId` (string): Monday update/comment id.

Example input:
```json
{
  "includeReplies": true,
  "itemId": "itemId_example",
  "limit": 1,
  "page": 1
}
```

Example output:
```json
{
  "itemId": "itemId_example",
  "limit": 1,
  "page": 1,
  "updates": [
    {
      "assets": [
        {
          "assetId": "assetId_example",
          "fileExtension": "fileExtension_example",
          "fileSize": 1,
          "name": "name_example",
          "publicUrl": "publicUrl_example",
          "url": "url_example"
        }
      ],
      "body": "body_example",
      "createdAt": "createdAt_example",
      "creator": {
        "name": "name_example",
        "userId": "userId_example"
      },
      "itemId": "itemId_example",
      "replies": [
        {
          "assets": [
            {
              "assetId": "assetId_example",
              "fileExtension": "fileExtension_example",
              "fileSize": 1,
              "name": "name_example",
              "publicUrl": "publicUrl_example",
              "url": "url_example"
            }
          ],
          "body": "body_example",
          "createdAt": "createdAt_example",
          "creator": {
            "name": "name_example",
            "userId": "userId_example"
          },
          "textBody": "textBody_example",
          "updatedAt": "updatedAt_example",
          "updateId": "updateId_example"
        }
      ],
      "textBody": "textBody_example",
      "updatedAt": "updatedAt_example",
      "updateId": "updateId_example"
    }
  ]
}
```

### `monday_workspace_list`

Use this when the agent needs Monday workspace ids before creating a board in a specific workspace. Lists live Monday workspaces visible to the connected account. Returns workspace ids, names, and provider kind values. Only needed when the user names or implies a specific workspace for board creation.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `workspaces` (array)
- Inputs:
  - None
- Outputs:
  - `workspaces` (array): Live Monday workspaces visible to the connected account.
  - `workspaces[].kind` (union): Monday workspace kind/type when provided.
  - `workspaces[].name` (string): Monday workspace name.
  - `workspaces[].workspaceId` (string): Monday workspace id.

Example input:
```json
{}
```

Example output:
```json
{
  "workspaces": [
    {
      "kind": "kind_example",
      "name": "name_example",
      "workspaceId": "workspaceId_example"
    }
  ]
}
```

### `outlook_calendar_accounts_list`

Use this when the agent needs configured calendar account choices for this profile. Lists enabled calendar capability instances, including labels, provider, and connection health, without calling the provider. Returns calendar account metadata for choosing connectedAccountId. Use this before calendar reads or writes when multiple calendar accounts may exist.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accounts` (array)
- Inputs:
  - None
- Outputs:
  - `accounts` (array): Provider accounts available for this capability.
  - `accounts[].accountEmail` (union): Email address associated with the provider account when known. Example: `"client@example.com"`.
  - `accounts[].connected` (boolean): Whether credentials currently exist for this account.
  - `accounts[].connectedAccountId` (string): Connected provider account id to pass when selecting this account. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `accounts[].credentialStatus` (union): Credential readiness or blocker status reported by the backend.
  - `accounts[].label` (union): Human-readable account label, preferring provider identity such as email when known.
  - `accounts[].provider` (string): Provider slug for this connected account.
  - `accounts[].ready` (boolean): Whether the account is ready for provider tool calls.

Example input:
```json
{}
```

Example output:
```json
{
  "accounts": [
    {
      "accountEmail": "client@example.com",
      "connected": true,
      "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
      "credentialStatus": "credentialStatus_example",
      "label": "label_example",
      "provider": "provider_example",
      "ready": true
    }
  ]
}
```

### `outlook_calendar_calendars_list`

Use this when the target provider calendar id is unknown. Lists calendars from the connected provider account. Returns calendar ids, names, and provider calendar metadata. Use before event reads or writes when the target calendar id must be chosen. Pass connectedAccountId from outlook_calendar_accounts_list when multiple calendar accounts may exist.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `calendars` (array), `nextCursor` (union), `provider` ("outlook-calendar")
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from outlook_calendar_accounts_list when multiple Outlook calendars match. Do not use profile_context_get capability instance ids for this field.
  - `maxResults` (required, integer): Maximum calendars to return.
  - `nextPageToken` (optional, string): Provider pagination token from a prior outlook_calendar_calendars_list result.
- Outputs:
  - `accountEmail` (union): Calendar account email used for this result. Example: `"client@example.com"`.
  - `calendars` (array): Calendars returned by the provider.
  - `calendars[].description` (union): Calendar description.
  - `calendars[].id` (string): Provider calendar id.
  - `calendars[].name` (union): Calendar display name.
  - `calendars[].primary` (boolean): Whether this is the account's primary calendar.
  - `calendars[].timezone` (union): Calendar IANA timezone when provided by the provider. Example: `"America/Toronto"`.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("outlook-calendar"): Calendar provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "maxResults": 100,
  "nextPageToken": "nextPageToken_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "calendars": [
    {
      "description": "description_example",
      "id": "id_example",
      "name": "name_example",
      "primary": true,
      "timezone": "America/Toronto"
    }
  ],
  "nextCursor": "nextCursor_example",
  "provider": "outlook-calendar"
}
```

### `outlook_calendar_event_cancel`

Use this when the user wants to cancel or delete a calendar event. Cancels or deletes one calendar event using provider attendee notification semantics. Returns the write lifecycle status and safe failure details. sendUpdates controls whether attendees receive cancellation notices when supported. External write: may remove or cancel a provider calendar event, notify attendees, or create an approval-governed calendar action. Before calling, the exact event and attendee notification intent must be clear because this is destructive.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `calendarId` (required, string): Provider calendar id, or primary for the account's default calendar.
  - `cancellationMessage` (optional, string): Optional cancellation message sent through the provider when supported.
  - `connectedAccountId` (optional, string): Connected provider account id from outlook_calendar_accounts_list when multiple Outlook calendars match. Do not use profile_context_get capability instance ids for this field.
  - `eventId` (required, string): Provider event id.
  - `sendUpdates` (required, "all" | "external_only" | "none"): Provider attendee notification mode for create, update, or cancel.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "calendarId": "calendarId_example",
  "cancellationMessage": "cancellationMessage_example",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "eventId": "eventId_example",
  "sendUpdates": "all"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `outlook_calendar_event_create`

Use this when the user wants to create a calendar event. Creates an event on a connected provider calendar, including attendees, location, description, and conferencing when supplied. Returns the write lifecycle status and safe failure details. External write: may create a provider calendar event, email attendees depending on sendUpdates, request provider conferencing, or create an approval-governed calendar action. Before calling, calendar, title, time range, attendees, notification intent, and conferencing intent must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `attendees` (required, array): Attendees to invite.
  - `attendees[].displayName` (optional, string): Optional attendee display name.
  - `attendees[].email` (required, string): Attendee email address.
  - `calendarId` (required, string): Provider calendar id, or primary for the account's default calendar.
  - `conferencePreference` (required, "provider_default" | "none"): Whether to request the provider's default conferencing link or no conference link.
  - `connectedAccountId` (optional, string): Connected provider account id from outlook_calendar_accounts_list when multiple Outlook calendars match. Do not use profile_context_get capability instance ids for this field.
  - `description` (optional, string): Optional event body/description.
  - `end` (required, object): Calendar event instant with explicit date-time and IANA time zone.
  - `end.dateTime` (required, string): ISO 8601 date-time with offset.
  - `end.timeZone` (required, string): IANA time zone, e.g. America/Toronto.
  - `location` (optional, string): Optional event location.
  - `sendUpdates` (required, "all" | "external_only" | "none"): Provider attendee notification mode for create, update, or cancel.
  - `start` (required, object): Calendar event instant with explicit date-time and IANA time zone.
  - `start.dateTime` (required, string): ISO 8601 date-time with offset.
  - `start.timeZone` (required, string): IANA time zone, e.g. America/Toronto.
  - `title` (required, string): Event title.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "attendees": [],
  "calendarId": "primary",
  "conferencePreference": "provider_default",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "description": "description_example",
  "end": {
    "dateTime": "2026-05-21T14:30:00.000Z",
    "timeZone": "timeZone_example"
  },
  "location": "location_example",
  "sendUpdates": "all",
  "start": {
    "dateTime": "2026-05-21T14:30:00.000Z",
    "timeZone": "timeZone_example"
  },
  "title": "title_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `outlook_calendar_event_get`

Use this when exact calendar event details are needed. Gets one calendar event by provider event id from a specific calendar. Returns event details, timing, attendees, conferencing, and provider metadata. Use after outlook_calendar_events_list when you have an event id but need full event details not present in summaries. For Outlook reads, pass timeZone when returned event times should be normalized to a specific IANA timezone.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `calendarId` (string), `event` (object), `eventId` (string), `provider` ("outlook-calendar")
- Inputs:
  - `calendarId` (required, string): Provider calendar id, or primary for the account's default calendar.
  - `connectedAccountId` (optional, string): Connected provider account id from outlook_calendar_accounts_list when multiple Outlook calendars match. Do not use profile_context_get capability instance ids for this field.
  - `eventId` (required, string): Provider event id.
  - `timeZone` (optional, string): Optional for Outlook reads (Prefer outlook.timezone header on Graph).
- Outputs:
  - `accountEmail` (union): Calendar account email used for this result. Example: `"client@example.com"`.
  - `calendarId` (string): Calendar id containing the event.
  - `event` (object): Requested calendar event.
  - `event.allDay` (boolean): Whether this is an all-day event.
  - `event.attendees` (array): Event attendees.
  - `event.attendees[].email` (string): Attendee email address. Example: `"client@example.com"`.
  - `event.attendees[].name` (union): Attendee display name.
  - `event.attendees[].responseStatus` (union): Provider attendee response status, when known.
  - `event.calendarId` (string): Provider calendar id containing the event.
  - `event.description` (union): Event body or description.
  - `event.end` (union): Event end timestamp, or null when unavailable. Example: `"2026-05-21T15:00:00.000Z"`.
  - `event.id` (string): Provider event id.
  - `event.location` (union): Event location.
  - `event.meetingUrl` (union): Online meeting URL, when the event has one. Example: `"https://meet.google.com/abc-defg-hij"`.
  - `event.organizer` (union): Event organizer, when known.
  - `event.organizer.email` (string): Attendee email address. Example: `"client@example.com"`.
  - `event.organizer.name` (union): Attendee display name.
  - `event.organizer.responseStatus` (union): Provider attendee response status, when known.
  - `event.start` (union): Event start timestamp, or null when unavailable. Example: `"2026-05-21T14:30:00.000Z"`.
  - `event.status` (union): Provider event status.
  - `event.title` (union): Event title.
  - `eventId` (string): Provider event id requested.
  - `provider` ("outlook-calendar"): Calendar provider backing this result.

Example input:
```json
{
  "calendarId": "primary",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "eventId": "eventId_example",
  "timeZone": "timeZone_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "calendarId": "calendarId_example",
  "event": {
    "allDay": true,
    "attendees": [
      {
        "email": "client@example.com",
        "name": "name_example",
        "responseStatus": "responseStatus_example"
      }
    ],
    "calendarId": "calendarId_example",
    "description": "description_example",
    "end": "2026-05-21T15:00:00.000Z",
    "id": "id_example",
    "location": "location_example",
    "meetingUrl": "https://meet.google.com/abc-defg-hij",
    "organizer": {
      "email": "client@example.com",
      "name": "name_example",
      "responseStatus": "responseStatus_example"
    },
    "start": "2026-05-21T14:30:00.000Z",
    "status": "status_example",
    "title": "title_example"
  },
  "eventId": "eventId_example",
  "provider": "outlook-calendar"
}
```

### `outlook_calendar_event_update`

Use this when the user wants to update an existing calendar event. Updates one provider calendar event with the supplied changed fields; sendUpdates only controls attendee notifications. Returns the write lifecycle status and safe failure details. When attendees is supplied, it replaces the entire attendee list; omit it to leave attendees unchanged. External write: may modify a provider calendar event, email attendees depending on sendUpdates, or create an approval-governed calendar action. Before calling, the exact calendar event and at least one actual field change must be clear; sendUpdates alone is not a valid update.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `attendees` (optional, array): Replacement attendee list; omit to leave attendees unchanged.
  - `attendees[].displayName` (optional, string): Optional attendee display name.
  - `attendees[].email` (required, string): Attendee email address.
  - `calendarId` (required, string): Provider calendar id, or primary for the account's default calendar.
  - `conferencePreference` (optional, "provider_default" | "none"): Whether to request the provider's default conferencing link or no conference link.
  - `connectedAccountId` (optional, string): Connected provider account id from outlook_calendar_accounts_list when multiple Outlook calendars match. Do not use profile_context_get capability instance ids for this field.
  - `description` (optional, string): New event body/description; omit to leave unchanged.
  - `end` (optional, object): Calendar event instant with explicit date-time and IANA time zone.
  - `end.dateTime` (required, string): ISO 8601 date-time with offset.
  - `end.timeZone` (required, string): IANA time zone, e.g. America/Toronto.
  - `eventId` (required, string): Provider event id.
  - `location` (optional, string): New event location; omit to leave unchanged.
  - `sendUpdates` (required, "all" | "external_only" | "none"): Provider attendee notification mode for create, update, or cancel.
  - `start` (optional, object): Calendar event instant with explicit date-time and IANA time zone.
  - `start.dateTime` (required, string): ISO 8601 date-time with offset.
  - `start.timeZone` (required, string): IANA time zone, e.g. America/Toronto.
  - `title` (optional, string): Event title.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "attendees": [
    {
      "displayName": "displayName_example",
      "email": "email_example"
    }
  ],
  "calendarId": "calendarId_example",
  "conferencePreference": "provider_default",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "description": "description_example",
  "end": {
    "dateTime": "2026-05-21T14:30:00.000Z",
    "timeZone": "timeZone_example"
  },
  "eventId": "eventId_example",
  "location": "location_example",
  "sendUpdates": "all",
  "start": {
    "dateTime": "2026-05-21T14:30:00.000Z",
    "timeZone": "timeZone_example"
  },
  "title": "title_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `outlook_calendar_events_list`

Use this when the user needs Outlook schedule review or time-window event discovery. Lists events in a bounded time window from one Outlook calendar. Returns calendar event summaries and pagination details. calendarId is required on every call; omit it only when the default primary calendar is intended (schema default). Use calendarId primary for the user's default calendar when they did not name a specific calendar; call outlook_calendar_calendars_list when a non-default calendar id is needed. Pass an IANA timeZone with timeMin and timeMax so the provider interprets the event window correctly.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `calendarId` (string), `events` (array), `nextCursor` (union), `provider` ("outlook-calendar")
- Inputs:
  - `calendarId` (required, string): Provider calendar id, or primary for the account's default calendar.
  - `connectedAccountId` (optional, string): Connected provider account id from outlook_calendar_accounts_list when multiple Outlook calendars match. Do not use profile_context_get capability instance ids for this field.
  - `maxResults` (required, integer): Maximum events to return.
  - `nextPageToken` (optional, string): Outlook pagination token from a prior outlook_calendar_events_list result.
  - `timeMax` (required, string): Exclusive ISO 8601 window end.
  - `timeMin` (required, string): Inclusive ISO 8601 window start.
  - `timeZone` (required, string): IANA time zone, e.g. America/Toronto.
- Outputs:
  - `accountEmail` (union): Calendar account email used for this result. Example: `"client@example.com"`.
  - `calendarId` (string): Calendar id searched or listed.
  - `events` (array): Calendar events returned.
  - `events[].allDay` (boolean): Whether this is an all-day event.
  - `events[].calendarId` (string): Provider calendar id containing the event.
  - `events[].end` (union): Event end timestamp, or null when unavailable. Example: `"2026-05-21T15:00:00.000Z"`.
  - `events[].id` (string): Provider event id.
  - `events[].location` (union): Event location.
  - `events[].meetingUrl` (union): Online meeting URL, when the event has one. Example: `"https://meet.google.com/abc-defg-hij"`.
  - `events[].organizer` (union): Event organizer, when known.
  - `events[].organizer.email` (string): Attendee email address. Example: `"client@example.com"`.
  - `events[].organizer.name` (union): Attendee display name.
  - `events[].organizer.responseStatus` (union): Provider attendee response status, when known.
  - `events[].start` (union): Event start timestamp, or null when unavailable. Example: `"2026-05-21T14:30:00.000Z"`.
  - `events[].status` (union): Provider event status.
  - `events[].title` (union): Event title.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("outlook-calendar"): Calendar provider backing this result.

Example input:
```json
{
  "calendarId": "primary",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "maxResults": 50,
  "nextPageToken": "nextPageToken_example",
  "timeMax": "2026-05-21T14:30:00.000Z",
  "timeMin": "2026-05-21T14:30:00.000Z",
  "timeZone": "timeZone_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "calendarId": "calendarId_example",
  "events": [
    {
      "allDay": true,
      "calendarId": "calendarId_example",
      "end": "2026-05-21T15:00:00.000Z",
      "id": "id_example",
      "location": "location_example",
      "meetingUrl": "https://meet.google.com/abc-defg-hij",
      "organizer": {
        "email": "client@example.com",
        "name": "name_example",
        "responseStatus": "responseStatus_example"
      },
      "start": "2026-05-21T14:30:00.000Z",
      "status": "status_example",
      "title": "title_example"
    }
  ],
  "nextCursor": "nextCursor_example",
  "provider": "outlook-calendar"
}
```

### `outlook_calendar_free_slots_find`

Use this when the user needs scheduling suggestions before proposing meeting times. Finds contiguous free slots meeting a minimum duration across selected calendars and a bounded time window. Returns candidate free time slots that satisfy the requested duration. Pass an IANA timeZone with timeMin and timeMax so slot calculation uses the intended timezone.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `calendarsChecked` (integer), `freeSlots` (array), `provider` ("outlook-calendar")
- Inputs:
  - `calendarIds` (required, array): Calendar ids to consider when finding free slots.
  - `connectedAccountId` (optional, string): Connected provider account id from outlook_calendar_accounts_list when multiple Outlook calendars match. Do not use profile_context_get capability instance ids for this field.
  - `durationMinutes` (required, integer): Minimum contiguous free duration to return, in minutes.
  - `timeMax` (required, string): Exclusive ISO 8601 window end.
  - `timeMin` (required, string): Inclusive ISO 8601 window start.
  - `timeZone` (required, string): IANA time zone, e.g. America/Toronto.
- Outputs:
  - `accountEmail` (union): Calendar account email used for this result. Example: `"client@example.com"`.
  - `calendarsChecked` (integer): Number of calendars checked for availability.
  - `freeSlots` (array): Available slots found.
  - `freeSlots[].durationMinutes` (integer): Free slot duration in minutes.
  - `freeSlots[].end` (string): Free slot end timestamp. Example: `"2026-05-21T15:00:00.000Z"`.
  - `freeSlots[].start` (string): Free slot start timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `provider` ("outlook-calendar"): Calendar provider backing this result.

Example input:
```json
{
  "calendarIds": [
    "calendarIds_example"
  ],
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "durationMinutes": 1,
  "timeMax": "2026-05-21T14:30:00.000Z",
  "timeMin": "2026-05-21T14:30:00.000Z",
  "timeZone": "timeZone_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "calendarsChecked": 1,
  "freeSlots": [
    {
      "durationMinutes": 1,
      "end": "2026-05-21T15:00:00.000Z",
      "start": "2026-05-21T14:30:00.000Z"
    }
  ],
  "provider": "outlook-calendar"
}
```

### `outlook_calendar_freebusy_query`

Use this when raw occupied intervals are needed before suggesting availability. Queries busy blocks across selected calendars for a bounded time window. Returns busy intervals grouped by calendar. Pass an IANA timeZone with timeMin and timeMax so busy intervals are interpreted in the intended timezone.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `busy` (array), `calendarIds` (array), `provider` ("outlook-calendar"), `timeMax` (string), `timeMin` (string)
- Inputs:
  - `calendarIds` (required, array): Calendar ids to query for busy blocks.
  - `connectedAccountId` (optional, string): Connected provider account id from outlook_calendar_accounts_list when multiple Outlook calendars match. Do not use profile_context_get capability instance ids for this field.
  - `timeMax` (required, string): Exclusive ISO 8601 availability window end.
  - `timeMin` (required, string): Inclusive ISO 8601 availability window start.
  - `timeZone` (required, string): IANA time zone, e.g. America/Toronto.
- Outputs:
  - `accountEmail` (union): Calendar account email used for this result. Example: `"client@example.com"`.
  - `busy` (array): Busy blocks returned by the provider.
  - `busy[].calendarId` (string): Calendar id that has this busy block.
  - `busy[].end` (string): Busy block end timestamp. Example: `"2026-05-21T15:00:00.000Z"`.
  - `busy[].start` (string): Busy block start timestamp. Example: `"2026-05-21T14:30:00.000Z"`.
  - `calendarIds` (array): Calendar ids included in the query.
  - `provider` ("outlook-calendar"): Calendar provider backing this result.
  - `timeMax` (string): Exclusive availability window end.
  - `timeMin` (string): Inclusive availability window start.

Example input:
```json
{
  "calendarIds": [
    "calendarIds_example"
  ],
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "timeMax": "2026-05-21T14:30:00.000Z",
  "timeMin": "2026-05-21T14:30:00.000Z",
  "timeZone": "timeZone_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "busy": [
    {
      "calendarId": "calendarId_example",
      "end": "2026-05-21T15:00:00.000Z",
      "start": "2026-05-21T14:30:00.000Z"
    }
  ],
  "calendarIds": [
    "calendarIds_example"
  ],
  "provider": "outlook-calendar",
  "timeMax": "timeMax_example",
  "timeMin": "timeMin_example"
}
```

### `outlook_mail_accounts_list`

Use this when the agent needs configured Outlook Mail mailbox choices for this profile. Lists enabled Outlook Mail capability instances, including labels and connection health, without calling the provider. Returns mailbox account metadata for choosing connectedAccountId. Use this before mailbox reads or writes when multiple mailboxes may exist.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accounts` (array)
- Inputs:
  - None
- Outputs:
  - `accounts` (array): Provider accounts available for this capability.
  - `accounts[].accountEmail` (union): Email address associated with the provider account when known. Example: `"client@example.com"`.
  - `accounts[].connected` (boolean): Whether credentials currently exist for this account.
  - `accounts[].connectedAccountId` (string): Connected provider account id to pass when selecting this account. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `accounts[].credentialStatus` (union): Credential readiness or blocker status reported by the backend.
  - `accounts[].label` (union): Human-readable account label, preferring provider identity such as email when known.
  - `accounts[].provider` (string): Provider slug for this connected account.
  - `accounts[].ready` (boolean): Whether the account is ready for provider tool calls.

Example input:
```json
{}
```

Example output:
```json
{
  "accounts": [
    {
      "accountEmail": "client@example.com",
      "connected": true,
      "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
      "credentialStatus": "credentialStatus_example",
      "label": "label_example",
      "provider": "provider_example",
      "ready": true
    }
  ]
}
```

### `outlook_mail_attachment_save`

Use this when an Outlook Mail attachment must be reused, delivered later, or passed to another tool. Downloads one Outlook Mail attachment and stores it as a bounded profile artifact for later delivery or provider/tool handoff. Returns saved artifact metadata and safe failure details. Use outlook_mail_accounts_list to pick connectedAccountId when multiple mailboxes are enabled. External write: creates a durable profile artifact but does not send the file by itself. Before calling, the source message id and attachment id must identify the intended attachment.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `accountEmail` (union), `byteSize` (integer), `filename` (string), `mimeType` (string), `profileFileId` (string), `provider` (string), `sha256` (string)
- Inputs:
  - `attachmentId` (required, string): Provider attachment id.
  - `connectedAccountId` (optional, string): Connected provider account id from outlook_mail_accounts_list when multiple Outlook mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `filename` (optional, string): Stored artifact filename.
  - `messageId` (required, string): Provider message id containing the attachment.
- Outputs:
  - `accountEmail` (union): Provider account email used to fetch or create the artifact, when known. Example: `"client@example.com"`.
  - `byteSize` (integer): Profile file size in bytes. Example: `24576`.
  - `filename` (string): Stored profile-file filename including extension. Example: `"signed-agreement.pdf"`.
  - `mimeType` (string): MIME type of the saved artifact. Example: `"application/pdf"`.
  - `profileFileId` (string): Durable profile file id for the saved file. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `provider` (string): Provider that produced the saved profile file.
  - `sha256` (string): SHA-256 hex digest for stale-file protection. Example: `"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`.

Example input:
```json
{
  "attachmentId": "attachmentId_example",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "filename_example",
  "messageId": "messageId_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "byteSize": 24576,
  "filename": "signed-agreement.pdf",
  "mimeType": "application/pdf",
  "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "provider_example",
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

### `outlook_mail_message_delete`

Use this when the user wants to delete or trash an Outlook Mail message. Deletes or trashes one Outlook Mail message using provider-specific deletion semantics. Returns the write lifecycle status and safe failure details. External write: may remove a mailbox message or create an approval-governed Outlook Mail action. Before calling, the exact message must be confirmed because this is a destructive mailbox write.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from outlook_mail_accounts_list when multiple Outlook mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `messageId` (required, string): Provider message id to delete or move to trash (provider-specific).
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "messageId": "messageId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `outlook_mail_message_forward`

Use this when the user wants to forward an existing Outlook Mail message. Forwards an existing provider message preview/snippet to new recipients, optionally with a short prepended comment. Returns the write lifecycle status and safe failure details. Do not use this when replying to the existing thread; use outlook_mail_message_reply instead. Forward content is limited to the provider message preview/snippet, not the full original body. Forward attachments are not supported. External write: may send a forwarded Outlook Mail message or create an approval-governed Outlook Mail action. Before calling, the source message, recipients, and optional comment intent must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `additionalComment` (optional, string): Optional short comment to prepend.
  - `bcc` (required, array): BCC recipients for the forwarded email.
  - `cc` (required, array): CC recipients for the forwarded email.
  - `connectedAccountId` (optional, string): Connected provider account id from outlook_mail_accounts_list when multiple Outlook mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `forwardMessageId` (required, string): Provider message id to forward.
  - `to` (required, array): Primary recipients for the forwarded email.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "additionalComment": "additionalComment_example",
  "bcc": [],
  "cc": [],
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "forwardMessageId": "forwardMessageId_example",
  "to": [
    "to_example"
  ]
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `outlook_mail_message_get`

Use this when exact Outlook Mail content, thread metadata, or attachment ids are needed. Reads one mailbox message by provider message id. Returns message content, message metadata, thread metadata, and attachment metadata. Use after outlook_mail_messages_search when the message id is not already known.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `message` (object), `provider` ("outlook-mail")
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from outlook_mail_accounts_list when multiple Outlook mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `messageId` (required, string): Provider message id.
- Outputs:
  - `accountEmail` (union): Email account used for this result. Example: `"client@example.com"`.
  - `message` (object): Requested email message.
  - `message.attachments` (array): Attachments on this message.
  - `message.attachments[].byteSize` (union): Attachment size in bytes.
  - `message.attachments[].filename` (union): Attachment filename.
  - `message.attachments[].id` (string): Provider attachment id.
  - `message.attachments[].mimeType` (union): Attachment MIME type. Example: `"application/pdf"`.
  - `message.bcc` (array): BCC recipient mailbox identities.
  - `message.bcc[].email` (string): Email address. Example: `"client@example.com"`.
  - `message.bcc[].name` (union): Display name for this email address.
  - `message.bodyText` (union): Plain text email body, when available.
  - `message.bodyTruncated` (boolean): Whether bodyText was truncated and may not contain the full email body.
  - `message.canReply` (boolean): Whether this message can be used as a reply target.
  - `message.cc` (array): CC recipient mailbox identities.
  - `message.cc[].email` (string): Email address. Example: `"client@example.com"`.
  - `message.cc[].name` (union): Display name for this email address.
  - `message.from` (union): Sender mailbox identity, when available.
  - `message.from.email` (string): Email address. Example: `"client@example.com"`.
  - `message.from.name` (union): Display name for this email address.
  - `message.id` (string): Provider message id.
  - `message.labels` (array): Provider labels or folder markers.
  - `message.provider` ("outlook-mail"): Email provider backing this message.
  - `message.receivedAt` (union): Timestamp when the email was received, when available. Convert offset/Z timestamps before telling the client a local date or time. Example: `"2026-05-21T14:30:00.000Z"`.
  - `message.sentAt` (union): Timestamp when the email was sent, when available. Convert offset/Z timestamps before telling the client a local date or time. Example: `"2026-05-21T14:30:00.000Z"`.
  - `message.snippet` (union): Provider-supplied message preview text.
  - `message.subject` (union): Email subject.
  - `message.threadId` (union): Provider thread id, when available.
  - `message.to` (array): Primary recipient mailbox identities.
  - `message.to[].email` (string): Email address. Example: `"client@example.com"`.
  - `message.to[].name` (union): Display name for this email address.
  - `provider` ("outlook-mail"): Email provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "messageId": "messageId_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "message": {
    "attachments": [
      {
        "byteSize": 1,
        "filename": "filename_example",
        "id": "id_example",
        "mimeType": "application/pdf"
      }
    ],
    "bcc": [
      {
        "email": "client@example.com",
        "name": "name_example"
      }
    ],
    "bodyText": "bodyText_example",
    "bodyTruncated": true,
    "canReply": true,
    "cc": [
      {
        "email": "client@example.com",
        "name": "name_example"
      }
    ],
    "from": {
      "email": "client@example.com",
      "name": "name_example"
    },
    "id": "id_example",
    "labels": [
      "labels_example"
    ],
    "provider": "outlook-mail",
    "receivedAt": "2026-05-21T14:30:00.000Z",
    "sentAt": "2026-05-21T14:30:00.000Z",
    "snippet": "snippet_example",
    "subject": "subject_example",
    "threadId": "threadId_example",
    "to": [
      {
        "email": "client@example.com",
        "name": "name_example"
      }
    ]
  },
  "provider": "outlook-mail"
}
```

### `outlook_mail_message_mark_read`

Use this when the user wants to mark an Outlook Mail message read or unread. Changes the read state for one provider mailbox message. Returns the write lifecycle status and safe failure details. Use isRead=true for read and isRead=false for unread. External write: may update mailbox message state or create an approval-governed Outlook Mail action. Before calling, the exact message and desired read state must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from outlook_mail_accounts_list when multiple Outlook mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `isRead` (required, boolean): true marks the message read; false marks it unread.
  - `messageId` (required, string): Provider message id.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "isRead": true,
  "messageId": "messageId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `outlook_mail_message_move`

Use this when the user wants to move an Outlook Mail message to another Outlook folder. Moves one Outlook Mail message using Outlook folder semantics. Returns the write lifecycle status and safe failure details. Use an Outlook folder id from prior mailbox context or client guidance. External write: may move a mailbox message or create an approval-governed Outlook Mail action. Before calling, the exact message and destination folder must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from outlook_mail_accounts_list when multiple Outlook mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `destinationMailboxId` (required, string): Destination Outlook folder id.
  - `messageId` (required, string): Provider message id.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "destinationMailboxId": "destinationMailboxId_example",
  "messageId": "messageId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `outlook_mail_message_reply`

Use this when the user wants to reply to an existing Outlook Mail message. Submits a reply through provider reply semantics for the existing message thread. Returns the write lifecycle status and safe failure details. Do not use this when sending a new standalone Outlook Mail message; use outlook_mail_message_send instead. Outlook replies use provider-normal reply targeting from the original message. Reply attachments are not supported. External write: may send an Outlook Mail reply or create an approval-governed Outlook Mail action. Before calling, the source message and reply body must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `bodyText` (required, string): Plain text reply body.
  - `connectedAccountId` (optional, string): Connected provider account id from outlook_mail_accounts_list when multiple Outlook mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `replyToMessageId` (required, string): Provider message id to reply to.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "bodyText": "bodyText_example",
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "replyToMessageId": "replyToMessageId_example"
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `outlook_mail_message_send`

Use this when the user wants to send a new outbound Outlook Mail message. Submits a new Outlook Mail message through the connected Outlook Mail provider with idempotency plus profileFileIds ownership and expectedProfileFileSha256ById checks for optional attachments. Returns the write lifecycle status and safe failure details. Do not use this when replying to or forwarding an existing message; use outlook_mail_message_reply or outlook_mail_message_forward instead. External write: may send an Outlook Mail message or create an approval-governed Outlook Mail action. Before calling, to, subject, bodyText, and attachment intent must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `bcc` (required, array): BCC recipients for the outbound email.
  - `bodyText` (required, string): Plain text email body.
  - `cc` (required, array): CC recipients for the outbound email.
  - `connectedAccountId` (optional, string): Connected provider account id from outlook_mail_accounts_list when multiple Outlook mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `expectedProfileFileSha256ById` (required, object): Optional stale-file protection map keyed by profile file id; keys must also appear in profileFileIds.
  - `profileFileIds` (required, array): Profile files to attach to the outbound email.
  - `subject` (required, string): Email subject.
  - `to` (required, array): Primary recipients for the outbound email.
- Outputs:
  - `write` (object): External write result. Example: `{"result":"The email was queued to alex@example.com with subject \"Follow-up\".","actionId":"550e8400-e29b-41d4-a716-446655440000","status":"completed"}`.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "bcc": [],
  "bodyText": "bodyText_example",
  "cc": [],
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "expectedProfileFileSha256ById": {},
  "profileFileIds": [],
  "subject": "subject_example",
  "to": [
    "to_example"
  ]
}
```

Example output:
```json
{
  "write": {
    "result": "The email was queued to alex@example.com with subject \"Follow-up\".",
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed"
  }
}
```

### `outlook_mail_messages_search`

Use this when the user needs mailbox messages found or listed from the connected provider. Searches or lists Outlook mailbox messages using Graph search text, folder selection, and pagination where supported. Returns message summaries and pagination details. When the user explicitly asks for an Outlook Mail or mailbox search, stay within Outlook Mail tools unless the user asks to broaden the search or an Outlook Mail result points to an attachment/file workflow. Default search scope is the inbox folder unless folderId is set. To include archive, junk, or trash, broaden explicitly with Outlook folderId values such as archive, junkemail, or deleteditems. Use query for Outlook search text, folderId for another Outlook folder, and messagesPageCursor for additional pages. For broad receipt, invoice, or accounting searches, search every relevant connectedAccountId and folder scope, follow messagesPageCursor until exhausted, and inspect likely hits with outlook_mail_message_get before claiming completeness.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `accountEmail` (union), `messages` (array), `nextCursor` (union), `provider` ("outlook-mail")
- Inputs:
  - `connectedAccountId` (optional, string): Connected provider account id from outlook_mail_accounts_list when multiple Outlook mailboxes match. Do not use profile_context_get capability instance ids for this field.
  - `folderId` (optional, string): Outlook mail folder id (default inbox). Use well-known ids such as archive, junkemail, or deleteditems to search archive, junk, or trash.
  - `limit` (optional, integer): Alias for maxResults when the agent naturally thinks in result limits.
  - `maxResults` (optional, integer): Maximum messages to return. Defaults to 25.
  - `messagesPageCursor` (optional, string): Outlook pagination cursor from a previous outlook_mail_messages_search result.
  - `query` (optional, string): Outlook Microsoft Graph search text. Default scope uses the inbox folder unless folderId selects another folder.
- Outputs:
  - `accountEmail` (union): Email account used for this result. Example: `"client@example.com"`.
  - `messages` (array): Messages matching the search.
  - `messages[].attachments` (array): Attachments on this message.
  - `messages[].attachments[].byteSize` (union): Attachment size in bytes.
  - `messages[].attachments[].filename` (union): Attachment filename.
  - `messages[].attachments[].id` (string): Provider attachment id.
  - `messages[].attachments[].mimeType` (union): Attachment MIME type. Example: `"application/pdf"`.
  - `messages[].canReply` (boolean): Whether this message can be used as a reply target.
  - `messages[].from` (union): Sender mailbox identity, when available.
  - `messages[].from.email` (string): Email address. Example: `"client@example.com"`.
  - `messages[].from.name` (union): Display name for this email address.
  - `messages[].id` (string): Provider message id.
  - `messages[].provider` ("outlook-mail"): Email provider backing this message.
  - `messages[].receivedAt` (union): Timestamp when the email was received, when available. Convert offset/Z timestamps before telling the client a local date or time. Example: `"2026-05-21T14:30:00.000Z"`.
  - `messages[].snippet` (union): Provider-supplied message preview text.
  - `messages[].subject` (union): Email subject.
  - `messages[].threadId` (union): Provider thread id, when available.
  - `nextCursor` (union): Pagination cursor for the next page, or null when there is no next page.
  - `provider` ("outlook-mail"): Email provider backing this result.

Example input:
```json
{
  "connectedAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "folderId": "folderId_example",
  "limit": 1,
  "maxResults": 1,
  "messagesPageCursor": "messagesPageCursor_example",
  "query": "query_example"
}
```

Example output:
```json
{
  "accountEmail": "client@example.com",
  "messages": [
    {
      "attachments": [
        {
          "byteSize": 1,
          "filename": "filename_example",
          "id": "id_example",
          "mimeType": "application/pdf"
        }
      ],
      "canReply": true,
      "from": {
        "email": "client@example.com",
        "name": "name_example"
      },
      "id": "id_example",
      "provider": "outlook-mail",
      "receivedAt": "2026-05-21T14:30:00.000Z",
      "snippet": "snippet_example",
      "subject": "subject_example",
      "threadId": "threadId_example"
    }
  ],
  "nextCursor": "nextCursor_example",
  "provider": "outlook-mail"
}
```

### `phone_call_list`

Use this when recent phone call attempts need review. Lists recent bounded phone call attempts for this profile, optionally filtered to one attempt status. Returns recent call attempts and statuses.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `attempts` (array)
- Inputs:
  - `limit` (required, integer): Maximum number of call attempts to list.
  - `status` (optional, "pending_start" | "starting" | "in_progress" | "completed" | "no_answer" | "failed" | "unknown"): Product status for a bounded phone call attempt.
- Outputs:
  - `attempts` (array): Recent phone call attempts.
  - `attempts[].attemptId` (string): Backend phone call attempt id.
  - `attempts[].callId` (string): Repo-owned durable call id.
  - `attempts[].country` ("US" | "CA"): Destination country allowed for phone calls in v1.
  - `attempts[].createdAt` (string): Attempt record creation timestamp.
  - `attempts[].durationSeconds` (union): Call duration in seconds when known.
  - `attempts[].endedAt` (union): Call attempt end timestamp when known.
  - `attempts[].failureKind` (union): Stable failure category when the call attempt failed.
  - `attempts[].failureMessage` (union): Safe failure detail when the call attempt failed.
  - `attempts[].provider` ("twilio-voice"): Voice provider used for the attempt.
  - `attempts[].providerCallSid` (union): Twilio CallSid when known.
  - `attempts[].providerParentCallSid` (union): Twilio parent CallSid when known.
  - `attempts[].providerStatus` (union): Raw provider status when known.
  - `attempts[].providerStatusUpdatedAt` (union): Timestamp for the last raw provider status sync.
  - `attempts[].purpose` (string): Call purpose.
  - `attempts[].startedAt` (union): Call attempt start timestamp.
  - `attempts[].status` ("pending_start" | "starting" | "in_progress" | "completed" | "no_answer" | "failed" | "unknown"): Product status for a bounded phone call attempt.
  - `attempts[].summary` (union): Safe call summary when available.
  - `attempts[].terminalReason` (union): Terminal reason when the call attempt has ended.
  - `attempts[].toPhoneE164` (string): Destination phone number in E.164 format.
  - `attempts[].updatedAt` (string): Attempt record update timestamp.
  - `attempts[].verifiedPhoneSourceUrl` (string): Source URL used to verify the destination phone.

Example input:
```json
{
  "limit": 10,
  "status": "pending_start"
}
```

Example output:
```json
{
  "attempts": [
    {
      "attemptId": "550e8400-e29b-41d4-a716-446655440000",
      "callId": "callId_example",
      "country": "US",
      "createdAt": "createdAt_example",
      "durationSeconds": 1,
      "endedAt": "endedAt_example",
      "failureKind": "failureKind_example",
      "failureMessage": "failureMessage_example",
      "provider": "twilio-voice",
      "providerCallSid": "providerCallSid_example",
      "providerParentCallSid": "providerParentCallSid_example",
      "providerStatus": "providerStatus_example",
      "providerStatusUpdatedAt": "providerStatusUpdatedAt_example",
      "purpose": "purpose_example",
      "startedAt": "startedAt_example",
      "status": "pending_start",
      "summary": "summary_example",
      "terminalReason": "terminalReason_example",
      "toPhoneE164": "toPhoneE164_example",
      "updatedAt": "updatedAt_example",
      "verifiedPhoneSourceUrl": "https://example.com/item"
    }
  ]
}
```

### `phone_call_readiness_get`

Use this when the user asks whether the assistant can place calls or before preparing any phone call. Checks whether required Twilio Voice settings and webhook configuration are available without placing a call. Returns configuration readiness, current provider mode label, and concrete setup blockers.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `blockers` (array), `mode` ("mock" | "dry_run" | "live" | "unavailable"), `provider` ("twilio-voice"), `ready` (boolean)
- Inputs:
  - None
- Outputs:
  - `blockers` (array): Concrete setup blockers.
  - `mode` ("mock" | "dry_run" | "live" | "unavailable"): Current provider mode.
  - `provider` ("twilio-voice"): Twilio Voice provider label.
  - `ready` (boolean): Whether bounded phone calling can start calls now.

Example input:
```json
{}
```

Example output:
```json
{
  "blockers": [
    "blockers_example"
  ],
  "mode": "mock",
  "provider": "twilio-voice",
  "ready": true
}
```

### `phone_call_start`

Use this when the user explicitly approves one bounded phone call after destination and call brief are clear. Prepares or starts one approval-governed phone call attempt through the bounded repo-owned call surface. Returns the write lifecycle status and attempt facts when started. External write: may place a real phone call when provider readiness checks pass. Before calling, requires verified E.164 US/Canada destination, explicit approval context, authorized facts, decision bounds, and stop conditions; never use for payments, credentials, MFA, medical/legal advice, or sensitive identity data.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `callBrief` (required, object): Bounded, approval-reviewed call brief for one phone call attempt.
  - `callBrief.authorizedFacts` (required, array): Only these facts may be shared during the call.
  - `callBrief.country` (required, "US" | "CA"): Destination country allowed for phone calls in v1.
  - `callBrief.decisionBounds` (required, array): Things the assistant may or may not agree to without returning to the user.
  - `callBrief.disclosureName` (required, string): Name the assistant may use to identify who it is calling for.
  - `callBrief.disclosureRelationship` (required, string): How to describe the assistant's relationship to the user, such as assistant for Thierry.
  - `callBrief.holdTimeoutSeconds` (required, integer): Maximum time to remain on hold before ending or reporting back.
  - `callBrief.maxDurationSeconds` (required, integer): Maximum call duration in seconds.
  - `callBrief.openingLine` (required, string): Exact first sentence to say after connection. Include the concrete requested outcome and essential constraints already present in purpose or authorizedFacts, such as date/time, party size, name, service, and fallback window when relevant.
  - `callBrief.purpose` (required, string): Plain-language reason for the call.
  - `callBrief.resultExpectations` (required, array): Facts to report after the call, such as available times or confirmation number.
  - `callBrief.retryPolicy` (required, object): Retry policy for this bounded call attempt.
  - `callBrief.retryPolicy.maxAttempts` (required, integer): Maximum call attempts for v1. Must be 1; retries require a later explicit plan.
  - `callBrief.stopConditions` (required, array): Hard stop conditions for the live call.
  - `callBrief.toPhoneE164` (required, string): Destination phone number in E.164 format.
  - `callBrief.verifiedPhoneSourceLabel` (required, string): Short label for the source that verified the phone.
  - `callBrief.verifiedPhoneSourceUrl` (required, string): Public source URL or provider evidence URL that verified the destination phone.
- Outputs:
  - `write` (object): External write result.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.facts` (object): Minimal structured facts for follow-up tool use.
  - `write.facts.attemptId` (string): Backend phone call attempt id.
  - `write.facts.callId` (string): Repo-owned durable call id.
  - `write.facts.provider` ("twilio-voice"): Voice provider used for the attempt.
  - `write.facts.providerCallSid` (union): Twilio CallSid when known.
  - `write.facts.providerParentCallSid` (union): Twilio parent CallSid when known.
  - `write.facts.providerStatus` (union): Raw provider status when known.
  - `write.facts.providerStatusUpdatedAt` (union): Timestamp for the last raw provider status sync.
  - `write.facts.status` ("pending_start" | "starting" | "in_progress" | "completed" | "no_answer" | "failed" | "unknown"): Product status for a bounded phone call attempt.
  - `write.facts.toPhoneE164` (string): Destination phone number in E.164 format.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "callBrief": {
    "authorizedFacts": [
      "authorizedFacts_example"
    ],
    "country": "US",
    "decisionBounds": [
      "decisionBounds_example"
    ],
    "disclosureName": "disclosureName_example",
    "disclosureRelationship": "disclosureRelationship_example",
    "holdTimeoutSeconds": 60,
    "maxDurationSeconds": 300,
    "openingLine": "openingLine_example",
    "purpose": "purpose_example",
    "resultExpectations": [
      "resultExpectations_example"
    ],
    "retryPolicy": {
      "maxAttempts": 1
    },
    "stopConditions": [
      "stopConditions_example"
    ],
    "toPhoneE164": "toPhoneE164_example",
    "verifiedPhoneSourceLabel": "verifiedPhoneSourceLabel_example",
    "verifiedPhoneSourceUrl": "https://example.com/item"
  }
}
```

Example output:
```json
{
  "write": {
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "facts": {
      "attemptId": "550e8400-e29b-41d4-a716-446655440000",
      "callId": "callId_example",
      "provider": "twilio-voice",
      "providerCallSid": "providerCallSid_example",
      "providerParentCallSid": "providerParentCallSid_example",
      "providerStatus": "providerStatus_example",
      "providerStatusUpdatedAt": "providerStatusUpdatedAt_example",
      "status": "pending_start",
      "toPhoneE164": "toPhoneE164_example"
    },
    "failure": {
      "field": "field_example",
      "kind": "auth",
      "message": "message_example",
      "recovery": "reconnect_account",
      "retryable": true,
      "retryAfterMs": 1
    },
    "result": "result_example",
    "status": "needs_review"
  }
}
```

### `phone_call_status_get`

Use this when one phone call attempt needs current status or result facts, using either attemptId or the actionId returned by phone_call_start. Reads one bounded phone call attempt and syncs active live attempts with the voice provider when possible. Returns call attempt status, provider id, safe summary, and failure facts.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `attempt` (object)
- Inputs:
  - `actionId` (optional, string): Profile action id returned by phone_call_start when attemptId is not known.
  - `attemptId` (optional, string): Backend phone call attempt id.
- Outputs:
  - `attempt` (object): Requested phone call attempt.
  - `attempt.attemptId` (string): Backend phone call attempt id.
  - `attempt.callId` (string): Repo-owned durable call id.
  - `attempt.country` ("US" | "CA"): Destination country allowed for phone calls in v1.
  - `attempt.createdAt` (string): Attempt record creation timestamp.
  - `attempt.durationSeconds` (union): Call duration in seconds when known.
  - `attempt.endedAt` (union): Call attempt end timestamp when known.
  - `attempt.failureKind` (union): Stable failure category when the call attempt failed.
  - `attempt.failureMessage` (union): Safe failure detail when the call attempt failed.
  - `attempt.provider` ("twilio-voice"): Voice provider used for the attempt.
  - `attempt.providerCallSid` (union): Twilio CallSid when known.
  - `attempt.providerParentCallSid` (union): Twilio parent CallSid when known.
  - `attempt.providerStatus` (union): Raw provider status when known.
  - `attempt.providerStatusUpdatedAt` (union): Timestamp for the last raw provider status sync.
  - `attempt.purpose` (string): Call purpose.
  - `attempt.startedAt` (union): Call attempt start timestamp.
  - `attempt.status` ("pending_start" | "starting" | "in_progress" | "completed" | "no_answer" | "failed" | "unknown"): Product status for a bounded phone call attempt.
  - `attempt.summary` (union): Safe call summary when available.
  - `attempt.terminalReason` (union): Terminal reason when the call attempt has ended.
  - `attempt.toPhoneE164` (string): Destination phone number in E.164 format.
  - `attempt.updatedAt` (string): Attempt record update timestamp.
  - `attempt.verifiedPhoneSourceUrl` (string): Source URL used to verify the destination phone.

Example input:
```json
{
  "actionId": "550e8400-e29b-41d4-a716-446655440000",
  "attemptId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Example output:
```json
{
  "attempt": {
    "attemptId": "550e8400-e29b-41d4-a716-446655440000",
    "callId": "callId_example",
    "country": "US",
    "createdAt": "createdAt_example",
    "durationSeconds": 1,
    "endedAt": "endedAt_example",
    "failureKind": "failureKind_example",
    "failureMessage": "failureMessage_example",
    "provider": "twilio-voice",
    "providerCallSid": "providerCallSid_example",
    "providerParentCallSid": "providerParentCallSid_example",
    "providerStatus": "providerStatus_example",
    "providerStatusUpdatedAt": "providerStatusUpdatedAt_example",
    "purpose": "purpose_example",
    "startedAt": "startedAt_example",
    "status": "pending_start",
    "summary": "summary_example",
    "terminalReason": "terminalReason_example",
    "toPhoneE164": "toPhoneE164_example",
    "updatedAt": "updatedAt_example",
    "verifiedPhoneSourceUrl": "https://example.com/item"
  }
}
```

### `phone_sms_list`

Use this when recent SMS attempts need review. Lists recent bounded SMS attempts for this profile, optionally filtered to one attempt status. Returns recent SMS attempts and statuses.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `attempts` (array)
- Inputs:
  - `limit` (required, integer): Maximum number of SMS attempts to list.
  - `status` (optional, "queued" | "sent" | "delivered" | "undelivered" | "failed" | "unknown"): Product status for one SMS attempt.
- Outputs:
  - `attempts` (array): Recent SMS attempts.
  - `attempts[].attemptId` (string): Backend SMS attempt id.
  - `attempts[].bodyPreview` (string): Safe short preview of the SMS body.
  - `attempts[].country` ("US" | "CA"): Destination country allowed for phone calls in v1.
  - `attempts[].createdAt` (string): SMS attempt record creation timestamp.
  - `attempts[].deliveredAt` (union): Timestamp when Twilio reported delivery, when known.
  - `attempts[].destinationEvidenceKind` ("public_phone_source" | "prior_inbound_sms"): Evidence type that authorized the SMS destination.
  - `attempts[].failureKind` (union): Stable failure category when the SMS attempt failed.
  - `attempts[].failureMessage` (union): Safe failure detail when the SMS attempt failed.
  - `attempts[].fromPhoneE164` (union): Configured Twilio sender phone number when known.
  - `attempts[].provider` ("twilio-messaging"): SMS provider used for the attempt.
  - `attempts[].providerMessageSid` (union): Twilio MessageSid.
  - `attempts[].providerStatus` (union): Raw provider status when known.
  - `attempts[].providerStatusUpdatedAt` (union): Timestamp for the last raw provider status sync.
  - `attempts[].purpose` (string): SMS purpose.
  - `attempts[].relatedCallAttemptId` (union): Phone call attempt this SMS follows up on, when applicable.
  - `attempts[].replyToMessageSid` (union): Inbound Twilio MessageSid this SMS replies to, when applicable.
  - `attempts[].sentAt` (union): Timestamp when the SMS was sent.
  - `attempts[].status` ("queued" | "sent" | "delivered" | "undelivered" | "failed" | "unknown"): Product status for one SMS attempt.
  - `attempts[].toPhoneE164` (string): Destination phone number in E.164 format.
  - `attempts[].updatedAt` (string): SMS attempt record update timestamp.
  - `attempts[].verifiedPhoneSourceLabel` (union): Short label for the public phone source when applicable.
  - `attempts[].verifiedPhoneSourceUrl` (union): Public URL used to verify the destination phone when applicable.

Example input:
```json
{
  "limit": 10,
  "status": "queued"
}
```

Example output:
```json
{
  "attempts": [
    {
      "attemptId": "550e8400-e29b-41d4-a716-446655440000",
      "bodyPreview": "bodyPreview_example",
      "country": "US",
      "createdAt": "createdAt_example",
      "deliveredAt": "deliveredAt_example",
      "destinationEvidenceKind": "public_phone_source",
      "failureKind": "failureKind_example",
      "failureMessage": "failureMessage_example",
      "fromPhoneE164": "fromPhoneE164_example",
      "provider": "twilio-messaging",
      "providerMessageSid": "providerMessageSid_example",
      "providerStatus": "providerStatus_example",
      "providerStatusUpdatedAt": "providerStatusUpdatedAt_example",
      "purpose": "purpose_example",
      "relatedCallAttemptId": "550e8400-e29b-41d4-a716-446655440000",
      "replyToMessageSid": "replyToMessageSid_example",
      "sentAt": "sentAt_example",
      "status": "queued",
      "toPhoneE164": "toPhoneE164_example",
      "updatedAt": "updatedAt_example",
      "verifiedPhoneSourceLabel": "verifiedPhoneSourceLabel_example",
      "verifiedPhoneSourceUrl": "https://example.com/item"
    }
  ]
}
```

### `phone_sms_readiness_get`

Use this when the user asks whether the assistant can send text messages or before preparing any SMS when setup is uncertain. Checks whether required Twilio messaging settings are configured without sending an SMS. Returns configuration readiness, current provider mode label, and concrete setup blockers.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `blockers` (array), `mode` ("mock" | "dry_run" | "live" | "unavailable"), `provider` ("twilio-messaging"), `ready` (boolean)
- Inputs:
  - None
- Outputs:
  - `blockers` (array): Concrete setup blockers.
  - `mode` ("mock" | "dry_run" | "live" | "unavailable"): Current provider mode.
  - `provider` ("twilio-messaging"): SMS provider label.
  - `ready` (boolean): Whether bounded SMS can send messages now.

Example input:
```json
{}
```

Example output:
```json
{
  "blockers": [
    "blockers_example"
  ],
  "mode": "mock",
  "provider": "twilio-messaging",
  "ready": true
}
```

### `phone_sms_send`

Use this when the user explicitly approves sending one bounded SMS, including as a fallback after a call fails or when replying to someone who texted the Twilio number. Prepares or sends one approval-governed SMS through the repo-owned Twilio messaging surface. Returns the write lifecycle status and SMS attempt facts when sent. External write: may send a real SMS from the configured Twilio number when provider readiness checks pass. Before calling, requires a US/Canada E.164 destination, exact approved body, clear purpose, and either public phone evidence or a prior inbound SMS MessageSid; never use for payments, credentials, MFA codes, medical/legal advice, or sensitive identity data.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `write` (object)
- Inputs:
  - `body` (required, string): Exact SMS body to send. Keep it short, natural, and client-approved.
  - `country` (required, "US" | "CA"): Destination country allowed for phone calls in v1.
  - `destinationEvidence` (required, union): Evidence that this SMS destination is allowed: either a public phone source or a prior inbound SMS.
  - `purpose` (required, string): Plain-language reason for sending this SMS.
  - `relatedCallAttemptId` (optional, string): Optional failed or incomplete phone call attempt this SMS follows up on.
  - `toPhoneE164` (required, string): Destination phone number in E.164 format.
- Outputs:
  - `write` (object): External write result.
  - `write.actionId` (string): Backend profile action id for this external write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `write.facts` (object): Minimal structured facts for follow-up tool use.
  - `write.facts.attemptId` (string): Backend SMS attempt id.
  - `write.facts.fromPhoneE164` (union): Configured Twilio sender phone number when known.
  - `write.facts.provider` ("twilio-messaging"): SMS provider used for the attempt.
  - `write.facts.providerMessageSid` (union): Twilio MessageSid.
  - `write.facts.providerStatus` (union): Raw provider status when known.
  - `write.facts.providerStatusUpdatedAt` (union): Timestamp for the last raw provider status sync.
  - `write.facts.status` ("queued" | "sent" | "delivered" | "undelivered" | "failed" | "unknown"): Product status for one SMS attempt.
  - `write.facts.toPhoneE164` (string): Destination phone number in E.164 format.
  - `write.failure` (object): Structured detail for failed or uncertain writes.
  - `write.failure.field` (string): Input field related to the failure.
  - `write.failure.kind` ("auth" | "permission" | "rate_limit" | "quota" | "timeout" | "provider_unavailable" | "bad_request" | "not_found" | "provider_contract" | "network" | "unknown"): Stable machine-readable failure class.
  - `write.failure.message` (string): Short safe failure detail.
  - `write.failure.recovery` ("reconnect_account" | "ask_user_for_correct_value" | "search_again" | "retry_later" | "manual_reconciliation"): Best next recovery category for the assistant.
  - `write.failure.retryable` (boolean): Whether retrying the same write can reasonably succeed.
  - `write.failure.retryAfterMs` (integer): Provider retry delay in milliseconds when known.
  - `write.result` (string): Primary one-sentence deterministic result for the LLM to read first.
  - `write.status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current lifecycle status for the external write.

Example input:
```json
{
  "body": "body_example",
  "country": "US",
  "destinationEvidence": {
    "kind": "public_phone_source",
    "label": "label_example",
    "url": "https://example.com/item"
  },
  "purpose": "purpose_example",
  "relatedCallAttemptId": "550e8400-e29b-41d4-a716-446655440000",
  "toPhoneE164": "toPhoneE164_example"
}
```

Example output:
```json
{
  "write": {
    "actionId": "550e8400-e29b-41d4-a716-446655440000",
    "facts": {
      "attemptId": "550e8400-e29b-41d4-a716-446655440000",
      "fromPhoneE164": "fromPhoneE164_example",
      "provider": "twilio-messaging",
      "providerMessageSid": "providerMessageSid_example",
      "providerStatus": "providerStatus_example",
      "providerStatusUpdatedAt": "providerStatusUpdatedAt_example",
      "status": "queued",
      "toPhoneE164": "toPhoneE164_example"
    },
    "failure": {
      "field": "field_example",
      "kind": "auth",
      "message": "message_example",
      "recovery": "reconnect_account",
      "retryable": true,
      "retryAfterMs": 1
    },
    "result": "result_example",
    "status": "needs_review"
  }
}
```

### `phone_sms_status_get`

Use this when one SMS attempt needs current status, using either attemptId or the actionId returned by phone_sms_send. Reads one bounded SMS attempt and syncs active live attempts with Twilio when possible. Returns SMS attempt status, Twilio MessageSid, safe body preview, and failure facts.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `attempt` (object)
- Inputs:
  - `actionId` (optional, string): Profile action id returned by phone_sms_send when attemptId is not known.
  - `attemptId` (optional, string): Backend SMS attempt id.
- Outputs:
  - `attempt` (object): Requested SMS attempt.
  - `attempt.attemptId` (string): Backend SMS attempt id.
  - `attempt.bodyPreview` (string): Safe short preview of the SMS body.
  - `attempt.country` ("US" | "CA"): Destination country allowed for phone calls in v1.
  - `attempt.createdAt` (string): SMS attempt record creation timestamp.
  - `attempt.deliveredAt` (union): Timestamp when Twilio reported delivery, when known.
  - `attempt.destinationEvidenceKind` ("public_phone_source" | "prior_inbound_sms"): Evidence type that authorized the SMS destination.
  - `attempt.failureKind` (union): Stable failure category when the SMS attempt failed.
  - `attempt.failureMessage` (union): Safe failure detail when the SMS attempt failed.
  - `attempt.fromPhoneE164` (union): Configured Twilio sender phone number when known.
  - `attempt.provider` ("twilio-messaging"): SMS provider used for the attempt.
  - `attempt.providerMessageSid` (union): Twilio MessageSid.
  - `attempt.providerStatus` (union): Raw provider status when known.
  - `attempt.providerStatusUpdatedAt` (union): Timestamp for the last raw provider status sync.
  - `attempt.purpose` (string): SMS purpose.
  - `attempt.relatedCallAttemptId` (union): Phone call attempt this SMS follows up on, when applicable.
  - `attempt.replyToMessageSid` (union): Inbound Twilio MessageSid this SMS replies to, when applicable.
  - `attempt.sentAt` (union): Timestamp when the SMS was sent.
  - `attempt.status` ("queued" | "sent" | "delivered" | "undelivered" | "failed" | "unknown"): Product status for one SMS attempt.
  - `attempt.toPhoneE164` (string): Destination phone number in E.164 format.
  - `attempt.updatedAt` (string): SMS attempt record update timestamp.
  - `attempt.verifiedPhoneSourceLabel` (union): Short label for the public phone source when applicable.
  - `attempt.verifiedPhoneSourceUrl` (union): Public URL used to verify the destination phone when applicable.

Example input:
```json
{
  "actionId": "550e8400-e29b-41d4-a716-446655440000",
  "attemptId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Example output:
```json
{
  "attempt": {
    "attemptId": "550e8400-e29b-41d4-a716-446655440000",
    "bodyPreview": "bodyPreview_example",
    "country": "US",
    "createdAt": "createdAt_example",
    "deliveredAt": "deliveredAt_example",
    "destinationEvidenceKind": "public_phone_source",
    "failureKind": "failureKind_example",
    "failureMessage": "failureMessage_example",
    "fromPhoneE164": "fromPhoneE164_example",
    "provider": "twilio-messaging",
    "providerMessageSid": "providerMessageSid_example",
    "providerStatus": "providerStatus_example",
    "providerStatusUpdatedAt": "providerStatusUpdatedAt_example",
    "purpose": "purpose_example",
    "relatedCallAttemptId": "550e8400-e29b-41d4-a716-446655440000",
    "replyToMessageSid": "replyToMessageSid_example",
    "sentAt": "sentAt_example",
    "status": "queued",
    "toPhoneE164": "toPhoneE164_example",
    "updatedAt": "updatedAt_example",
    "verifiedPhoneSourceLabel": "verifiedPhoneSourceLabel_example",
    "verifiedPhoneSourceUrl": "https://example.com/item"
  }
}
```

### `portal_link_create`

Use this when the user needs a browser portal link for integrations or approvals. Creates a short-lived one-time Connect portal sign-in link. Returns portal link data safe to send in chat. External write: creates a short-lived portal access grant. Before calling, the portal section intent must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `link` (object)
- Inputs:
  - `section` (required, "integrations" | "approvals"): Portal section to open after sign-in.
- Outputs:
  - `link` (object): Portal access link.
  - `link.section` ("integrations" | "approvals"): Portal section the link opens.
  - `link.url` (string): Short-lived profile portal access URL. Example: `"https://portal.example.com/assistants/profile-1/approvals"`.

Example input:
```json
{
  "section": "integrations"
}
```

Example output:
```json
{
  "link": {
    "section": "integrations",
    "url": "https://portal.example.com/assistants/profile-1/approvals"
  }
}
```

### `profile_activity_search`

Use this when the agent needs prior assistant work, completed provider actions, or duplicate-prone activity. Searches durable profile activity entries. Returns activity cards with event type, title, summary, occurrence time, source, and reference keys. Use provider-specific tools for live provider data.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `activities` (array), `query` (union)
- Inputs:
  - `eventTypes` (optional, array): Optional precise activity event types to include.
  - `limit` (required, integer): Maximum number of activity entries to return.
  - `query` (optional, string): Plain-language activity search query.
  - `referenceKeys` (optional, array): Optional exact dedupe/reference keys to match.
  - `since` (optional, string): Optional inclusive lower bound for activity occurrence time.
  - `sourceKinds` (optional, array): Optional durable source kinds to include.
  - `until` (optional, string): Optional inclusive upper bound for activity occurrence time.
- Outputs:
  - `activities` (array): Matching profile activity entries ordered by relevance and recency.
  - `activities[].eventType` (string): Precise namespaced activity event type.
  - `activities[].id` (string): Source event id. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `activities[].occurredAt` (string): Timestamp when the activity happened. Example: `"2026-05-21T14:30:00.000Z"`.
  - `activities[].referenceKeys` (array): Exact keys useful for dedupe or follow-up lookup.
  - `activities[].source` (object): Canonical source behind an activity entry.
  - `activities[].source.id` (string): Durable source id.
  - `activities[].source.kind` (string): Durable source kind.
  - `activities[].summary` (string): Compact activity summary.
  - `activities[].title` (string): Short activity title.
  - `query` (union): Activity search query, when provided.

Example input:
```json
{
  "eventTypes": [
    "eventTypes_example"
  ],
  "limit": 10,
  "query": "query_example",
  "referenceKeys": [
    "referenceKeys_example"
  ],
  "since": "2026-05-21T14:30:00.000Z",
  "sourceKinds": [
    "sourceKinds_example"
  ],
  "until": "2026-05-21T14:30:00.000Z"
}
```

Example output:
```json
{
  "activities": [
    {
      "eventType": "eventType_example",
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "occurredAt": "2026-05-21T14:30:00.000Z",
      "referenceKeys": [
        "referenceKeys_example"
      ],
      "source": {
        "id": "id_example",
        "kind": "kind_example"
      },
      "summary": "summary_example",
      "title": "title_example"
    }
  ],
  "query": "query_example"
}
```

### `profile_context_get`

Use this when the agent needs compact profile status, readiness, portal availability, or operational coordination context. Fetches identity, assistant display basics, capability readiness, and operational coordination state. Returns profile overview, readiness data, pending actions, active proposals, active browser tasks, due or running work, blockers, recent terminal events, and scheduled tasks. Use provider-specific reads for live provider facts before acting. Capability readiness instance ids are backend link ids, not provider connectedAccountId values for provider tools.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `overview` (object)
- Inputs:
  - None
- Outputs:
  - `overview` (object): Profile overview result.
  - `overview.assistant` (object): Assistant identity for this profile.
  - `overview.assistant.id` (string): Backend assistant id. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `overview.assistant.name` (union): Assistant display name, when configured.
  - `overview.capabilities` (array): Capability readiness summaries for this profile.
  - `overview.capabilities[].accountHint` (union): Optional account hint such as an email address.
  - `overview.capabilities[].blockerCode` (union): Machine-readable blocker code when the capability is not ready.
  - `overview.capabilities[].blockerSummary` (union): Plain-language blocker summary when setup or auth is incomplete.
  - `overview.capabilities[].capabilitySlug` (string): Capability slug assigned to the profile.
  - `overview.capabilities[].instanceId` (string): Backend profile capability id or capability account link id for readiness/portal context. This is not a provider connectedAccountId for provider tool calls. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `overview.capabilities[].label` (union): Optional display label for this capability instance.
  - `overview.capabilities[].lastError` (union): Most recent capability error recorded by the backend.
  - `overview.capabilities[].provider` (string): Provider slug backing this capability.
  - `overview.capabilities[].readinessStatus` (union): Readiness state for using this capability.
  - `overview.operationalContext` (object): Current coordination state for pending approvals, proposals, work, blockers, and recent terminal outcomes.
  - `overview.operationalContext.activeBrowserTasks` (array): Running, waiting, or blocked browser tasks.
  - `overview.operationalContext.activeBrowserTasks[].goal` (string): Browser task goal.
  - `overview.operationalContext.activeBrowserTasks[].id` (string): Backend browser task id.
  - `overview.operationalContext.activeBrowserTasks[].status` (string): Current browser task status.
  - `overview.operationalContext.activeBrowserTasks[].summary` (union): Latest browser task summary, or null.
  - `overview.operationalContext.activeBrowserTasks[].updatedAt` (string): Timestamp when the browser task last changed.
  - `overview.operationalContext.activeProposals` (array): Deferred-review proposals waiting for review or currently blocked.
  - `overview.operationalContext.activeProposals[].blockerSummary` (union): Plain-language blocker when the proposal cannot be approved.
  - `overview.operationalContext.activeProposals[].expiresAt` (union): Expiration timestamp, or null when this proposal does not expire.
  - `overview.operationalContext.activeProposals[].kind` ("gmail.email.follow_up" | "outlook_mail.email.follow_up"): Proposal kind.
  - `overview.operationalContext.activeProposals[].proposalId` (string): Backend proposal id.
  - `overview.operationalContext.activeProposals[].revision` (integer): Optimistic-concurrency revision for portal review.
  - `overview.operationalContext.activeProposals[].status` ("proposed" | "blocked" | "converting" | "converted" | "rejected" | "expired" | "superseded"): Current proposal status.
  - `overview.operationalContext.activeProposals[].summary` (string): Compact proposal summary.
  - `overview.operationalContext.activeProposals[].title` (string): Short proposal title.
  - `overview.operationalContext.blockedItems` (array): Operational items blocked by auth, stale data, ambiguity, or provider failures.
  - `overview.operationalContext.blockedItems[].reason` (union): Plain-language blocker reason.
  - `overview.operationalContext.blockedItems[].sourceId` (string): Backend id for the blocked item.
  - `overview.operationalContext.blockedItems[].sourceType` ("proposal" | "action" | "browser_task" | "work_item" | "capability"): Type of blocked operational item.
  - `overview.operationalContext.blockedItems[].status` (string): Current blocked item status.
  - `overview.operationalContext.blockedItems[].title` (string): Short blocked item title.
  - `overview.operationalContext.blockedItems[].updatedAt` (string): Timestamp when the blocked item last changed.
  - `overview.operationalContext.dueWorkItems` (array): Pending work items ready for backend execution.
  - `overview.operationalContext.dueWorkItems[].dueAt` (union): When the work item is due or available.
  - `overview.operationalContext.dueWorkItems[].id` (string): Backend assistant work item id.
  - `overview.operationalContext.dueWorkItems[].kind` ("google_calendar.event.changed" | "outlook_calendar.event.changed" | "gmail.email.received" | "outlook_mail.email.received" | "twilio.sms.received" | "monday.item.created" | "monday.item.updated" | "scheduled.task" | "boldsign.signature_request.changed" | "google_drive.file.created" | "google_drive.file.updated" | "google_drive.file.deleted" | "microsoft_onedrive.file.created" | "microsoft_onedrive.file.updated" | "microsoft_onedrive.file.deleted" | "microsoft_sharepoint.file.created" | "microsoft_sharepoint.file.updated" | "microsoft_sharepoint.file.deleted"): Assistant work item kind.
  - `overview.operationalContext.dueWorkItems[].lastError` (union): Most recent work item failure summary, or null.
  - `overview.operationalContext.dueWorkItems[].runExpiresAt` (union): Backend run lease timestamp, or null when not running.
  - `overview.operationalContext.dueWorkItems[].runningByAgentId` (union): Assistant id currently running the work item, or null when not running.
  - `overview.operationalContext.dueWorkItems[].status` ("pending" | "running" | "succeeded" | "ignored" | "failed" | "cancelled"): Current assistant work item status.
  - `overview.operationalContext.dueWorkItems[].title` (string): Short work item title.
  - `overview.operationalContext.pendingActions` (array): Profile actions waiting for approval.
  - `overview.operationalContext.pendingActions[].actionId` (string): Backend profile action id for this approval-backed provider write. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `overview.operationalContext.pendingActions[].expiresAt` (union): Expiration timestamp for this pending action, or null when it does not expire. Example: `"2026-05-21T14:30:00.000Z"`.
  - `overview.operationalContext.pendingActions[].status` ("needs_review" | "processing" | "blocked" | "rejected" | "expired" | "completed" | "failed" | "unknown"): Current assistant-facing provider write status.
  - `overview.operationalContext.pendingActions[].title` (string): Short human-readable title for the approval request.
  - `overview.operationalContext.recentTerminalEvents` (array): Recently completed, rejected, expired, superseded, or failed work.
  - `overview.operationalContext.recentTerminalEvents[].sourceId` (string): Backend id for the terminal item.
  - `overview.operationalContext.recentTerminalEvents[].sourceType` ("proposal" | "action" | "browser_task" | "work_item"): Type of recently terminal item.
  - `overview.operationalContext.recentTerminalEvents[].status` (string): Terminal item status.
  - `overview.operationalContext.recentTerminalEvents[].title` (string): Short terminal item title.
  - `overview.operationalContext.recentTerminalEvents[].updatedAt` (string): Timestamp when the item reached this status.
  - `overview.operationalContext.runningWorkItems` (array): Work items currently being executed by backend jobs.
  - `overview.operationalContext.runningWorkItems[].dueAt` (union): When the work item is due or available.
  - `overview.operationalContext.runningWorkItems[].id` (string): Backend assistant work item id.
  - `overview.operationalContext.runningWorkItems[].kind` ("google_calendar.event.changed" | "outlook_calendar.event.changed" | "gmail.email.received" | "outlook_mail.email.received" | "twilio.sms.received" | "monday.item.created" | "monday.item.updated" | "scheduled.task" | "boldsign.signature_request.changed" | "google_drive.file.created" | "google_drive.file.updated" | "google_drive.file.deleted" | "microsoft_onedrive.file.created" | "microsoft_onedrive.file.updated" | "microsoft_onedrive.file.deleted" | "microsoft_sharepoint.file.created" | "microsoft_sharepoint.file.updated" | "microsoft_sharepoint.file.deleted"): Assistant work item kind.
  - `overview.operationalContext.runningWorkItems[].lastError` (union): Most recent work item failure summary, or null.
  - `overview.operationalContext.runningWorkItems[].runExpiresAt` (union): Backend run lease timestamp, or null when not running.
  - `overview.operationalContext.runningWorkItems[].runningByAgentId` (union): Assistant id currently running the work item, or null when not running.
  - `overview.operationalContext.runningWorkItems[].status` ("pending" | "running" | "succeeded" | "ignored" | "failed" | "cancelled"): Current assistant work item status.
  - `overview.operationalContext.runningWorkItems[].title` (string): Short work item title.
  - `overview.operationalContext.scheduledTasks` (array): Next relevant scheduled assistant tasks.
  - `overview.operationalContext.scheduledTasks[].id` (string): Backend scheduled task id.
  - `overview.operationalContext.scheduledTasks[].lastRunAt` (union): Most recent run timestamp, or null.
  - `overview.operationalContext.scheduledTasks[].nextRunAt` (union): Next scheduled run timestamp, or null.
  - `overview.operationalContext.scheduledTasks[].revision` (integer): Optimistic-concurrency revision.
  - `overview.operationalContext.scheduledTasks[].status` ("active" | "paused" | "deleted"): Current scheduled task status.
  - `overview.operationalContext.scheduledTasks[].title` (string): Scheduled task title.
  - `overview.portal` (object): Portal availability for this profile.
  - `overview.portal.available` (boolean): Whether the profile portal is available.
  - `overview.profile` (object): Profile identity and status.
  - `overview.profile.displayName` (string): Human-readable profile display name.
  - `overview.profile.id` (string): Backend profile id. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `overview.profile.status` (string): Profile status in the control plane.
  - `overview.profile.timezone` (string): Profile IANA timezone. Example: `"America/Toronto"`.

Example input:
```json
{}
```

Example output:
```json
{
  "overview": {
    "assistant": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "name_example"
    },
    "capabilities": [
      {
        "accountHint": "accountHint_example",
        "blockerCode": "credential_required",
        "blockerSummary": "blockerSummary_example",
        "capabilitySlug": "capabilitySlug_example",
        "instanceId": "550e8400-e29b-41d4-a716-446655440000",
        "label": "label_example",
        "lastError": "lastError_example",
        "provider": "provider_example",
        "readinessStatus": "not_connected"
      }
    ],
    "operationalContext": {
      "activeBrowserTasks": [
        {
          "goal": "goal_example",
          "id": "550e8400-e29b-41d4-a716-446655440000",
          "status": "status_example",
          "summary": "summary_example",
          "updatedAt": "updatedAt_example"
        }
      ],
      "activeProposals": [
        {
          "blockerSummary": "blockerSummary_example",
          "expiresAt": "expiresAt_example",
          "kind": "gmail.email.follow_up",
          "proposalId": "proposalId_example",
          "revision": 1,
          "status": "proposed",
          "summary": "summary_example",
          "title": "title_example"
        }
      ],
      "blockedItems": [
        {
          "reason": "reason_example",
          "sourceId": "sourceId_example",
          "sourceType": "proposal",
          "status": "status_example",
          "title": "title_example",
          "updatedAt": "updatedAt_example"
        }
      ],
      "dueWorkItems": [
        {
          "dueAt": "dueAt_example",
          "id": "id_example",
          "kind": "google_calendar.event.changed",
          "lastError": "lastError_example",
          "runExpiresAt": "runExpiresAt_example",
          "runningByAgentId": "runningByAgentId_example",
          "status": "pending",
          "title": "title_example"
        }
      ],
      "pendingActions": [
        {
          "actionId": "550e8400-e29b-41d4-a716-446655440000",
          "expiresAt": "2026-05-21T14:30:00.000Z",
          "status": "needs_review",
          "title": "title_example"
        }
      ],
      "recentTerminalEvents": [
        {
          "sourceId": "sourceId_example",
          "sourceType": "proposal",
          "status": "status_example",
          "title": "title_example",
          "updatedAt": "updatedAt_example"
        }
      ],
      "runningWorkItems": [
        {
          "dueAt": "dueAt_example",
          "id": "id_example",
          "kind": "google_calendar.event.changed",
          "lastError": "lastError_example",
          "runExpiresAt": "runExpiresAt_example",
          "runningByAgentId": "runningByAgentId_example",
          "status": "pending",
          "title": "title_example"
        }
      ],
      "scheduledTasks": [
        {
          "id": "id_example",
          "lastRunAt": "lastRunAt_example",
          "nextRunAt": "nextRunAt_example",
          "revision": 1,
          "status": "active",
          "title": "title_example"
        }
      ]
    },
    "portal": {
      "available": true
    },
    "profile": {
      "displayName": "displayName_example",
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "status_example",
      "timezone": "America/Toronto"
    }
  }
}
```

### `profile_file_find`

Use this when a previously saved or generated profile file must be found, selected, or materialized for analysis. Lists, searches, or gets saved profile files for this profile. Returns files and optionally inline small content. Do not use this when the request names a live provider source; use that provider's tools. Use profileFileId for an exact saved file, query for a metadata search, or neither for recent files. For content analysis, call file_extract_text, file_describe, or file_extract_data with the returned profileFileId and sha256.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `files` (array), `query` (string)
- Inputs:
  - `expectedSha256` (optional, string): Expected SHA-256 for stale-file protection when profileFileId is used.
  - `includeContent` (required, "metadata_only" | "inline_if_small"): Whether to return only metadata or inline small content.
  - `limit` (optional, integer): Maximum number of matching profile files to return.
  - `profileFileId` (optional, string): Durable profile file id.
  - `query` (optional, string): Case-insensitive text to match against profile-file metadata.
- Outputs:
  - `files` (array): Saved profile files matching the request.
  - `files[].byteSize` (union): File size in bytes, when known.
  - `files[].content` (union): Inline content result when requested.
  - `files[].createdAt` (string): Timestamp when this profile file was saved.
  - `files[].description` (union): Optional short file description.
  - `files[].filename` (string): Stored profile-file filename.
  - `files[].fileType` (string): Profile file type.
  - `files[].mimeType` (union): MIME type, when known.
  - `files[].profileFileId` (string): Durable profile file id. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `files[].relatedActionId` (union): Related profile action id, when this file came from an action.
  - `files[].relatedBrowserTaskId` (union): Related browser task id, when this file belongs to a browser task.
  - `files[].sha256` (union): SHA-256 hash, when known.
  - `query` (string): Metadata query used for the search.

Example input:
```json
{
  "expectedSha256": "expectedSha256_example",
  "includeContent": "metadata_only",
  "limit": 10,
  "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
  "query": "query_example"
}
```

Example output:
```json
{
  "files": [
    {
      "byteSize": 1,
      "content": {
        "available": false,
        "reason": "not_requested"
      },
      "createdAt": "2026-05-21T14:30:00.000Z",
      "description": "description_example",
      "filename": "filename_example",
      "fileType": "fileType_example",
      "mimeType": "mimeType_example",
      "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
      "relatedActionId": "550e8400-e29b-41d4-a716-446655440000",
      "relatedBrowserTaskId": "550e8400-e29b-41d4-a716-446655440000",
      "sha256": "sha256_example"
    }
  ],
  "query": "query_example"
}
```

### `profile_file_send`

Use this when the user needs to receive, open, preview, or download an existing saved profile file in the current chat. Queues the profile file as a native current-chat attachment without exposing delivery internals. Returns status and profile file metadata. This tool owns native attachment delivery; do not call message with raw media references afterward. Use a short caption if the user needs context around the attachment. Do not paste ids, hashes, local paths, delivery URLs, or tool names in visible text. External write: queues a native file attachment for the current channel reply. Before calling, the profile file id and expected hash, when known, must match the intended file.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `caption` (union), `channel` (string), `profileFile` (object), `status` ("queued_for_current_chat")
- Inputs:
  - `caption` (optional, string): Short client-visible caption to send with the attachment.
  - `expectedSha256` (optional, string): Expected SHA-256 for stale-content protection.
  - `filename` (optional, string): Optional display filename override.
  - `profileFileId` (required, string): Durable profile file id.
- Outputs:
  - `caption` (union): Caption requested for delivery.
  - `channel` (string): Resolved current channel target.
  - `profileFile` (object): Profile file queued for native chat delivery.
  - `profileFile.byteSize` (union): File size in bytes, when known.
  - `profileFile.filename` (string): Stored profile-file filename.
  - `profileFile.mimeType` (union): MIME type, when known.
  - `profileFile.profileFileId` (string): Durable profile file id. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `profileFile.sha256` (union): SHA-256 hash, when known.
  - `status` ("queued_for_current_chat"): Current-channel attachment delivery status.

Example input:
```json
{
  "caption": "caption_example",
  "expectedSha256": "expectedSha256_example",
  "filename": "filename_example",
  "profileFileId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Example output:
```json
{
  "caption": "caption_example",
  "channel": "channel_example",
  "profileFile": {
    "byteSize": 1,
    "filename": "filename_example",
    "mimeType": "mimeType_example",
    "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
    "sha256": "sha256_example"
  },
  "status": "queued_for_current_chat"
}
```

### `proposal_create`

Use this when proactive, scheduled, batch, or later-review work finds a concrete suggestion for Connect review. Creates or reuses a deferred-review proposal card. Returns the proposal summary and whether it was newly created. Do not use this when the user is actively approving an action in chat; use provider write and action approval path. External write: creates a profile proposal row visible in Connect. Before calling, proposal kind, payload, source evidence, and nested proposalPayload.sourceCheckedAt must be exact.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `created` (boolean), `proposal` (object)
- Inputs:
  - `evidence` (required, object): Structured source evidence used to create this proposal, such as checkedAt timestamps and rationale.
  - `expiresAt` (optional, string): Optional proposal expiration timestamp.
  - `proposalKind` (required, "gmail.email.follow_up" | "outlook_mail.email.follow_up"): Supported proposal kind. Use gmail.email.follow_up or outlook_mail.email.follow_up for email follow-up proposals.
  - `proposalPayload` (required, object): Kind-specific proposal payload. For email follow-up proposals, pass { email: <provider message send input>, sourceCheckedAt, optional sourceEmailThreadId, optional sourceEmailLastInboundAt, optional sourceMondayRecords }.
  - `sourceScheduledTaskId` (optional, string): Optional scheduled task id that produced this proposal.
  - `sourceWorkItemId` (optional, string): Optional assistant work item id that produced this proposal.
  - `summary` (required, string): Compact reason for the suggested follow-up.
  - `title` (required, string): Short proposal title for review UI.
- Outputs:
  - `created` (boolean): Whether a new proposal row was created.
  - `proposal` (object): Created or reused deferred-review proposal.
  - `proposal.blockerSummary` (union): Plain-language blocker when the proposal cannot be approved.
  - `proposal.expiresAt` (union): Expiration timestamp, or null when this proposal does not expire.
  - `proposal.kind` ("gmail.email.follow_up" | "outlook_mail.email.follow_up"): Proposal kind.
  - `proposal.proposalId` (string): Backend proposal id.
  - `proposal.revision` (integer): Optimistic-concurrency revision for portal review.
  - `proposal.status` ("proposed" | "blocked" | "converting" | "converted" | "rejected" | "expired" | "superseded"): Current proposal status.
  - `proposal.summary` (string): Compact proposal summary.
  - `proposal.title` (string): Short proposal title.

Example input:
```json
{
  "evidence": {},
  "expiresAt": "2026-05-21T14:30:00.000Z",
  "proposalKind": "gmail.email.follow_up",
  "proposalPayload": {},
  "sourceScheduledTaskId": "550e8400-e29b-41d4-a716-446655440000",
  "sourceWorkItemId": "550e8400-e29b-41d4-a716-446655440000",
  "summary": "summary_example",
  "title": "title_example"
}
```

Example output:
```json
{
  "created": true,
  "proposal": {
    "blockerSummary": "blockerSummary_example",
    "expiresAt": "expiresAt_example",
    "kind": "gmail.email.follow_up",
    "proposalId": "proposalId_example",
    "revision": 1,
    "status": "proposed",
    "summary": "summary_example",
    "title": "title_example"
  }
}
```

### `public_web_browser_action_prepare_start`

Use this when the user explicitly wants a website action prepared up to a review boundary and existing provider/API tools cannot satisfy the request. Uses a bounded browser session to prepare a cart, form, selection, or similar action, then stops before final confirmation; if login, MFA, or captcha blocks progress, may create a short-lived client handoff and wait for continuation. Returns the task lifecycle state, prepared action summary, artifacts, structured failure, or redacted handoff metadata with a client-facing portal URL. Do not use this when submitting purchases, payments, bookings, messages, account changes, legal forms, or any irreversible website action. External write: may change temporary browser page state and, when authentication blocks preparation, may create a saved browser auth context plus short-lived client handoff; it must not submit final external actions. Before calling, requires an explicit reviewBoundary and a trusted user messaging session supplied by invocation context, not by a tool input; allowedDomains must include the startUrl hostname; use authContextId only for a saved login the user expects; if handoff is returned, send the client URL, wait for the user to finish, then call public_web_browser_task_continue; stop before the final submit/payment/send/book/place-order action.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `task` (object)
- Inputs:
  - `allowedDomains` (required, array): Hostnames the browser may visit during preparation; must include the startUrl hostname.
  - `authContextId` (optional, string): Optional saved browser auth context id to use for action preparation.
  - `maxSteps` (required, integer): Maximum browser reasoning/action steps allowed for action preparation.
  - `objective` (required, string): Concrete preparation objective.
  - `preparationInstruction` (required, string): Natural-language steps to prepare the action while stopping before the review boundary.
  - `reviewBoundary` (required, string): The exact final action the browser must stop before, such as clicking Place order.
  - `startUrl` (required, string): HTTPS URL where preparation must begin.
  - `targetAction` (required, string): The action to prepare, such as building a cart.
- Outputs:
  - `task` (object): Durable browser task state for assistant use.
  - `task.artifacts` (array): Evidence artifacts captured for the task.
  - `task.artifacts[].artifactType` (string): Internal file type.
  - `task.artifacts[].byteSize` (union): Profile file size in bytes.
  - `task.artifacts[].filename` (union): Stored profile file filename.
  - `task.artifacts[].mimeType` (union): Profile file MIME type.
  - `task.artifacts[].profileFileId` (string): Durable profile file id.
  - `task.artifacts[].sha256` (union): SHA-256 hash.
  - `task.authContextId` (union): Saved browser auth context used by the task, if any.
  - `task.browserTaskId` (string): Durable browser task id.
  - `task.createdAt` (string): Task creation timestamp.
  - `task.currentUrl` (union): Current or final browser page URL.
  - `task.extractedFields` (object): Named fields extracted from the page.
  - `task.failure` (object): Structured browser automation blocker or failure.
  - `task.failure.kind` ("login_required" | "mfa_required" | "captcha_required" | "site_blocked" | "domain_not_allowed" | "ambiguous_page" | "timeout" | "rate_limit" | "missing_config" | "provider_unavailable" | "unknown_completion" | "provider_contract" | "blocked_url" | "inaccessible_url" | "bad_request"): Stable blocker or failure kind.
  - `task.failure.message` (string): Safe assistant-readable failure message.
  - `task.failure.retryable` (boolean): Whether retrying later may reasonably succeed.
  - `task.handoff` (object): Redacted client browser handoff state.
  - `task.handoff.clientUrl` (union): Client-facing portal URL; null after handoff is no longer open.
  - `task.handoff.expiresAt` (string): Handoff expiry timestamp.
  - `task.handoff.handoffId` (string): Durable browser handoff id.
  - `task.handoff.reason` ("login_required" | "mfa_required" | "captcha_required" | "user_control_requested"): Sensitive step the user must complete.
  - `task.handoff.status` ("waiting" | "completed" | "cancelled" | "expired"): Current handoff lifecycle status.
  - `task.mode` ("extract" | "action_prepare" | "auth_context_setup" | "live_handoff"): Browser task mode.
  - `task.objective` (string): Assistant-facing objective for this browser task.
  - `task.preparedAction` (object): Prepared browser action that stopped before final confirmation.
  - `task.preparedAction.reviewBoundary` (string): Final action boundary where browser automation stopped.
  - `task.preparedAction.summary` (string): User-review summary of the prepared page state.
  - `task.preparedAction.targetAction` (string): Website action that was prepared but not submitted.
  - `task.provider` ("browserbase-stagehand"): Browser automation provider used for this task.
  - `task.startUrl` (string): HTTPS URL where the browser task started.
  - `task.status` ("queued" | "running" | "waiting" | "blocked" | "succeeded" | "failed" | "cancelled"): Current durable browser task lifecycle status.
  - `task.updatedAt` (string): Last task update timestamp.

Example input:
```json
{
  "allowedDomains": [
    "allowedDomains_example"
  ],
  "authContextId": "550e8400-e29b-41d4-a716-446655440000",
  "maxSteps": 8,
  "objective": "objective_example",
  "preparationInstruction": "preparationInstruction_example",
  "reviewBoundary": "reviewBoundary_example",
  "startUrl": "https://example.com/item",
  "targetAction": "targetAction_example"
}
```

Example output:
```json
{
  "task": {
    "artifacts": [
      {
        "artifactType": "artifactType_example",
        "byteSize": 1,
        "filename": "filename_example",
        "mimeType": "mimeType_example",
        "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
        "sha256": "sha256_example"
      }
    ],
    "authContextId": "550e8400-e29b-41d4-a716-446655440000",
    "browserTaskId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-05-21T14:30:00.000Z",
    "currentUrl": "https://example.com/item",
    "extractedFields": {},
    "failure": {
      "kind": "login_required",
      "message": "message_example",
      "retryable": true
    },
    "handoff": {
      "clientUrl": "https://example.com/item",
      "expiresAt": "2026-05-21T14:30:00.000Z",
      "handoffId": "550e8400-e29b-41d4-a716-446655440000",
      "reason": "login_required",
      "status": "waiting"
    },
    "mode": "extract",
    "objective": "objective_example",
    "preparedAction": {
      "reviewBoundary": "reviewBoundary_example",
      "summary": "summary_example",
      "targetAction": "targetAction_example"
    },
    "provider": "browserbase-stagehand",
    "startUrl": "https://example.com/item",
    "status": "queued",
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `public_web_browser_auth_context_delete`

Use this when the user wants a saved website login context removed or a no-longer-valid authenticated browser context revoked. Marks the saved browser auth context deleted locally and deletes the provider context when possible. Returns the authContext metadata after deletion. External write: revokes a profile-scoped saved browser login context for future public-web tasks. Before calling, requires a trusted user messaging session; deletion never submits external website actions.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `authContext` (object)
- Inputs:
  - `authContextId` (required, string): Saved browser auth context id to delete.
  - `reason` (optional, string): Why the browser auth context is being deleted.
- Outputs:
  - `authContext` (object): Profile-scoped saved browser authentication context.
  - `authContext.accountHint` (union): Optional user-facing account hint, such as an email or store account label.
  - `authContext.allowedDomains` (array): Website domains covered by this context.
  - `authContext.authContextId` (string): Saved browser auth context id.
  - `authContext.createdAt` (string): Auth context creation timestamp.
  - `authContext.label` (string): User-facing saved login label.
  - `authContext.lastVerifiedAt` (union): Last timestamp this context was successfully used or verified.
  - `authContext.primaryDomain` (string): Primary website domain for this context.
  - `authContext.status` ("active" | "deleted"): Saved auth context status.
  - `authContext.updatedAt` (string): Auth context update timestamp.

Example input:
```json
{
  "authContextId": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "reason_example"
}
```

Example output:
```json
{
  "authContext": {
    "accountHint": "accountHint_example",
    "allowedDomains": [
      "allowedDomains_example"
    ],
    "authContextId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-05-21T14:30:00.000Z",
    "label": "label_example",
    "lastVerifiedAt": "2026-05-21T14:30:00.000Z",
    "primaryDomain": "primaryDomain_example",
    "status": "active",
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `public_web_browser_auth_context_setup_start`

Use this when the user needs the assistant to use a website that requires login, MFA, captcha, or other sensitive manual authentication. Starts a bounded browser setup task, creates a short-lived client handoff, and waits while the user completes sensitive steps in the portal. Returns the task lifecycle state with redacted handoff metadata and a client-facing portal URL. External write: creates a provider browser session and may create or refresh a saved browser auth context after the user completes the handoff. Before calling, requires a trusted user messaging session; never ask for passwords, MFA codes, captchas, card numbers, or CVC in chat; allowedDomains must include the startUrl hostname; after the user finishes in the portal, call public_web_browser_task_continue with the same browserTaskId to complete and verify the saved login.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `task` (object)
- Inputs:
  - `accountHint` (optional, string): Optional account hint, such as an email or account label.
  - `allowedDomains` (required, array): Hostnames the browser may visit during authentication setup; must include the startUrl hostname.
  - `label` (required, string): User-facing saved login label.
  - `objective` (required, string): Concrete authentication setup objective.
  - `startUrl` (required, string): HTTPS URL where login/setup must begin.
- Outputs:
  - `task` (object): Durable browser task state for assistant use.
  - `task.artifacts` (array): Evidence artifacts captured for the task.
  - `task.artifacts[].artifactType` (string): Internal file type.
  - `task.artifacts[].byteSize` (union): Profile file size in bytes.
  - `task.artifacts[].filename` (union): Stored profile file filename.
  - `task.artifacts[].mimeType` (union): Profile file MIME type.
  - `task.artifacts[].profileFileId` (string): Durable profile file id.
  - `task.artifacts[].sha256` (union): SHA-256 hash.
  - `task.authContextId` (union): Saved browser auth context used by the task, if any.
  - `task.browserTaskId` (string): Durable browser task id.
  - `task.createdAt` (string): Task creation timestamp.
  - `task.currentUrl` (union): Current or final browser page URL.
  - `task.extractedFields` (object): Named fields extracted from the page.
  - `task.failure` (object): Structured browser automation blocker or failure.
  - `task.failure.kind` ("login_required" | "mfa_required" | "captcha_required" | "site_blocked" | "domain_not_allowed" | "ambiguous_page" | "timeout" | "rate_limit" | "missing_config" | "provider_unavailable" | "unknown_completion" | "provider_contract" | "blocked_url" | "inaccessible_url" | "bad_request"): Stable blocker or failure kind.
  - `task.failure.message` (string): Safe assistant-readable failure message.
  - `task.failure.retryable` (boolean): Whether retrying later may reasonably succeed.
  - `task.handoff` (object): Redacted client browser handoff state.
  - `task.handoff.clientUrl` (union): Client-facing portal URL; null after handoff is no longer open.
  - `task.handoff.expiresAt` (string): Handoff expiry timestamp.
  - `task.handoff.handoffId` (string): Durable browser handoff id.
  - `task.handoff.reason` ("login_required" | "mfa_required" | "captcha_required" | "user_control_requested"): Sensitive step the user must complete.
  - `task.handoff.status` ("waiting" | "completed" | "cancelled" | "expired"): Current handoff lifecycle status.
  - `task.mode` ("extract" | "action_prepare" | "auth_context_setup" | "live_handoff"): Browser task mode.
  - `task.objective` (string): Assistant-facing objective for this browser task.
  - `task.preparedAction` (object): Prepared browser action that stopped before final confirmation.
  - `task.preparedAction.reviewBoundary` (string): Final action boundary where browser automation stopped.
  - `task.preparedAction.summary` (string): User-review summary of the prepared page state.
  - `task.preparedAction.targetAction` (string): Website action that was prepared but not submitted.
  - `task.provider` ("browserbase-stagehand"): Browser automation provider used for this task.
  - `task.startUrl` (string): HTTPS URL where the browser task started.
  - `task.status` ("queued" | "running" | "waiting" | "blocked" | "succeeded" | "failed" | "cancelled"): Current durable browser task lifecycle status.
  - `task.updatedAt` (string): Last task update timestamp.

Example input:
```json
{
  "accountHint": "accountHint_example",
  "allowedDomains": [
    "allowedDomains_example"
  ],
  "label": "label_example",
  "objective": "objective_example",
  "startUrl": "https://example.com/item"
}
```

Example output:
```json
{
  "task": {
    "artifacts": [
      {
        "artifactType": "artifactType_example",
        "byteSize": 1,
        "filename": "filename_example",
        "mimeType": "mimeType_example",
        "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
        "sha256": "sha256_example"
      }
    ],
    "authContextId": "550e8400-e29b-41d4-a716-446655440000",
    "browserTaskId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-05-21T14:30:00.000Z",
    "currentUrl": "https://example.com/item",
    "extractedFields": {},
    "failure": {
      "kind": "login_required",
      "message": "message_example",
      "retryable": true
    },
    "handoff": {
      "clientUrl": "https://example.com/item",
      "expiresAt": "2026-05-21T14:30:00.000Z",
      "handoffId": "550e8400-e29b-41d4-a716-446655440000",
      "reason": "login_required",
      "status": "waiting"
    },
    "mode": "extract",
    "objective": "objective_example",
    "preparedAction": {
      "reviewBoundary": "reviewBoundary_example",
      "summary": "summary_example",
      "targetAction": "targetAction_example"
    },
    "provider": "browserbase-stagehand",
    "startUrl": "https://example.com/item",
    "status": "queued",
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `public_web_browser_auth_contexts_list`

Use this when the assistant needs to see which saved website login contexts are available before using authenticated browser automation. Lists active profile-scoped saved browser authentication contexts without exposing provider context ids, cookies, tokens, passwords, or session details. Returns redacted saved browser authContextId values, login labels, domains, account hints, and verification timestamps. Use these ids only with public-web tools that accept authContextId. A listed context may still require reauthentication if the target website expired its session.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `authContexts` (array)
- Inputs:
  - None
- Outputs:
  - `authContexts` (array): Active saved browser auth contexts for the profile.
  - `authContexts[].accountHint` (union): Optional user-facing account hint, such as an email or store account label.
  - `authContexts[].allowedDomains` (array): Website domains covered by this context.
  - `authContexts[].authContextId` (string): Saved browser auth context id.
  - `authContexts[].createdAt` (string): Auth context creation timestamp.
  - `authContexts[].label` (string): User-facing saved login label.
  - `authContexts[].lastVerifiedAt` (union): Last timestamp this context was successfully used or verified.
  - `authContexts[].primaryDomain` (string): Primary website domain for this context.
  - `authContexts[].status` ("active" | "deleted"): Saved auth context status.
  - `authContexts[].updatedAt` (string): Auth context update timestamp.

Example input:
```json
{}
```

Example output:
```json
{
  "authContexts": [
    {
      "accountHint": "accountHint_example",
      "allowedDomains": [
        "allowedDomains_example"
      ],
      "authContextId": "550e8400-e29b-41d4-a716-446655440000",
      "createdAt": "2026-05-21T14:30:00.000Z",
      "label": "label_example",
      "lastVerifiedAt": "2026-05-21T14:30:00.000Z",
      "primaryDomain": "primaryDomain_example",
      "status": "active",
      "updatedAt": "2026-05-21T14:30:00.000Z"
    }
  ]
}
```

### `public_web_browser_extract_start`

Use this when the user needs current facts from a website and existing provider/API tools cannot satisfy the request. Starts a bounded browser task from an explicit HTTPS URL, extracts named fields, and captures evidence artifacts. Returns the task lifecycle state, extracted fields, artifacts, or structured failure. Use allowedDomains to keep navigation constrained to the expected site; it must include the startUrl hostname. For protected pages, use authContextId from public_web_browser_auth_contexts_list when the user expects a saved login; login, MFA, captcha, or site-access blockers may return structured failure instead of extracted fields. Prefer this read-only extraction before preparing any browser action.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `task` (object)
- Inputs:
  - `allowedDomains` (required, array): Hostnames the browser may visit during this task; must include the startUrl hostname.
  - `authContextId` (optional, string): Optional saved browser auth context id to use for this read-only task.
  - `extractionInstruction` (required, string): Natural-language extraction instruction.
  - `fields` (required, array): Named fields the assistant expects from the page.
  - `fields[].description` (required, string): What to extract for this field.
  - `fields[].name` (required, string): CamelCase or snake_case field name for extracted data.
  - `fields[].required` (required, boolean): Whether this extracted field is required.
  - `maxSteps` (required, integer): Maximum browser reasoning/action steps allowed for extraction.
  - `objective` (required, string): Concrete browsing objective.
  - `startUrl` (required, string): HTTPS URL where the browser task must begin.
- Outputs:
  - `task` (object): Durable browser task state for assistant use.
  - `task.artifacts` (array): Evidence artifacts captured for the task.
  - `task.artifacts[].artifactType` (string): Internal file type.
  - `task.artifacts[].byteSize` (union): Profile file size in bytes.
  - `task.artifacts[].filename` (union): Stored profile file filename.
  - `task.artifacts[].mimeType` (union): Profile file MIME type.
  - `task.artifacts[].profileFileId` (string): Durable profile file id.
  - `task.artifacts[].sha256` (union): SHA-256 hash.
  - `task.authContextId` (union): Saved browser auth context used by the task, if any.
  - `task.browserTaskId` (string): Durable browser task id.
  - `task.createdAt` (string): Task creation timestamp.
  - `task.currentUrl` (union): Current or final browser page URL.
  - `task.extractedFields` (object): Named fields extracted from the page.
  - `task.failure` (object): Structured browser automation blocker or failure.
  - `task.failure.kind` ("login_required" | "mfa_required" | "captcha_required" | "site_blocked" | "domain_not_allowed" | "ambiguous_page" | "timeout" | "rate_limit" | "missing_config" | "provider_unavailable" | "unknown_completion" | "provider_contract" | "blocked_url" | "inaccessible_url" | "bad_request"): Stable blocker or failure kind.
  - `task.failure.message` (string): Safe assistant-readable failure message.
  - `task.failure.retryable` (boolean): Whether retrying later may reasonably succeed.
  - `task.handoff` (object): Redacted client browser handoff state.
  - `task.handoff.clientUrl` (union): Client-facing portal URL; null after handoff is no longer open.
  - `task.handoff.expiresAt` (string): Handoff expiry timestamp.
  - `task.handoff.handoffId` (string): Durable browser handoff id.
  - `task.handoff.reason` ("login_required" | "mfa_required" | "captcha_required" | "user_control_requested"): Sensitive step the user must complete.
  - `task.handoff.status` ("waiting" | "completed" | "cancelled" | "expired"): Current handoff lifecycle status.
  - `task.mode` ("extract" | "action_prepare" | "auth_context_setup" | "live_handoff"): Browser task mode.
  - `task.objective` (string): Assistant-facing objective for this browser task.
  - `task.preparedAction` (object): Prepared browser action that stopped before final confirmation.
  - `task.preparedAction.reviewBoundary` (string): Final action boundary where browser automation stopped.
  - `task.preparedAction.summary` (string): User-review summary of the prepared page state.
  - `task.preparedAction.targetAction` (string): Website action that was prepared but not submitted.
  - `task.provider` ("browserbase-stagehand"): Browser automation provider used for this task.
  - `task.startUrl` (string): HTTPS URL where the browser task started.
  - `task.status` ("queued" | "running" | "waiting" | "blocked" | "succeeded" | "failed" | "cancelled"): Current durable browser task lifecycle status.
  - `task.updatedAt` (string): Last task update timestamp.

Example input:
```json
{
  "allowedDomains": [
    "allowedDomains_example"
  ],
  "authContextId": "550e8400-e29b-41d4-a716-446655440000",
  "extractionInstruction": "extractionInstruction_example",
  "fields": [
    {
      "description": "description_example",
      "name": "name_example",
      "required": true
    }
  ],
  "maxSteps": 3,
  "objective": "objective_example",
  "startUrl": "https://example.com/item"
}
```

Example output:
```json
{
  "task": {
    "artifacts": [
      {
        "artifactType": "artifactType_example",
        "byteSize": 1,
        "filename": "filename_example",
        "mimeType": "mimeType_example",
        "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
        "sha256": "sha256_example"
      }
    ],
    "authContextId": "550e8400-e29b-41d4-a716-446655440000",
    "browserTaskId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-05-21T14:30:00.000Z",
    "currentUrl": "https://example.com/item",
    "extractedFields": {},
    "failure": {
      "kind": "login_required",
      "message": "message_example",
      "retryable": true
    },
    "handoff": {
      "clientUrl": "https://example.com/item",
      "expiresAt": "2026-05-21T14:30:00.000Z",
      "handoffId": "550e8400-e29b-41d4-a716-446655440000",
      "reason": "login_required",
      "status": "waiting"
    },
    "mode": "extract",
    "objective": "objective_example",
    "preparedAction": {
      "reviewBoundary": "reviewBoundary_example",
      "summary": "summary_example",
      "targetAction": "targetAction_example"
    },
    "provider": "browserbase-stagehand",
    "startUrl": "https://example.com/item",
    "status": "queued",
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `public_web_browser_live_handoff_start`

Use this when the user explicitly wants temporary manual control of a website using an existing saved browser login. Starts a short-lived live browser session from a saved auth context, opens the requested HTTPS URL, and waits while the user interacts through the secure portal. Returns the task lifecycle state with redacted handoff metadata and a client-facing portal URL. Do not use this when logging in from scratch, bypassing MFA/captcha, or submitting purchases, payments, bookings, messages, account changes, legal forms, or irreversible website actions. External write: creates a provider browser session attached to an existing profile-scoped browser auth context; it must not submit final external actions. Before calling, requires a trusted user messaging session and an existing authContextId; allowedDomains must include the startUrl hostname; send only the returned client URL, wait for the user to finish, then call public_web_browser_task_continue.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `task` (object)
- Inputs:
  - `allowedDomains` (required, array): Hostnames the live browser may visit during this handoff; must include the startUrl hostname.
  - `authContextId` (required, string): Saved browser auth context id to open for the live handoff.
  - `objective` (required, string): Concrete reason the user needs temporary browser control.
  - `startUrl` (required, string): HTTPS URL where the live browser handoff must open.
- Outputs:
  - `task` (object): Durable browser task state for assistant use.
  - `task.artifacts` (array): Evidence artifacts captured for the task.
  - `task.artifacts[].artifactType` (string): Internal file type.
  - `task.artifacts[].byteSize` (union): Profile file size in bytes.
  - `task.artifacts[].filename` (union): Stored profile file filename.
  - `task.artifacts[].mimeType` (union): Profile file MIME type.
  - `task.artifacts[].profileFileId` (string): Durable profile file id.
  - `task.artifacts[].sha256` (union): SHA-256 hash.
  - `task.authContextId` (union): Saved browser auth context used by the task, if any.
  - `task.browserTaskId` (string): Durable browser task id.
  - `task.createdAt` (string): Task creation timestamp.
  - `task.currentUrl` (union): Current or final browser page URL.
  - `task.extractedFields` (object): Named fields extracted from the page.
  - `task.failure` (object): Structured browser automation blocker or failure.
  - `task.failure.kind` ("login_required" | "mfa_required" | "captcha_required" | "site_blocked" | "domain_not_allowed" | "ambiguous_page" | "timeout" | "rate_limit" | "missing_config" | "provider_unavailable" | "unknown_completion" | "provider_contract" | "blocked_url" | "inaccessible_url" | "bad_request"): Stable blocker or failure kind.
  - `task.failure.message` (string): Safe assistant-readable failure message.
  - `task.failure.retryable` (boolean): Whether retrying later may reasonably succeed.
  - `task.handoff` (object): Redacted client browser handoff state.
  - `task.handoff.clientUrl` (union): Client-facing portal URL; null after handoff is no longer open.
  - `task.handoff.expiresAt` (string): Handoff expiry timestamp.
  - `task.handoff.handoffId` (string): Durable browser handoff id.
  - `task.handoff.reason` ("login_required" | "mfa_required" | "captcha_required" | "user_control_requested"): Sensitive step the user must complete.
  - `task.handoff.status` ("waiting" | "completed" | "cancelled" | "expired"): Current handoff lifecycle status.
  - `task.mode` ("extract" | "action_prepare" | "auth_context_setup" | "live_handoff"): Browser task mode.
  - `task.objective` (string): Assistant-facing objective for this browser task.
  - `task.preparedAction` (object): Prepared browser action that stopped before final confirmation.
  - `task.preparedAction.reviewBoundary` (string): Final action boundary where browser automation stopped.
  - `task.preparedAction.summary` (string): User-review summary of the prepared page state.
  - `task.preparedAction.targetAction` (string): Website action that was prepared but not submitted.
  - `task.provider` ("browserbase-stagehand"): Browser automation provider used for this task.
  - `task.startUrl` (string): HTTPS URL where the browser task started.
  - `task.status` ("queued" | "running" | "waiting" | "blocked" | "succeeded" | "failed" | "cancelled"): Current durable browser task lifecycle status.
  - `task.updatedAt` (string): Last task update timestamp.

Example input:
```json
{
  "allowedDomains": [
    "allowedDomains_example"
  ],
  "authContextId": "550e8400-e29b-41d4-a716-446655440000",
  "objective": "objective_example",
  "startUrl": "https://example.com/item"
}
```

Example output:
```json
{
  "task": {
    "artifacts": [
      {
        "artifactType": "artifactType_example",
        "byteSize": 1,
        "filename": "filename_example",
        "mimeType": "mimeType_example",
        "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
        "sha256": "sha256_example"
      }
    ],
    "authContextId": "550e8400-e29b-41d4-a716-446655440000",
    "browserTaskId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-05-21T14:30:00.000Z",
    "currentUrl": "https://example.com/item",
    "extractedFields": {},
    "failure": {
      "kind": "login_required",
      "message": "message_example",
      "retryable": true
    },
    "handoff": {
      "clientUrl": "https://example.com/item",
      "expiresAt": "2026-05-21T14:30:00.000Z",
      "handoffId": "550e8400-e29b-41d4-a716-446655440000",
      "reason": "login_required",
      "status": "waiting"
    },
    "mode": "extract",
    "objective": "objective_example",
    "preparedAction": {
      "reviewBoundary": "reviewBoundary_example",
      "summary": "summary_example",
      "targetAction": "targetAction_example"
    },
    "provider": "browserbase-stagehand",
    "startUrl": "https://example.com/item",
    "status": "queued",
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `public_web_browser_task_cancel`

Use this when an in-progress browser task should be stopped. Cancels the local browser task lifecycle and stops provider work when possible. Returns the task lifecycle state. External write: marks a durable browser task as cancelled. Before calling, only use for the intended browserTaskId; cancellation never submits external website actions.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `task` (object)
- Inputs:
  - `browserTaskId` (required, string): Browser task id to cancel.
  - `reason` (optional, string): Why the browser task is being cancelled.
- Outputs:
  - `task` (object): Durable browser task state for assistant use.
  - `task.artifacts` (array): Evidence artifacts captured for the task.
  - `task.artifacts[].artifactType` (string): Internal file type.
  - `task.artifacts[].byteSize` (union): Profile file size in bytes.
  - `task.artifacts[].filename` (union): Stored profile file filename.
  - `task.artifacts[].mimeType` (union): Profile file MIME type.
  - `task.artifacts[].profileFileId` (string): Durable profile file id.
  - `task.artifacts[].sha256` (union): SHA-256 hash.
  - `task.authContextId` (union): Saved browser auth context used by the task, if any.
  - `task.browserTaskId` (string): Durable browser task id.
  - `task.createdAt` (string): Task creation timestamp.
  - `task.currentUrl` (union): Current or final browser page URL.
  - `task.extractedFields` (object): Named fields extracted from the page.
  - `task.failure` (object): Structured browser automation blocker or failure.
  - `task.failure.kind` ("login_required" | "mfa_required" | "captcha_required" | "site_blocked" | "domain_not_allowed" | "ambiguous_page" | "timeout" | "rate_limit" | "missing_config" | "provider_unavailable" | "unknown_completion" | "provider_contract" | "blocked_url" | "inaccessible_url" | "bad_request"): Stable blocker or failure kind.
  - `task.failure.message` (string): Safe assistant-readable failure message.
  - `task.failure.retryable` (boolean): Whether retrying later may reasonably succeed.
  - `task.handoff` (object): Redacted client browser handoff state.
  - `task.handoff.clientUrl` (union): Client-facing portal URL; null after handoff is no longer open.
  - `task.handoff.expiresAt` (string): Handoff expiry timestamp.
  - `task.handoff.handoffId` (string): Durable browser handoff id.
  - `task.handoff.reason` ("login_required" | "mfa_required" | "captcha_required" | "user_control_requested"): Sensitive step the user must complete.
  - `task.handoff.status` ("waiting" | "completed" | "cancelled" | "expired"): Current handoff lifecycle status.
  - `task.mode` ("extract" | "action_prepare" | "auth_context_setup" | "live_handoff"): Browser task mode.
  - `task.objective` (string): Assistant-facing objective for this browser task.
  - `task.preparedAction` (object): Prepared browser action that stopped before final confirmation.
  - `task.preparedAction.reviewBoundary` (string): Final action boundary where browser automation stopped.
  - `task.preparedAction.summary` (string): User-review summary of the prepared page state.
  - `task.preparedAction.targetAction` (string): Website action that was prepared but not submitted.
  - `task.provider` ("browserbase-stagehand"): Browser automation provider used for this task.
  - `task.startUrl` (string): HTTPS URL where the browser task started.
  - `task.status` ("queued" | "running" | "waiting" | "blocked" | "succeeded" | "failed" | "cancelled"): Current durable browser task lifecycle status.
  - `task.updatedAt` (string): Last task update timestamp.

Example input:
```json
{
  "browserTaskId": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "reason_example"
}
```

Example output:
```json
{
  "task": {
    "artifacts": [
      {
        "artifactType": "artifactType_example",
        "byteSize": 1,
        "filename": "filename_example",
        "mimeType": "mimeType_example",
        "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
        "sha256": "sha256_example"
      }
    ],
    "authContextId": "550e8400-e29b-41d4-a716-446655440000",
    "browserTaskId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-05-21T14:30:00.000Z",
    "currentUrl": "https://example.com/item",
    "extractedFields": {},
    "failure": {
      "kind": "login_required",
      "message": "message_example",
      "retryable": true
    },
    "handoff": {
      "clientUrl": "https://example.com/item",
      "expiresAt": "2026-05-21T14:30:00.000Z",
      "handoffId": "550e8400-e29b-41d4-a716-446655440000",
      "reason": "login_required",
      "status": "waiting"
    },
    "mode": "extract",
    "objective": "objective_example",
    "preparedAction": {
      "reviewBoundary": "reviewBoundary_example",
      "summary": "summary_example",
      "targetAction": "targetAction_example"
    },
    "provider": "browserbase-stagehand",
    "startUrl": "https://example.com/item",
    "status": "queued",
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `public_web_browser_task_continue`

Use this when a browser task is waiting after a client handoff and the user has completed the sensitive step in the portal. Resumes the waiting browser task using the existing provider session or saved context, then returns updated task state. Returns the task lifecycle state, artifacts, prepared action, extracted data, or structured failure. External write: continues browser automation after a completed handoff and may persist the website auth context. Before calling, requires a trusted user messaging session; only continue the intended waiting browserTaskId; never submit final purchases, payments, bookings, messages, legal forms, or account changes.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `task` (object)
- Inputs:
  - `browserTaskId` (required, string): Waiting browser task id to continue.
- Outputs:
  - `task` (object): Durable browser task state for assistant use.
  - `task.artifacts` (array): Evidence artifacts captured for the task.
  - `task.artifacts[].artifactType` (string): Internal file type.
  - `task.artifacts[].byteSize` (union): Profile file size in bytes.
  - `task.artifacts[].filename` (union): Stored profile file filename.
  - `task.artifacts[].mimeType` (union): Profile file MIME type.
  - `task.artifacts[].profileFileId` (string): Durable profile file id.
  - `task.artifacts[].sha256` (union): SHA-256 hash.
  - `task.authContextId` (union): Saved browser auth context used by the task, if any.
  - `task.browserTaskId` (string): Durable browser task id.
  - `task.createdAt` (string): Task creation timestamp.
  - `task.currentUrl` (union): Current or final browser page URL.
  - `task.extractedFields` (object): Named fields extracted from the page.
  - `task.failure` (object): Structured browser automation blocker or failure.
  - `task.failure.kind` ("login_required" | "mfa_required" | "captcha_required" | "site_blocked" | "domain_not_allowed" | "ambiguous_page" | "timeout" | "rate_limit" | "missing_config" | "provider_unavailable" | "unknown_completion" | "provider_contract" | "blocked_url" | "inaccessible_url" | "bad_request"): Stable blocker or failure kind.
  - `task.failure.message` (string): Safe assistant-readable failure message.
  - `task.failure.retryable` (boolean): Whether retrying later may reasonably succeed.
  - `task.handoff` (object): Redacted client browser handoff state.
  - `task.handoff.clientUrl` (union): Client-facing portal URL; null after handoff is no longer open.
  - `task.handoff.expiresAt` (string): Handoff expiry timestamp.
  - `task.handoff.handoffId` (string): Durable browser handoff id.
  - `task.handoff.reason` ("login_required" | "mfa_required" | "captcha_required" | "user_control_requested"): Sensitive step the user must complete.
  - `task.handoff.status` ("waiting" | "completed" | "cancelled" | "expired"): Current handoff lifecycle status.
  - `task.mode` ("extract" | "action_prepare" | "auth_context_setup" | "live_handoff"): Browser task mode.
  - `task.objective` (string): Assistant-facing objective for this browser task.
  - `task.preparedAction` (object): Prepared browser action that stopped before final confirmation.
  - `task.preparedAction.reviewBoundary` (string): Final action boundary where browser automation stopped.
  - `task.preparedAction.summary` (string): User-review summary of the prepared page state.
  - `task.preparedAction.targetAction` (string): Website action that was prepared but not submitted.
  - `task.provider` ("browserbase-stagehand"): Browser automation provider used for this task.
  - `task.startUrl` (string): HTTPS URL where the browser task started.
  - `task.status` ("queued" | "running" | "waiting" | "blocked" | "succeeded" | "failed" | "cancelled"): Current durable browser task lifecycle status.
  - `task.updatedAt` (string): Last task update timestamp.

Example input:
```json
{
  "browserTaskId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Example output:
```json
{
  "task": {
    "artifacts": [
      {
        "artifactType": "artifactType_example",
        "byteSize": 1,
        "filename": "filename_example",
        "mimeType": "mimeType_example",
        "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
        "sha256": "sha256_example"
      }
    ],
    "authContextId": "550e8400-e29b-41d4-a716-446655440000",
    "browserTaskId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-05-21T14:30:00.000Z",
    "currentUrl": "https://example.com/item",
    "extractedFields": {},
    "failure": {
      "kind": "login_required",
      "message": "message_example",
      "retryable": true
    },
    "handoff": {
      "clientUrl": "https://example.com/item",
      "expiresAt": "2026-05-21T14:30:00.000Z",
      "handoffId": "550e8400-e29b-41d4-a716-446655440000",
      "reason": "login_required",
      "status": "waiting"
    },
    "mode": "extract",
    "objective": "objective_example",
    "preparedAction": {
      "reviewBoundary": "reviewBoundary_example",
      "summary": "summary_example",
      "targetAction": "targetAction_example"
    },
    "provider": "browserbase-stagehand",
    "startUrl": "https://example.com/item",
    "status": "queued",
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `public_web_browser_task_get`

Use this when a browser task's current status, result, failure, or artifacts are needed. Reads one durable browser task and its profile artifacts. Returns the task lifecycle state, extracted fields, prepared action, artifacts, or structured failure. Use after a browser start tool when you already have the browserTaskId; this is a single status read, not a polling loop. For queued or running tasks, report the current state or continue only if the runtime invocation is already expected to wait briefly. For waiting handoff tasks, send the returned client URL if needed, wait for the user to complete the secure step, then call public_web_browser_task_continue. Use this browser-specific projection for browser task reads.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `task` (object)
- Inputs:
  - `browserTaskId` (required, string): Browser task id to read.
- Outputs:
  - `task` (object): Durable browser task state for assistant use.
  - `task.artifacts` (array): Evidence artifacts captured for the task.
  - `task.artifacts[].artifactType` (string): Internal file type.
  - `task.artifacts[].byteSize` (union): Profile file size in bytes.
  - `task.artifacts[].filename` (union): Stored profile file filename.
  - `task.artifacts[].mimeType` (union): Profile file MIME type.
  - `task.artifacts[].profileFileId` (string): Durable profile file id.
  - `task.artifacts[].sha256` (union): SHA-256 hash.
  - `task.authContextId` (union): Saved browser auth context used by the task, if any.
  - `task.browserTaskId` (string): Durable browser task id.
  - `task.createdAt` (string): Task creation timestamp.
  - `task.currentUrl` (union): Current or final browser page URL.
  - `task.extractedFields` (object): Named fields extracted from the page.
  - `task.failure` (object): Structured browser automation blocker or failure.
  - `task.failure.kind` ("login_required" | "mfa_required" | "captcha_required" | "site_blocked" | "domain_not_allowed" | "ambiguous_page" | "timeout" | "rate_limit" | "missing_config" | "provider_unavailable" | "unknown_completion" | "provider_contract" | "blocked_url" | "inaccessible_url" | "bad_request"): Stable blocker or failure kind.
  - `task.failure.message` (string): Safe assistant-readable failure message.
  - `task.failure.retryable` (boolean): Whether retrying later may reasonably succeed.
  - `task.handoff` (object): Redacted client browser handoff state.
  - `task.handoff.clientUrl` (union): Client-facing portal URL; null after handoff is no longer open.
  - `task.handoff.expiresAt` (string): Handoff expiry timestamp.
  - `task.handoff.handoffId` (string): Durable browser handoff id.
  - `task.handoff.reason` ("login_required" | "mfa_required" | "captcha_required" | "user_control_requested"): Sensitive step the user must complete.
  - `task.handoff.status` ("waiting" | "completed" | "cancelled" | "expired"): Current handoff lifecycle status.
  - `task.mode` ("extract" | "action_prepare" | "auth_context_setup" | "live_handoff"): Browser task mode.
  - `task.objective` (string): Assistant-facing objective for this browser task.
  - `task.preparedAction` (object): Prepared browser action that stopped before final confirmation.
  - `task.preparedAction.reviewBoundary` (string): Final action boundary where browser automation stopped.
  - `task.preparedAction.summary` (string): User-review summary of the prepared page state.
  - `task.preparedAction.targetAction` (string): Website action that was prepared but not submitted.
  - `task.provider` ("browserbase-stagehand"): Browser automation provider used for this task.
  - `task.startUrl` (string): HTTPS URL where the browser task started.
  - `task.status` ("queued" | "running" | "waiting" | "blocked" | "succeeded" | "failed" | "cancelled"): Current durable browser task lifecycle status.
  - `task.updatedAt` (string): Last task update timestamp.

Example input:
```json
{
  "browserTaskId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Example output:
```json
{
  "task": {
    "artifacts": [
      {
        "artifactType": "artifactType_example",
        "byteSize": 1,
        "filename": "filename_example",
        "mimeType": "mimeType_example",
        "profileFileId": "550e8400-e29b-41d4-a716-446655440000",
        "sha256": "sha256_example"
      }
    ],
    "authContextId": "550e8400-e29b-41d4-a716-446655440000",
    "browserTaskId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-05-21T14:30:00.000Z",
    "currentUrl": "https://example.com/item",
    "extractedFields": {},
    "failure": {
      "kind": "login_required",
      "message": "message_example",
      "retryable": true
    },
    "handoff": {
      "clientUrl": "https://example.com/item",
      "expiresAt": "2026-05-21T14:30:00.000Z",
      "handoffId": "550e8400-e29b-41d4-a716-446655440000",
      "reason": "login_required",
      "status": "waiting"
    },
    "mode": "extract",
    "objective": "objective_example",
    "preparedAction": {
      "reviewBoundary": "reviewBoundary_example",
      "summary": "summary_example",
      "targetAction": "targetAction_example"
    },
    "provider": "browserbase-stagehand",
    "startUrl": "https://example.com/item",
    "status": "queued",
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `public_web_fetch_url`

Use this when the assistant already knows a public URL and needs Perplexity to fetch and inspect that exact page. Calls Perplexity Agent API with fetch_url for one known public URL and returns fetched snippets, citations, and a synthesized answer. Returns fetch status, answer, fetched URL content snippets, citations, provider timing, and structured failure or partial status when content is blocked or inaccessible. Use after public_web_search when one source needs fuller inspection. Only public http or https URLs are accepted; localhost, private network, credentialed, and internal URLs are rejected before provider calls. Fetch is best-effort and may return partial content for paywalls, login walls, anti-bot pages, or very large documents.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `answer` (union), `citations` (array), `failure` (object), `fetchedContents` (array), `provider` ("perplexity"), `providerRequestId` (union), `requestedUrl` (string), `status` ("succeeded" | "partial" | "failed"), `tookMs` (integer)
- Inputs:
  - `instructions` (required, string): Specific fetch/extraction instructions for this URL.
  - `maxOutputTokens` (required, integer): Maximum Agent API answer tokens.
  - `objective` (required, string): What the assistant needs from this exact URL.
  - `url` (required, string): Known public http or https URL to fetch through Perplexity.
- Outputs:
  - `answer` (union): Provider answer synthesized from fetched URL content.
  - `citations` (array): Citations or annotations attached to the provider answer.
  - `citations[].title` (union): Citation title when available.
  - `citations[].url` (string): Citation URL.
  - `failure` (object): Structured failure when status is failed.
  - `failure.kind` ("login_required" | "mfa_required" | "captcha_required" | "site_blocked" | "domain_not_allowed" | "ambiguous_page" | "timeout" | "rate_limit" | "missing_config" | "provider_unavailable" | "unknown_completion" | "provider_contract" | "blocked_url" | "inaccessible_url" | "bad_request"): Stable blocker or failure kind.
  - `failure.message` (string): Safe assistant-readable failure message.
  - `failure.retryable` (boolean): Whether retrying later may reasonably succeed.
  - `fetchedContents` (array): Fetched content snippets returned by the fetch_url tool.
  - `fetchedContents[].snippet` (union): Extracted content snippet returned by Perplexity.
  - `fetchedContents[].title` (union): Fetched page title when available.
  - `fetchedContents[].url` (string): Fetched public URL.
  - `provider` ("perplexity"): Public URL fetch provider.
  - `providerRequestId` (union): Redacted Perplexity response id when returned.
  - `requestedUrl` (string): URL requested by the assistant.
  - `status` ("succeeded" | "partial" | "failed"): Fetch request status.
  - `tookMs` (integer): Provider request duration in milliseconds.

Example input:
```json
{
  "instructions": "instructions_example",
  "maxOutputTokens": 1200,
  "objective": "objective_example",
  "url": "https://example.com/item"
}
```

Example output:
```json
{
  "answer": "answer_example",
  "citations": [
    {
      "title": "title_example",
      "url": "https://example.com/item"
    }
  ],
  "failure": {
    "kind": "login_required",
    "message": "message_example",
    "retryable": true
  },
  "fetchedContents": [
    {
      "snippet": "snippet_example",
      "title": "title_example",
      "url": "https://example.com/item"
    }
  ],
  "provider": "perplexity",
  "providerRequestId": "providerRequestId_example",
  "requestedUrl": "https://example.com/item",
  "status": "succeeded",
  "tookMs": 1
}
```

### `public_web_search`

Use this when the user needs current public facts, discovery, news, public documentation, product details, regulations, schedules, or public-source evidence. Calls Perplexity Search API directly and returns normalized ranked public web results with snippets and source URLs. Returns the public web results plus provider status, result count, timing, and structured failure when the provider cannot search. Use this for discovery and broad public research before fetching a specific source. Use domain, date, language, country, and token-budget filters when the user needs a narrower source set. Do not use this for account-specific, cart-specific, logged-in, location-personalized, or interactive website state; use browser tools for those workflows.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `count` (integer), `failure` (object), `provider` ("perplexity"), `query` (string), `results` (array), `status` ("succeeded" | "failed"), `tookMs` (integer)
- Inputs:
  - `count` (required, integer): Maximum number of ranked public web results to return.
  - `country` (optional, string): Optional ISO 3166-1 alpha-2 country filter.
  - `last_updated_after_filter` (optional, string): Optional last-updated lower bound in Perplexity-supported MM/DD/YYYY format.
  - `last_updated_before_filter` (optional, string): Optional last-updated upper bound in Perplexity-supported MM/DD/YYYY format.
  - `max_tokens` (optional, integer): Optional total extracted content budget across search results.
  - `max_tokens_per_page` (optional, integer): Optional extracted content budget per search result.
  - `query` (required, string): Public web search query.
  - `search_after_date_filter` (optional, string): Optional publication date lower bound in Perplexity-supported MM/DD/YYYY format.
  - `search_before_date_filter` (optional, string): Optional publication date upper bound in Perplexity-supported MM/DD/YYYY format.
  - `search_domain_filter` (optional, array): Optional Perplexity domain allowlist or denylist filters.
  - `search_language_filter` (optional, array): Optional ISO 639-1 language filters.
  - `search_recency_filter` (optional, "hour" | "day" | "week" | "month" | "year"): Optional publication recency filter.
- Outputs:
  - `count` (integer): Number of returned normalized results.
  - `failure` (object): Structured failure when status is failed.
  - `failure.kind` ("login_required" | "mfa_required" | "captcha_required" | "site_blocked" | "domain_not_allowed" | "ambiguous_page" | "timeout" | "rate_limit" | "missing_config" | "provider_unavailable" | "unknown_completion" | "provider_contract" | "blocked_url" | "inaccessible_url" | "bad_request"): Stable blocker or failure kind.
  - `failure.message` (string): Safe assistant-readable failure message.
  - `failure.retryable` (boolean): Whether retrying later may reasonably succeed.
  - `provider` ("perplexity"): Public web search provider.
  - `query` (string): Submitted search query.
  - `results` (array): Ranked public search results.
  - `results[].date` (union): Published date when Perplexity returns it.
  - `results[].lastUpdated` (union): Last-updated date when Perplexity returns it.
  - `results[].siteName` (union): Hostname derived from the result URL for assistant display.
  - `results[].snippet` (union): Search result snippet or excerpt.
  - `results[].title` (string): Search result title.
  - `results[].url` (string): Search result public URL.
  - `status` ("succeeded" | "failed"): Search request status.
  - `tookMs` (integer): Provider request duration in milliseconds.

Example input:
```json
{
  "count": 5,
  "country": "country_example",
  "last_updated_after_filter": "last_updated_after_filter_example",
  "last_updated_before_filter": "last_updated_before_filter_example",
  "max_tokens": 1,
  "max_tokens_per_page": 1,
  "query": "query_example",
  "search_after_date_filter": "search_after_date_filter_example",
  "search_before_date_filter": "search_before_date_filter_example",
  "search_domain_filter": [
    "search_domain_filter_example"
  ],
  "search_language_filter": [
    "search_language_filter_example"
  ],
  "search_recency_filter": "hour"
}
```

Example output:
```json
{
  "count": 1,
  "failure": {
    "kind": "login_required",
    "message": "message_example",
    "retryable": true
  },
  "provider": "perplexity",
  "query": "query_example",
  "results": [
    {
      "date": "date_example",
      "lastUpdated": "lastUpdated_example",
      "siteName": "siteName_example",
      "snippet": "snippet_example",
      "title": "title_example",
      "url": "https://example.com/item"
    }
  ],
  "status": "succeeded",
  "tookMs": 1
}
```

### `scheduled_task_create`

Use this when the user wants a durable scheduled assistant task. Creates a scheduled task with a schedule and assistant instructions. Returns the created scheduled task. Use schedule kind='at' for one-time reminders, one final reminder, or tasks that should run once and stop. Use kind='cron' or kind='every' only for recurring work that should continue until changed, paused, or deleted; cron has no until/end-date field. If reusable guidance already exists, reference that guidance by title/key in the instructions instead of copying the whole body. External write: creates durable scheduled assistant work. Before calling, the title, schedule, and instructions must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `scheduledTask` (object)
- Inputs:
  - `instructions` (required, string): What the assistant should do each time this task runs.
  - `schedule` (required, union): Schedule definition. Use kind='at' for one-time tasks; use kind='every' or kind='cron' only for recurring tasks.
  - `title` (required, string): Short label for the scheduled task.
- Outputs:
  - `scheduledTask` (object): Scheduled task result.
  - `scheduledTask.createdAt` (string): Timestamp when the scheduled task was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.id` (string): Backend scheduled task id. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `scheduledTask.instructions` (string): Instructions the assistant should follow each time this task runs.
  - `scheduledTask.lastRunAt` (union): Most recent run timestamp, or null if the task has not run. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.nextRunAt` (union): Next run timestamp, or null if no run is currently scheduled. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.revision` (integer): Optimistic-concurrency revision for updates.
  - `scheduledTask.schedule` (union): Assistant schedule definition. Choose at for one-time/final reminders; choose every or cron only for recurring work.
  - `scheduledTask.status` ("active" | "paused" | "deleted"): Current status of the scheduled task.
  - `scheduledTask.target` (object): What should happen when this scheduled task fires.
  - `scheduledTask.target.kind` ("assistant_instructions"): Scheduled task target kind. Scheduled tasks run the saved assistant instructions.
  - `scheduledTask.timezone` (union): IANA timezone used for this scheduled task. Example: `"America/Toronto"`.
  - `scheduledTask.title` (string): Short scheduled task title.
  - `scheduledTask.updatedAt` (string): Timestamp when the scheduled task was last updated. Example: `"2026-05-21T14:30:00.000Z"`.

Example input:
```json
{
  "instructions": "instructions_example",
  "schedule": {
    "at": "2026-05-21T14:30:00.000Z",
    "kind": "at"
  },
  "title": "title_example"
}
```

Example output:
```json
{
  "scheduledTask": {
    "createdAt": "2026-05-21T14:30:00.000Z",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "instructions": "instructions_example",
    "lastRunAt": "2026-05-21T14:30:00.000Z",
    "nextRunAt": "2026-05-21T14:30:00.000Z",
    "revision": 1,
    "schedule": {
      "at": "2026-05-21T14:30:00.000Z",
      "kind": "at"
    },
    "status": "active",
    "target": {
      "kind": "assistant_instructions"
    },
    "timezone": "America/Toronto",
    "title": "title_example",
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `scheduled_task_delete`

Use this when the user wants a scheduled assistant task to stop permanently. Soft-deletes a scheduled assistant task. Returns the deleted scheduled task. External write: marks durable scheduled assistant work as deleted. Before calling, expectedRevision must come from get or list output.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `scheduledTask` (object)
- Inputs:
  - `expectedRevision` (required, integer): Current scheduled task revision.
  - `scheduledTaskId` (required, string): Scheduled task id.
- Outputs:
  - `scheduledTask` (object): Scheduled task result.
  - `scheduledTask.createdAt` (string): Timestamp when the scheduled task was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.id` (string): Backend scheduled task id. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `scheduledTask.instructions` (string): Instructions the assistant should follow each time this task runs.
  - `scheduledTask.lastRunAt` (union): Most recent run timestamp, or null if the task has not run. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.nextRunAt` (union): Next run timestamp, or null if no run is currently scheduled. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.revision` (integer): Optimistic-concurrency revision for updates.
  - `scheduledTask.schedule` (union): Assistant schedule definition. Choose at for one-time/final reminders; choose every or cron only for recurring work.
  - `scheduledTask.status` ("active" | "paused" | "deleted"): Current status of the scheduled task.
  - `scheduledTask.target` (object): What should happen when this scheduled task fires.
  - `scheduledTask.target.kind` ("assistant_instructions"): Scheduled task target kind. Scheduled tasks run the saved assistant instructions.
  - `scheduledTask.timezone` (union): IANA timezone used for this scheduled task. Example: `"America/Toronto"`.
  - `scheduledTask.title` (string): Short scheduled task title.
  - `scheduledTask.updatedAt` (string): Timestamp when the scheduled task was last updated. Example: `"2026-05-21T14:30:00.000Z"`.

Example input:
```json
{
  "expectedRevision": 1,
  "scheduledTaskId": "scheduledTaskId_example"
}
```

Example output:
```json
{
  "scheduledTask": {
    "createdAt": "2026-05-21T14:30:00.000Z",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "instructions": "instructions_example",
    "lastRunAt": "2026-05-21T14:30:00.000Z",
    "nextRunAt": "2026-05-21T14:30:00.000Z",
    "revision": 1,
    "schedule": {
      "at": "2026-05-21T14:30:00.000Z",
      "kind": "at"
    },
    "status": "active",
    "target": {
      "kind": "assistant_instructions"
    },
    "timezone": "America/Toronto",
    "title": "title_example",
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `scheduled_task_get`

Use this when one scheduled assistant task needs inspection by id. Fetches one scheduled assistant task. Returns scheduled task detail, schedule, status, and revision.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `scheduledTask` (object)
- Inputs:
  - `scheduledTaskId` (required, string): Scheduled task id.
- Outputs:
  - `scheduledTask` (object): Scheduled task result.
  - `scheduledTask.createdAt` (string): Timestamp when the scheduled task was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.id` (string): Backend scheduled task id. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `scheduledTask.instructions` (string): Instructions the assistant should follow each time this task runs.
  - `scheduledTask.lastRunAt` (union): Most recent run timestamp, or null if the task has not run. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.nextRunAt` (union): Next run timestamp, or null if no run is currently scheduled. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.revision` (integer): Optimistic-concurrency revision for updates.
  - `scheduledTask.schedule` (union): Assistant schedule definition. Choose at for one-time/final reminders; choose every or cron only for recurring work.
  - `scheduledTask.status` ("active" | "paused" | "deleted"): Current status of the scheduled task.
  - `scheduledTask.target` (object): What should happen when this scheduled task fires.
  - `scheduledTask.target.kind` ("assistant_instructions"): Scheduled task target kind. Scheduled tasks run the saved assistant instructions.
  - `scheduledTask.timezone` (union): IANA timezone used for this scheduled task. Example: `"America/Toronto"`.
  - `scheduledTask.title` (string): Short scheduled task title.
  - `scheduledTask.updatedAt` (string): Timestamp when the scheduled task was last updated. Example: `"2026-05-21T14:30:00.000Z"`.

Example input:
```json
{
  "scheduledTaskId": "scheduledTaskId_example"
}
```

Example output:
```json
{
  "scheduledTask": {
    "createdAt": "2026-05-21T14:30:00.000Z",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "instructions": "instructions_example",
    "lastRunAt": "2026-05-21T14:30:00.000Z",
    "nextRunAt": "2026-05-21T14:30:00.000Z",
    "revision": 1,
    "schedule": {
      "at": "2026-05-21T14:30:00.000Z",
      "kind": "at"
    },
    "status": "active",
    "target": {
      "kind": "assistant_instructions"
    },
    "timezone": "America/Toronto",
    "title": "title_example",
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `scheduled_task_list`

Use this when the user asks about this profile's scheduled assistant tasks. Lists scheduled assistant tasks for this profile. Returns scheduled task records with schedule, status, target, and revision.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `scheduledTasks` (array)
- Inputs:
  - `limit` (required, integer): Maximum number of scheduled tasks to return.
  - `status` (required, "active" | "paused" | "deleted" | "all"): Which scheduled tasks to list. Deleted tasks are hidden unless requested.
- Outputs:
  - `scheduledTasks` (array): Scheduled assistant tasks for this profile.
  - `scheduledTasks[].createdAt` (string): Timestamp when the scheduled task was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTasks[].id` (string): Backend scheduled task id. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `scheduledTasks[].instructions` (string): Instructions the assistant should follow each time this task runs.
  - `scheduledTasks[].lastRunAt` (union): Most recent run timestamp, or null if the task has not run. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTasks[].nextRunAt` (union): Next run timestamp, or null if no run is currently scheduled. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTasks[].revision` (integer): Optimistic-concurrency revision for updates.
  - `scheduledTasks[].schedule` (union): Assistant schedule definition. Choose at for one-time/final reminders; choose every or cron only for recurring work.
  - `scheduledTasks[].status` ("active" | "paused" | "deleted"): Current status of the scheduled task.
  - `scheduledTasks[].target` (object): What should happen when this scheduled task fires.
  - `scheduledTasks[].target.kind` ("assistant_instructions"): Scheduled task target kind. Scheduled tasks run the saved assistant instructions.
  - `scheduledTasks[].timezone` (union): IANA timezone used for this scheduled task. Example: `"America/Toronto"`.
  - `scheduledTasks[].title` (string): Short scheduled task title.
  - `scheduledTasks[].updatedAt` (string): Timestamp when the scheduled task was last updated. Example: `"2026-05-21T14:30:00.000Z"`.

Example input:
```json
{
  "limit": 25,
  "status": "active"
}
```

Example output:
```json
{
  "scheduledTasks": [
    {
      "createdAt": "2026-05-21T14:30:00.000Z",
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "instructions": "instructions_example",
      "lastRunAt": "2026-05-21T14:30:00.000Z",
      "nextRunAt": "2026-05-21T14:30:00.000Z",
      "revision": 1,
      "schedule": {
        "at": "2026-05-21T14:30:00.000Z",
        "kind": "at"
      },
      "status": "active",
      "target": {
        "kind": "assistant_instructions"
      },
      "timezone": "America/Toronto",
      "title": "title_example",
      "updatedAt": "2026-05-21T14:30:00.000Z"
    }
  ]
}
```

### `scheduled_task_pause`

Use this when the user wants a scheduled assistant task paused without deleting it. Pauses a scheduled assistant task. Returns the paused scheduled task. External write: prevents runs while preserving the task. Before calling, expectedRevision must come from get or list output.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `scheduledTask` (object)
- Inputs:
  - `expectedRevision` (required, integer): Current scheduled task revision.
  - `scheduledTaskId` (required, string): Scheduled task id.
- Outputs:
  - `scheduledTask` (object): Scheduled task result.
  - `scheduledTask.createdAt` (string): Timestamp when the scheduled task was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.id` (string): Backend scheduled task id. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `scheduledTask.instructions` (string): Instructions the assistant should follow each time this task runs.
  - `scheduledTask.lastRunAt` (union): Most recent run timestamp, or null if the task has not run. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.nextRunAt` (union): Next run timestamp, or null if no run is currently scheduled. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.revision` (integer): Optimistic-concurrency revision for updates.
  - `scheduledTask.schedule` (union): Assistant schedule definition. Choose at for one-time/final reminders; choose every or cron only for recurring work.
  - `scheduledTask.status` ("active" | "paused" | "deleted"): Current status of the scheduled task.
  - `scheduledTask.target` (object): What should happen when this scheduled task fires.
  - `scheduledTask.target.kind` ("assistant_instructions"): Scheduled task target kind. Scheduled tasks run the saved assistant instructions.
  - `scheduledTask.timezone` (union): IANA timezone used for this scheduled task. Example: `"America/Toronto"`.
  - `scheduledTask.title` (string): Short scheduled task title.
  - `scheduledTask.updatedAt` (string): Timestamp when the scheduled task was last updated. Example: `"2026-05-21T14:30:00.000Z"`.

Example input:
```json
{
  "expectedRevision": 1,
  "scheduledTaskId": "scheduledTaskId_example"
}
```

Example output:
```json
{
  "scheduledTask": {
    "createdAt": "2026-05-21T14:30:00.000Z",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "instructions": "instructions_example",
    "lastRunAt": "2026-05-21T14:30:00.000Z",
    "nextRunAt": "2026-05-21T14:30:00.000Z",
    "revision": 1,
    "schedule": {
      "at": "2026-05-21T14:30:00.000Z",
      "kind": "at"
    },
    "status": "active",
    "target": {
      "kind": "assistant_instructions"
    },
    "timezone": "America/Toronto",
    "title": "title_example",
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `scheduled_task_preview`

Use this when the user wants to preview a scheduled task schedule before saving it. Previews next fire times for a schedule. Returns candidate next fire times. This does not save a scheduled task. Preview kind='at' for one-time reminders and kind='cron' or kind='every' for recurring work.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `nextRunAt` (array)
- Inputs:
  - `count` (required, integer): Number of future fire times to return.
  - `schedule` (required, union): Schedule to preview without saving.
- Outputs:
  - `nextRunAt` (array): Previewed future run timestamps for the proposed schedule.

Example input:
```json
{
  "count": 5,
  "schedule": {
    "at": "2026-05-21T14:30:00.000Z",
    "kind": "at"
  }
}
```

Example output:
```json
{
  "nextRunAt": [
    "2026-05-21T14:30:00.000Z"
  ]
}
```

### `scheduled_task_resume`

Use this when the user wants a paused scheduled assistant task to run again. Resumes a paused scheduled task. Returns the resumed scheduled task. External write: reactivates durable scheduled assistant work. Before calling, expectedRevision must come from get or list output.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `scheduledTask` (object)
- Inputs:
  - `expectedRevision` (required, integer): Current scheduled task revision.
  - `scheduledTaskId` (required, string): Scheduled task id.
- Outputs:
  - `scheduledTask` (object): Scheduled task result.
  - `scheduledTask.createdAt` (string): Timestamp when the scheduled task was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.id` (string): Backend scheduled task id. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `scheduledTask.instructions` (string): Instructions the assistant should follow each time this task runs.
  - `scheduledTask.lastRunAt` (union): Most recent run timestamp, or null if the task has not run. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.nextRunAt` (union): Next run timestamp, or null if no run is currently scheduled. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.revision` (integer): Optimistic-concurrency revision for updates.
  - `scheduledTask.schedule` (union): Assistant schedule definition. Choose at for one-time/final reminders; choose every or cron only for recurring work.
  - `scheduledTask.status` ("active" | "paused" | "deleted"): Current status of the scheduled task.
  - `scheduledTask.target` (object): What should happen when this scheduled task fires.
  - `scheduledTask.target.kind` ("assistant_instructions"): Scheduled task target kind. Scheduled tasks run the saved assistant instructions.
  - `scheduledTask.timezone` (union): IANA timezone used for this scheduled task. Example: `"America/Toronto"`.
  - `scheduledTask.title` (string): Short scheduled task title.
  - `scheduledTask.updatedAt` (string): Timestamp when the scheduled task was last updated. Example: `"2026-05-21T14:30:00.000Z"`.

Example input:
```json
{
  "expectedRevision": 1,
  "scheduledTaskId": "scheduledTaskId_example"
}
```

Example output:
```json
{
  "scheduledTask": {
    "createdAt": "2026-05-21T14:30:00.000Z",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "instructions": "instructions_example",
    "lastRunAt": "2026-05-21T14:30:00.000Z",
    "nextRunAt": "2026-05-21T14:30:00.000Z",
    "revision": 1,
    "schedule": {
      "at": "2026-05-21T14:30:00.000Z",
      "kind": "at"
    },
    "status": "active",
    "target": {
      "kind": "assistant_instructions"
    },
    "timezone": "America/Toronto",
    "title": "title_example",
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `scheduled_task_update`

Use this when the user wants to change an existing scheduled assistant task. Updates title, instructions, or schedule; at least one must be provided. Returns the updated scheduled task. When converting a temporary recurring reminder into a final reminder, update the schedule to kind='at' instead of relying on prose like 'delete after this date'. Use recurring schedules only for work that should continue until another explicit update, pause, or delete. If existing profile guidance owns reusable behavior, keep scheduled task instructions short and reference that guidance by title/key. External write: mutates durable scheduled assistant work. Before calling, expectedRevision must come from get or list output.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `scheduledTask` (object)
- Inputs:
  - `expectedRevision` (required, integer): Current scheduled task revision.
  - `instructions` (optional, string): New scheduled task instructions.
  - `schedule` (optional, union): Assistant schedule definition. Choose at for one-time/final reminders; choose every or cron only for recurring work.
  - `scheduledTaskId` (required, string): Scheduled task id.
  - `title` (optional, string): New scheduled task title.
- Outputs:
  - `scheduledTask` (object): Scheduled task result.
  - `scheduledTask.createdAt` (string): Timestamp when the scheduled task was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.id` (string): Backend scheduled task id. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `scheduledTask.instructions` (string): Instructions the assistant should follow each time this task runs.
  - `scheduledTask.lastRunAt` (union): Most recent run timestamp, or null if the task has not run. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.nextRunAt` (union): Next run timestamp, or null if no run is currently scheduled. Example: `"2026-05-21T14:30:00.000Z"`.
  - `scheduledTask.revision` (integer): Optimistic-concurrency revision for updates.
  - `scheduledTask.schedule` (union): Assistant schedule definition. Choose at for one-time/final reminders; choose every or cron only for recurring work.
  - `scheduledTask.status` ("active" | "paused" | "deleted"): Current status of the scheduled task.
  - `scheduledTask.target` (object): What should happen when this scheduled task fires.
  - `scheduledTask.target.kind` ("assistant_instructions"): Scheduled task target kind. Scheduled tasks run the saved assistant instructions.
  - `scheduledTask.timezone` (union): IANA timezone used for this scheduled task. Example: `"America/Toronto"`.
  - `scheduledTask.title` (string): Short scheduled task title.
  - `scheduledTask.updatedAt` (string): Timestamp when the scheduled task was last updated. Example: `"2026-05-21T14:30:00.000Z"`.

Example input:
```json
{
  "expectedRevision": 1,
  "instructions": "instructions_example",
  "schedule": {
    "at": "2026-05-21T14:30:00.000Z",
    "kind": "at"
  },
  "scheduledTaskId": "scheduledTaskId_example",
  "title": "title_example"
}
```

Example output:
```json
{
  "scheduledTask": {
    "createdAt": "2026-05-21T14:30:00.000Z",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "instructions": "instructions_example",
    "lastRunAt": "2026-05-21T14:30:00.000Z",
    "nextRunAt": "2026-05-21T14:30:00.000Z",
    "revision": 1,
    "schedule": {
      "at": "2026-05-21T14:30:00.000Z",
      "kind": "at"
    },
    "status": "active",
    "target": {
      "kind": "assistant_instructions"
    },
    "timezone": "America/Toronto",
    "title": "title_example",
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `time_resolve`

Use this when a user-visible answer, provider query, billing period, date range, or relative date depends on timezone. Resolves timestamps and profile-local civil dates using the profile timezone. Returns profile timezone, local labels, and UTC query bounds.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `resolvedAt` (string), `results` (array), `timezone` (string)
- Inputs:
  - `queries` (required, array): Timestamps or local civil dates to resolve deterministically in the profile timezone.
- Outputs:
  - `resolvedAt` (string): UTC timestamp when the resolver ran. Example: `"2026-05-21T14:30:00.000Z"`.
  - `results` (array): Resolved timestamp or local civil date range results, in input order.
  - `timezone` (string): Profile IANA timezone used for every resolution. Example: `"America/Toronto"`.

Example input:
```json
{
  "queries": [
    {
      "instant": "2026-05-21T14:30:00.000Z",
      "kind": "instant"
    }
  ]
}
```

Example output:
```json
{
  "resolvedAt": "2026-05-21T14:30:00.000Z",
  "results": [
    {
      "instant": "2026-05-21T14:30:00.000Z",
      "kind": "instant",
      "label": "May 31, 2026, 8:10 PM EDT",
      "localDate": "2026-05-31",
      "localDateTime": "2026-05-31 20:10",
      "localTime": "20:10"
    }
  ],
  "timezone": "America/Toronto"
}
```

### `work_item_get`

Use this when one assistant work item needs inspection by id. Fetches one assistant work item for this profile. Returns work item details, curated event facts, current status, and resolved guidance.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `guidanceMarkdown` (union), `workItem` (object)
- Inputs:
  - `workItemId` (required, string): Assistant work item id returned by work_item_list or another structured work item result.
- Outputs:
  - `guidanceMarkdown` (union): Resolved runtime guidance for the work item, or null when none applies.
  - `workItem` (object): Requested assistant work item.
  - `workItem.detail` (union): Optional plain-language detail for the work item.
  - `workItem.dueAt` (union): Timestamp when the work item became due, or null when not scheduled. Example: `"2026-05-21T14:30:00.000Z"`.
  - `workItem.event` (object): Curated event facts the assistant should process, such as provider ids, message metadata, and attachments.
  - `workItem.guidanceIds` (array): Source runtime guidance ids attached to this work item.
  - `workItem.id` (string): Backend assistant work item id. Pass this value as workItemId to work item mutation tools. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `workItem.instructions` (union): Optional instructions for processing the work item.
  - `workItem.kind` ("google_calendar.event.changed" | "outlook_calendar.event.changed" | "gmail.email.received" | "outlook_mail.email.received" | "twilio.sms.received" | "monday.item.created" | "monday.item.updated" | "scheduled.task" | "boldsign.signature_request.changed" | "google_drive.file.created" | "google_drive.file.updated" | "google_drive.file.deleted" | "microsoft_onedrive.file.created" | "microsoft_onedrive.file.updated" | "microsoft_onedrive.file.deleted" | "microsoft_sharepoint.file.created" | "microsoft_sharepoint.file.updated" | "microsoft_sharepoint.file.deleted"): Kind of assistant work to process.
  - `workItem.lastError` (union): Most recent processing error for this work item, if any.
  - `workItem.profileGuidanceDbIds` (array): DB-owned profile guidance ids attached to this work item.
  - `workItem.relatedActionId` (union): Related profile action id when this work item tracks an action. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `workItem.relatedScheduledTaskId` (union): Related scheduled task id when this work item was created by a schedule. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `workItem.status` ("pending" | "running" | "succeeded" | "ignored" | "failed" | "cancelled"): Current lifecycle status of the work item.
  - `workItem.title` (string): Short work item title.

Example input:
```json
{
  "workItemId": "workItemId_example"
}
```

Example output:
```json
{
  "guidanceMarkdown": "guidanceMarkdown_example",
  "workItem": {
    "detail": "detail_example",
    "dueAt": "2026-05-21T14:30:00.000Z",
    "event": {},
    "guidanceIds": [
      "guidanceIds_example"
    ],
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "instructions": "instructions_example",
    "kind": "google_calendar.event.changed",
    "lastError": "lastError_example",
    "profileGuidanceDbIds": [
      "550e8400-e29b-41d4-a716-446655440000"
    ],
    "relatedActionId": "550e8400-e29b-41d4-a716-446655440000",
    "relatedScheduledTaskId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "title": "title_example"
  }
}
```

### `work_item_list`

Use this when the user asks to inspect queued tasks without executing the next item now. Lists assistant work items for this profile. Returns work item summaries and statuses. Do not use this when the user wants pending backend work executed; backend jobs execute work items directly.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `workItems` (array)
- Inputs:
  - `limit` (required, integer): Maximum number of assistant work items to return.
  - `statuses` (required, array): Assistant work item statuses to include.
- Outputs:
  - `workItems` (array): Assistant work items listed.
  - `workItems[].dueAt` (union): Timestamp when the work item became due, or null when not scheduled. Example: `"2026-05-21T14:30:00.000Z"`.
  - `workItems[].id` (string): Backend assistant work item id. Pass this value as workItemId to work item mutation tools. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `workItems[].kind` ("google_calendar.event.changed" | "outlook_calendar.event.changed" | "gmail.email.received" | "outlook_mail.email.received" | "twilio.sms.received" | "monday.item.created" | "monday.item.updated" | "scheduled.task" | "boldsign.signature_request.changed" | "google_drive.file.created" | "google_drive.file.updated" | "google_drive.file.deleted" | "microsoft_onedrive.file.created" | "microsoft_onedrive.file.updated" | "microsoft_onedrive.file.deleted" | "microsoft_sharepoint.file.created" | "microsoft_sharepoint.file.updated" | "microsoft_sharepoint.file.deleted"): Kind of assistant work to process.
  - `workItems[].lastError` (union): Most recent processing error for this work item, if any.
  - `workItems[].relatedActionId` (union): Related profile action id when this work item tracks an action. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `workItems[].relatedScheduledTaskId` (union): Related scheduled task id when this work item was created by a schedule. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `workItems[].status` ("pending" | "running" | "succeeded" | "ignored" | "failed" | "cancelled"): Current lifecycle status of the work item.
  - `workItems[].title` (string): Short work item title.

Example input:
```json
{
  "limit": 10,
  "statuses": [
    "pending",
    "running"
  ]
}
```

Example output:
```json
{
  "workItems": [
    {
      "dueAt": "2026-05-21T14:30:00.000Z",
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "kind": "google_calendar.event.changed",
      "lastError": "lastError_example",
      "relatedActionId": "550e8400-e29b-41d4-a716-446655440000",
      "relatedScheduledTaskId": "550e8400-e29b-41d4-a716-446655440000",
      "status": "pending",
      "title": "title_example"
    }
  ]
}
```

### `work_route_create`

Use this when the user wants provider events to trigger queued assistant work. Creates one profile trigger for a supported provider event type. Returns the created trigger. Keep instructions focused on what this provider event should trigger. Omit connectedProviderAccountId to create the default route for an event type. Pass it only when the route should apply to one connected provider account. If reusable workflow rules already exist in profile guidance, reference that guidance by title/key instead of copying the full workflow into the route. External write: creates durable trigger configuration. Before calling, event type and trigger instructions must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `workRoute` (object)
- Inputs:
  - `connectedProviderAccountId` (optional, string): Optional connected provider account id. Pass this to create instructions for only one account; omit it to create the default route for this event type.
  - `eventType` (required, "google_calendar.event.changed" | "outlook_calendar.event.changed" | "gmail.email.received" | "outlook_mail.email.received" | "twilio.sms.received" | "monday.item.created" | "monday.item.updated" | "boldsign.signature_request.changed" | "google_drive.file.created" | "google_drive.file.updated" | "google_drive.file.deleted" | "microsoft_onedrive.file.created" | "microsoft_onedrive.file.updated" | "microsoft_onedrive.file.deleted" | "microsoft_sharepoint.file.created" | "microsoft_sharepoint.file.updated" | "microsoft_sharepoint.file.deleted"): Provider event type that should create assistant work for this profile.
  - `instructions` (required, string): Instructions to add to work items created by this trigger. When reusable workflow rules already exist in selected profile guidance, reference the guidance by title/key and keep route instructions focused on event-specific behavior.
  - `priority` (optional, integer): Optional priority override for work items created by this trigger.
- Outputs:
  - `workRoute` (object): Profile trigger result.
  - `workRoute.connectedAccount` (union): Connected account summary for scoped triggers, or null for default triggers.
  - `workRoute.connectedAccount.accountEmail` (union): Email address on the connected account when the provider exposes one.
  - `workRoute.connectedAccount.displayLabel` (union): Maintainer-facing display label for the connected account.
  - `workRoute.connectedAccount.id` (string): Connected provider account id for this scoped trigger.
  - `workRoute.connectedAccount.provider` (string): Provider key for the connected account.
  - `workRoute.connectedProviderAccountId` (union): Connected provider account id this trigger is scoped to, or null when it is the profile-level default for the event type.
  - `workRoute.createdAt` (string): Timestamp when this trigger was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `workRoute.eventType` ("google_calendar.event.changed" | "outlook_calendar.event.changed" | "gmail.email.received" | "outlook_mail.email.received" | "twilio.sms.received" | "monday.item.created" | "monday.item.updated" | "boldsign.signature_request.changed" | "google_drive.file.created" | "google_drive.file.updated" | "google_drive.file.deleted" | "microsoft_onedrive.file.created" | "microsoft_onedrive.file.updated" | "microsoft_onedrive.file.deleted" | "microsoft_sharepoint.file.created" | "microsoft_sharepoint.file.updated" | "microsoft_sharepoint.file.deleted"): Provider event type that triggers assistant work.
  - `workRoute.id` (string): Backend work route id. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `workRoute.instructions` (string): Instructions added to assistant work items created by this trigger.
  - `workRoute.priority` (union): Optional priority override for work items created by this trigger.
  - `workRoute.updatedAt` (string): Timestamp when this trigger was last updated. Example: `"2026-05-21T14:30:00.000Z"`.

Example input:
```json
{
  "connectedProviderAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "google_calendar.event.changed",
  "instructions": "instructions_example",
  "priority": 1
}
```

Example output:
```json
{
  "workRoute": {
    "connectedAccount": {
      "accountEmail": "accountEmail_example",
      "displayLabel": "displayLabel_example",
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "provider": "provider_example"
    },
    "connectedProviderAccountId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-05-21T14:30:00.000Z",
    "eventType": "google_calendar.event.changed",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "instructions": "instructions_example",
    "priority": 1,
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `work_route_delete`

Use this when the user wants a provider-event trigger to stop creating queued assistant work. Deletes one profile trigger. Returns the deleted trigger. External write: removes durable trigger configuration. Before calling, the exact trigger id must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `workRoute` (object)
- Inputs:
  - `workRouteId` (required, string): Work route id returned by work_route_list or create.
- Outputs:
  - `workRoute` (object): Profile trigger result.
  - `workRoute.connectedAccount` (union): Connected account summary for scoped triggers, or null for default triggers.
  - `workRoute.connectedAccount.accountEmail` (union): Email address on the connected account when the provider exposes one.
  - `workRoute.connectedAccount.displayLabel` (union): Maintainer-facing display label for the connected account.
  - `workRoute.connectedAccount.id` (string): Connected provider account id for this scoped trigger.
  - `workRoute.connectedAccount.provider` (string): Provider key for the connected account.
  - `workRoute.connectedProviderAccountId` (union): Connected provider account id this trigger is scoped to, or null when it is the profile-level default for the event type.
  - `workRoute.createdAt` (string): Timestamp when this trigger was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `workRoute.eventType` ("google_calendar.event.changed" | "outlook_calendar.event.changed" | "gmail.email.received" | "outlook_mail.email.received" | "twilio.sms.received" | "monday.item.created" | "monday.item.updated" | "boldsign.signature_request.changed" | "google_drive.file.created" | "google_drive.file.updated" | "google_drive.file.deleted" | "microsoft_onedrive.file.created" | "microsoft_onedrive.file.updated" | "microsoft_onedrive.file.deleted" | "microsoft_sharepoint.file.created" | "microsoft_sharepoint.file.updated" | "microsoft_sharepoint.file.deleted"): Provider event type that triggers assistant work.
  - `workRoute.id` (string): Backend work route id. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `workRoute.instructions` (string): Instructions added to assistant work items created by this trigger.
  - `workRoute.priority` (union): Optional priority override for work items created by this trigger.
  - `workRoute.updatedAt` (string): Timestamp when this trigger was last updated. Example: `"2026-05-21T14:30:00.000Z"`.

Example input:
```json
{
  "workRouteId": "workRouteId_example"
}
```

Example output:
```json
{
  "workRoute": {
    "connectedAccount": {
      "accountEmail": "accountEmail_example",
      "displayLabel": "displayLabel_example",
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "provider": "provider_example"
    },
    "connectedProviderAccountId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-05-21T14:30:00.000Z",
    "eventType": "google_calendar.event.changed",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "instructions": "instructions_example",
    "priority": 1,
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `work_route_list`

Use this when the user asks what provider events currently trigger queued assistant work. Lists profile triggers that route provider events into work items. Returns trigger ids, event types, optional connected-account scope, instructions, priorities, and timestamps.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `workRoutes` (array)
- Inputs:
  - None
- Outputs:
  - `workRoutes` (array): Profile triggers listed.
  - `workRoutes[].connectedAccount` (union): Connected account summary for scoped triggers, or null for default triggers.
  - `workRoutes[].connectedAccount.accountEmail` (union): Email address on the connected account when the provider exposes one.
  - `workRoutes[].connectedAccount.displayLabel` (union): Maintainer-facing display label for the connected account.
  - `workRoutes[].connectedAccount.id` (string): Connected provider account id for this scoped trigger.
  - `workRoutes[].connectedAccount.provider` (string): Provider key for the connected account.
  - `workRoutes[].connectedProviderAccountId` (union): Connected provider account id this trigger is scoped to, or null when it is the profile-level default for the event type.
  - `workRoutes[].createdAt` (string): Timestamp when this trigger was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `workRoutes[].eventType` ("google_calendar.event.changed" | "outlook_calendar.event.changed" | "gmail.email.received" | "outlook_mail.email.received" | "twilio.sms.received" | "monday.item.created" | "monday.item.updated" | "boldsign.signature_request.changed" | "google_drive.file.created" | "google_drive.file.updated" | "google_drive.file.deleted" | "microsoft_onedrive.file.created" | "microsoft_onedrive.file.updated" | "microsoft_onedrive.file.deleted" | "microsoft_sharepoint.file.created" | "microsoft_sharepoint.file.updated" | "microsoft_sharepoint.file.deleted"): Provider event type that triggers assistant work.
  - `workRoutes[].id` (string): Backend work route id. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `workRoutes[].instructions` (string): Instructions added to assistant work items created by this trigger.
  - `workRoutes[].priority` (union): Optional priority override for work items created by this trigger.
  - `workRoutes[].updatedAt` (string): Timestamp when this trigger was last updated. Example: `"2026-05-21T14:30:00.000Z"`.

Example input:
```json
{}
```

Example output:
```json
{
  "workRoutes": [
    {
      "connectedAccount": {
        "accountEmail": "accountEmail_example",
        "displayLabel": "displayLabel_example",
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "provider": "provider_example"
      },
      "connectedProviderAccountId": "550e8400-e29b-41d4-a716-446655440000",
      "createdAt": "2026-05-21T14:30:00.000Z",
      "eventType": "google_calendar.event.changed",
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "instructions": "instructions_example",
      "priority": 1,
      "updatedAt": "2026-05-21T14:30:00.000Z"
    }
  ]
}
```

### `work_route_update`

Use this when the user wants to change an existing provider-event trigger. Updates a work route's instructions or priority. Returns the updated trigger. Prefer short event-specific instructions that reference relevant profile guidance by title/key for reusable workflow details. External write: mutates durable trigger configuration. Before calling, only changed fields should be passed and the exact trigger must be clear.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `workRoute` (object)
- Inputs:
  - `instructions` (optional, string): Replacement instructions for this trigger. Prefer referencing existing profile guidance by title/key instead of duplicating long reusable workflow rules.
  - `priority` (optional, union): Replacement priority override, or null to clear it.
  - `workRouteId` (required, string): Work route id returned by work_route_list or create.
- Outputs:
  - `workRoute` (object): Profile trigger result.
  - `workRoute.connectedAccount` (union): Connected account summary for scoped triggers, or null for default triggers.
  - `workRoute.connectedAccount.accountEmail` (union): Email address on the connected account when the provider exposes one.
  - `workRoute.connectedAccount.displayLabel` (union): Maintainer-facing display label for the connected account.
  - `workRoute.connectedAccount.id` (string): Connected provider account id for this scoped trigger.
  - `workRoute.connectedAccount.provider` (string): Provider key for the connected account.
  - `workRoute.connectedProviderAccountId` (union): Connected provider account id this trigger is scoped to, or null when it is the profile-level default for the event type.
  - `workRoute.createdAt` (string): Timestamp when this trigger was created. Example: `"2026-05-21T14:30:00.000Z"`.
  - `workRoute.eventType` ("google_calendar.event.changed" | "outlook_calendar.event.changed" | "gmail.email.received" | "outlook_mail.email.received" | "twilio.sms.received" | "monday.item.created" | "monday.item.updated" | "boldsign.signature_request.changed" | "google_drive.file.created" | "google_drive.file.updated" | "google_drive.file.deleted" | "microsoft_onedrive.file.created" | "microsoft_onedrive.file.updated" | "microsoft_onedrive.file.deleted" | "microsoft_sharepoint.file.created" | "microsoft_sharepoint.file.updated" | "microsoft_sharepoint.file.deleted"): Provider event type that triggers assistant work.
  - `workRoute.id` (string): Backend work route id. Example: `"550e8400-e29b-41d4-a716-446655440000"`.
  - `workRoute.instructions` (string): Instructions added to assistant work items created by this trigger.
  - `workRoute.priority` (union): Optional priority override for work items created by this trigger.
  - `workRoute.updatedAt` (string): Timestamp when this trigger was last updated. Example: `"2026-05-21T14:30:00.000Z"`.

Example input:
```json
{
  "instructions": "instructions_example",
  "priority": 1,
  "workRouteId": "workRouteId_example"
}
```

Example output:
```json
{
  "workRoute": {
    "connectedAccount": {
      "accountEmail": "accountEmail_example",
      "displayLabel": "displayLabel_example",
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "provider": "provider_example"
    },
    "connectedProviderAccountId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-05-21T14:30:00.000Z",
    "eventType": "google_calendar.event.changed",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "instructions": "instructions_example",
    "priority": 1,
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `write_policy_get`

Use this when the user asks about current approval or auto-execute settings, or before changing approval behavior for safety-sensitive provider actions. Fetches the active profile write policy. Returns default write policy mode and explicit modes for canonical action ids.

- Execution: `backend_proxy`
- Effect: `read`
- Returns: `writePolicy` (object)
- Inputs:
  - None
- Outputs:
  - `writePolicy` (object): Current write policy.
  - `writePolicy.id` (string): Backend write policy id.
  - `writePolicy.rules` (object): Write policy rules currently in effect.
  - `writePolicy.rules.actions` (object): Per-action write policy mode overrides keyed by canonical external action type.
  - `writePolicy.rules.defaultMode` ("auto_execute" | "needs_review" | "blocked"): Fallback write policy mode for policy-controlled external writes without an explicit override.
  - `writePolicy.updatedAt` (string): Timestamp when the write policy was last updated. Example: `"2026-05-21T14:30:00.000Z"`.

Example input:
```json
{}
```

Example output:
```json
{
  "writePolicy": {
    "id": "id_example",
    "rules": {
      "actions": {},
      "defaultMode": "auto_execute"
    },
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```

### `write_policy_update`

Use this when the user clearly asks to change approval behavior. Patches default write policy mode or explicit action modes. Returns the updated write policy. External write: changes safety-sensitive profile approval settings. Before calling, the requested write policy change must be explicit; requires a trusted user messaging session.

- Execution: `backend_proxy`
- Effect: `write`
- Returns: `writePolicy` (object)
- Inputs:
  - `actions` (required, object): Required patch map keyed by canonical external action id; use {} for a defaultMode-only change.
  - `defaultMode` (optional, "auto_execute" | "needs_review" | "blocked"): Fallback write policy mode for policy-controlled actions without an explicit override.
- Outputs:
  - `writePolicy` (object): Updated write policy.
  - `writePolicy.id` (string): Backend write policy id.
  - `writePolicy.rules` (object): Write policy rules currently in effect.
  - `writePolicy.rules.actions` (object): Per-action write policy mode overrides keyed by canonical external action type.
  - `writePolicy.rules.defaultMode` ("auto_execute" | "needs_review" | "blocked"): Fallback write policy mode for policy-controlled external writes without an explicit override.
  - `writePolicy.updatedAt` (string): Timestamp when the write policy was last updated. Example: `"2026-05-21T14:30:00.000Z"`.

Example input:
```json
{
  "actions": {},
  "defaultMode": "auto_execute"
}
```

Example output:
```json
{
  "writePolicy": {
    "id": "id_example",
    "rules": {
      "actions": {},
      "defaultMode": "auto_execute"
    },
    "updatedAt": "2026-05-21T14:30:00.000Z"
  }
}
```
