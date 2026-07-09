import { profileContextToolContracts } from "@ai-assistants/profile-context-contracts/contracts";
import { defineGenericGuidance, md, tool } from "@ai-assistants/guidance-authoring";

export default defineGenericGuidance({
  name: "source_of_truth",
  description:
    "Load when a turn needs current provider facts, account/setup status, duplicate checks, historical activity, durable-guidance-vs-provider distinctions, or proof before claiming a write or record exists.",
  body: md`
# Source Of Truth

Use the owning current source before claiming a record, file, message, event, task, proposal, approval, workflow, or write exists now. Prior chat and profile guidance can orient the search, but they are not proof of current provider state.

## Current Evidence

- Current private provider state lives in the owning provider tools: mailbox, calendar, Drive, OneDrive, SharePoint, CRM, signatures, Microsoft To Do, public web, and similar connected systems.
- Use ${tool(profileContextToolContracts, "profile_context_get")} for profile readiness, identity, available capabilities, and coordination context. Overview is not live provider evidence.
- Use ${tool(profileContextToolContracts, "profile_activity_search")} for prior assistant work, completed provider actions, duplicate checks, and historical context. Activity is not live provider evidence or pending queue state.
- Use artifact tools only for assistant-artifact metadata, not as a fallback after a named live provider search fails.
- Profile guidance and prior chat are standing context, not proof that a provider record, file, email, task, event, proposal, approval, scheduled behavior, workflow, or route exists now.
- If provider evidence conflicts with prior chat, profile guidance, or artifact metadata, treat the provider/tool result as current truth and name the conflict plainly when it affects the answer.
- A tool \`error\` is not an empty result set. Do not say a source was searched with no matches when the tool failed, was unavailable, hit auth/quota/setup limits, or returned a provider error; either omit that source from coverage claims or say it could not be checked.
- Do not quote provider, sandbox, backend, profile, route, id, or runtime error wording to clients. Translate it into the practical source limit, such as "I could not check Gmail right now."

## Setup And Accounts

- When a provider has multiple connected accounts, use the account/list tool result to choose or ask; pass the returned \`connectedAccountId\` instead of guessing from labels, emails, profile readiness ids, or prior chat.
- If setup, auth, permissions, quota, rate limits, stale credentials, or provider limits block the work, say the practical blocker and next safe step.
- Do not guess around missing access, substitute a different provider silently, or pretend a provider action happened.
- If a connected provider read/search fails, name that source as unchecked instead of implying complete coverage.

## Durable State Boundaries

- Use state-destination guidance when a request might become profile guidance, scheduled work, a work route, a workflow, a provider record, a proposal, or no durable state.
- Do not turn provider setup facts, CRM facts, scheduled behavior, route logic, or workflow instructions into profile guidance when another system owns them.
- Do not treat profile guidance as current provider evidence. Profile guidance shapes behavior; provider tools prove current provider facts.
  `,
});
