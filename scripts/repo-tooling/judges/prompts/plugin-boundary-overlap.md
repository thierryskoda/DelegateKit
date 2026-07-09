Judge whether the local plugin tool surfaces have clean, non-overlapping product boundaries.

Return JSON only with fields: is_valid, summary, findings.
Use severity "error" for real plugin ownership overlap that should block the guard. Use "warning" for naming or future-cleanup concerns that do not currently create duplicate tool ownership.

Product architecture:

- Provider plugins expose provider-owned primitives. Examples: Gmail and Outlook Mail own their own message operations, Google Calendar and Outlook Calendar own their own event operations, Google Drive owns Google Drive file operations, OneDrive and SharePoint own their own file operations, Monday owns CRM records, BoldSign/signature owns signature provider requests/status, and other provider plugins follow the same ownership rule.
- Document tools own generic template rendering into internal artifacts. Browser/public-web tools own browser task lifecycle. Internal orchestration should compose provider-owned tools rather than hide provider-specific actions behind wrapper tools.
- Do not hide provider-specific tools or external writes on internal profile modules or workflow-flavored wrappers, including document-, work-, browser-, or workflow-themed names.
- Internal capability owners should not re-host each other's lifecycle tools: work-tools owns assistant work items and execution paths, public-web owns browser tasks, and scheduled-tasks owns scheduled-task CRUD.
- Internal module ownership examples should stay aligned with the current `capabilities/` layout; this judge should not invent a separate taxonomy.
- Capability `GUIDANCE.ts`, DB-owned profile guidance rows, and client workflow guidance may sequence several provider-owned tools. That composition is expected and should not be flagged as overlap unless it re-hosts provider-specific tools or external writes. Launched-client-specific workflow guidance should live in control-plane `profile_guidance` rows; generic provider/tool constraints and capability behavior remain in typed `GUIDANCE.ts`.
- Internal profile/control-plane capability plugins must not host another provider's provider-specific tools, including reads, search/status/sync/readiness, or writes; they should return structured context for the owning provider plugin or client guidance to compose.
- Delivery and capture tools belong in backend capability modules or the owning provider capability; backend profile/control-plane modules should return structured context or artifacts for those owners to act on.
- A plugin may accept or return backend artifacts or structured context from another domain, but it must not perform another provider plugin's provider-specific action unless its core owned resource is that external provider.
- Document render tools may create document previews, final artifacts, status, hashes, and internal workflow events.
- Gmail and Outlook Mail each own their own provider-specific message send/delivery tools. Signature requests for any backend PDF artifact are owned by the signature provider plugin. Do not ask for document-themed provider send tools.
- Channel/chat artifact delivery and inbound media capture belong to backend artifact/channel capability code. Email delivery remains provider-owned by Gmail or Outlook Mail as appropriate; document tools own template rendering into internal artifacts.
- Provider-specific status/sync/readiness tools are allowed in provider plugins. Do not flag them merely because several providers use the same start/status pattern.
- Similar lifecycle verbs such as search/read/sync/status are not overlap when the owned resource and provider boundary are different.

Error examples:

- Two plugins provide semantically equivalent tools for the same provider-owned resource or action, such as both reading the same provider messages/files/records, both exposing readiness/status for the same provider setup, both sending an email, both uploading to Google Drive, or both sending a BoldSign signature request.
- An internal profile/control-plane capability plugin exposes semantically equivalent provider read/status/readiness tools instead of returning structured context for the owning provider plugin or client guidance to compose.
- A workflow/plugin tool hides another provider's read, status, readiness, or write action behind broad naming instead of returning structured data/artifacts for the owning provider plugin to act on.
- Plugin guidance instructs agents to bypass the owning provider plugin for an external provider action.
- Tool naming/descriptions make the agent choose between two tools that appear to accomplish the same business action with different plugin ids.

Do not flag:

- `gmail_message_send`, `outlook_mail_message_send`, or signature tools accepting generic backend artifact ids and expected hashes; they remain provider-owned actions.
- Capability guidance, profile guidance, or client-specific guidance that describes how to sequence provider-owned tools without re-hosting them.
- A tool that returns a backend artifact for later use by another plugin.
- Shared backend approval/idempotency patterns.
- Provider status tools that update that provider's read model.

Every finding must include severity, title, plugins, tools, explanation, evidence, recommendation, and suggested_owner_plugin when a clear owner exists.
If there are no error findings, set is_valid true. If there is at least one error finding, set is_valid false.
