import {
  defineReadTool,
  defineWriteTool,
  readToolDescription,
  toolOutputProperty,
  writeToolDescription,
  type ToolContract,
} from "@ai-assistants/tool-contracts";
import {
  publicWebAuthContextDeleteInputSchema,
  publicWebAuthContextOutputSchema,
  publicWebAuthContextsListInputSchema,
  publicWebAuthContextsOutputSchema,
  publicWebAuthContextSetupStartInputSchema,
  publicWebActionPrepareStartInputSchema,
  publicWebExtractStartInputSchema,
  publicWebFetchUrlInputSchema,
  publicWebFetchUrlOutputSchema,
  publicWebLiveHandoffStartInputSchema,
  publicWebSearchInputSchema,
  publicWebSearchOutputSchema,
  publicWebTaskCancelInputSchema,
  publicWebTaskContinueInputSchema,
  publicWebTaskGetInputSchema,
  publicWebTaskOutputSchema,
} from "./schemas";

export const PUBLIC_WEB_PLUGIN_ID = "public-web-tools";

export const publicWebToolContracts = [
  defineReadTool({
    name: "public_web_search",
    pluginId: PUBLIC_WEB_PLUGIN_ID,
    label: "Search Public Web",
    description: readToolDescription({
      useWhen:
        "the user needs current public facts, discovery, news, public documentation, product details, regulations, schedules, or public-source evidence",
      operation:
        "Calls Perplexity Search API directly and returns normalized ranked public web results with snippets and source URLs",
      returns: `the public web ${toolOutputProperty(publicWebSearchOutputSchema, "results")} plus provider status, result count, timing, and structured failure when the provider cannot search`,
      notes: [
        "Use this for discovery and broad public research before fetching a specific source.",
        "Use domain, date, language, country, and token-budget filters when the user needs a narrower source set.",
        "Do not use this for account-specific, cart-specific, logged-in, location-personalized, or interactive website state; use browser tools for those workflows.",
      ],
    }),
    inputSchema: publicWebSearchInputSchema,
    outputSchema: publicWebSearchOutputSchema,
  }),
  defineReadTool({
    name: "public_web_fetch_url",
    pluginId: PUBLIC_WEB_PLUGIN_ID,
    label: "Fetch Public URL",
    description: readToolDescription({
      useWhen:
        "the assistant already knows a public URL and needs Perplexity to fetch and inspect that exact page",
      operation:
        "Calls Perplexity Agent API with fetch_url for one known public URL and returns fetched snippets, citations, and a synthesized answer",
      returns:
        "fetch status, answer, fetched URL content snippets, citations, provider timing, and structured failure or partial status when content is blocked or inaccessible",
      notes: [
        "Use after public_web_search when one source needs fuller inspection.",
        "Only public http or https URLs are accepted; localhost, private network, credentialed, and internal URLs are rejected before provider calls.",
        "Fetch is best-effort and may return partial content for paywalls, login walls, anti-bot pages, or very large documents.",
      ],
    }),
    inputSchema: publicWebFetchUrlInputSchema,
    outputSchema: publicWebFetchUrlOutputSchema,
  }),
  defineReadTool({
    name: "public_web_browser_extract_start",
    pluginId: PUBLIC_WEB_PLUGIN_ID,
    label: "Start Web Extraction",
    description: readToolDescription({
      useWhen:
        "the user needs current facts from a website and existing provider/API tools cannot satisfy the request",
      operation:
        "Starts a bounded browser task from an explicit HTTPS URL, extracts named fields, and captures evidence artifacts",
      returns: `the ${toolOutputProperty(publicWebTaskOutputSchema, "task")} lifecycle state, extracted fields, artifacts, or structured failure`,
      notes: [
        "Use allowedDomains to keep navigation constrained to the expected site; it must include the startUrl hostname.",
        "For protected pages, use authContextId from public_web_browser_auth_contexts_list when the user expects a saved login; login, MFA, captcha, or site-access blockers may return structured failure instead of extracted fields.",
        "Prefer this read-only extraction before preparing any browser action.",
      ],
    }),
    inputSchema: publicWebExtractStartInputSchema,
    outputSchema: publicWebTaskOutputSchema,
  }),
  defineReadTool({
    name: "public_web_browser_task_get",
    pluginId: PUBLIC_WEB_PLUGIN_ID,
    label: "Get Browser Task",
    description: readToolDescription({
      useWhen: "a browser task's current status, result, failure, or artifacts are needed",
      operation: "Reads one durable browser task and its profile artifacts",
      returns: `the ${toolOutputProperty(publicWebTaskOutputSchema, "task")} lifecycle state, extracted fields, prepared action, artifacts, or structured failure`,
      notes: [
        "Use after a browser start tool when you already have the browserTaskId; this is a single status read, not a polling loop.",
        "For queued or running tasks, report the current state or continue only if the runtime invocation is already expected to wait briefly.",
        "For waiting handoff tasks, send the returned client URL if needed, wait for the user to complete the secure step, then call public_web_browser_task_continue.",
        "Use this browser-specific projection for browser task reads.",
      ],
    }),
    inputSchema: publicWebTaskGetInputSchema,
    outputSchema: publicWebTaskOutputSchema,
  }),
  defineReadTool({
    name: "public_web_browser_auth_contexts_list",
    pluginId: PUBLIC_WEB_PLUGIN_ID,
    label: "List Browser Logins",
    description: readToolDescription({
      useWhen:
        "the assistant needs to see which saved website login contexts are available before using authenticated browser automation",
      operation:
        "Lists active profile-scoped saved browser authentication contexts without exposing provider context ids, cookies, tokens, passwords, or session details",
      returns:
        "redacted saved browser authContextId values, login labels, domains, account hints, and verification timestamps",
      notes: [
        "Use these ids only with public-web tools that accept authContextId.",
        "A listed context may still require reauthentication if the target website expired its session.",
      ],
    }),
    inputSchema: publicWebAuthContextsListInputSchema,
    outputSchema: publicWebAuthContextsOutputSchema,
  }),
  defineWriteTool({
    name: "public_web_browser_task_cancel",
    pluginId: PUBLIC_WEB_PLUGIN_ID,
    label: "Cancel Browser Task",
    description: writeToolDescription({
      useWhen: "an in-progress browser task should be stopped",
      operation: "Cancels the local browser task lifecycle and stops provider work when possible",
      returns: `the ${toolOutputProperty(publicWebTaskOutputSchema, "task")} lifecycle state`,
      sideEffect: "marks a durable browser task as cancelled",
      safety:
        "only use for the intended browserTaskId; cancellation never submits external website actions",
    }),
    inputSchema: publicWebTaskCancelInputSchema,
    outputSchema: publicWebTaskOutputSchema,
  }),
  defineWriteTool({
    name: "public_web_browser_auth_context_setup_start",
    pluginId: PUBLIC_WEB_PLUGIN_ID,
    label: "Set Up Browser Login",
    description: writeToolDescription({
      useWhen:
        "the user needs the assistant to use a website that requires login, MFA, captcha, or other sensitive manual authentication",
      operation:
        "Starts a bounded browser setup task, creates a short-lived client handoff, and waits while the user completes sensitive steps in the portal",
      returns: `the ${toolOutputProperty(publicWebTaskOutputSchema, "task")} lifecycle state with redacted handoff metadata and a client-facing portal URL`,
      sideEffect:
        "creates a provider browser session and may create or refresh a saved browser auth context after the user completes the handoff",
      safety:
        "requires a trusted user messaging session; never ask for passwords, MFA codes, captchas, card numbers, or CVC in chat; allowedDomains must include the startUrl hostname; after the user finishes in the portal, call public_web_browser_task_continue with the same browserTaskId to complete and verify the saved login",
    }),
    inputSchema: publicWebAuthContextSetupStartInputSchema,
    outputSchema: publicWebTaskOutputSchema,
    trustedChannelRequired: true,
  }),
  defineWriteTool({
    name: "public_web_browser_task_continue",
    pluginId: PUBLIC_WEB_PLUGIN_ID,
    label: "Continue Browser Task",
    description: writeToolDescription({
      useWhen:
        "a browser task is waiting after a client handoff and the user has completed the sensitive step in the portal",
      operation:
        "Resumes the waiting browser task using the existing provider session or saved context, then returns updated task state",
      returns: `the ${toolOutputProperty(publicWebTaskOutputSchema, "task")} lifecycle state, artifacts, prepared action, extracted data, or structured failure`,
      sideEffect:
        "continues browser automation after a completed handoff and may persist the website auth context",
      safety:
        "requires a trusted user messaging session; only continue the intended waiting browserTaskId; never submit final purchases, payments, bookings, messages, legal forms, or account changes",
    }),
    inputSchema: publicWebTaskContinueInputSchema,
    outputSchema: publicWebTaskOutputSchema,
    trustedChannelRequired: true,
  }),
  defineWriteTool({
    name: "public_web_browser_auth_context_delete",
    pluginId: PUBLIC_WEB_PLUGIN_ID,
    label: "Delete Browser Login",
    description: writeToolDescription({
      useWhen:
        "the user wants a saved website login context removed or a no-longer-valid authenticated browser context revoked",
      operation:
        "Marks the saved browser auth context deleted locally and deletes the provider context when possible",
      returns: `the ${toolOutputProperty(publicWebAuthContextOutputSchema, "authContext")} metadata after deletion`,
      sideEffect:
        "revokes a profile-scoped saved browser login context for future public-web tasks",
      safety:
        "requires a trusted user messaging session; deletion never submits external website actions",
    }),
    inputSchema: publicWebAuthContextDeleteInputSchema,
    outputSchema: publicWebAuthContextOutputSchema,
    trustedChannelRequired: true,
  }),
  defineWriteTool({
    name: "public_web_browser_live_handoff_start",
    pluginId: PUBLIC_WEB_PLUGIN_ID,
    label: "Open Live Browser Handoff",
    description: writeToolDescription({
      useWhen:
        "the user explicitly wants temporary manual control of a website using an existing saved browser login",
      operation:
        "Starts a short-lived live browser session from a saved auth context, opens the requested HTTPS URL, and waits while the user interacts through the secure portal",
      returns: `the ${toolOutputProperty(publicWebTaskOutputSchema, "task")} lifecycle state with redacted handoff metadata and a client-facing portal URL`,
      doNotUse:
        "logging in from scratch, bypassing MFA/captcha, or submitting purchases, payments, bookings, messages, account changes, legal forms, or irreversible website actions",
      sideEffect:
        "creates a provider browser session attached to an existing profile-scoped browser auth context; it must not submit final external actions",
      safety:
        "requires a trusted user messaging session and an existing authContextId; allowedDomains must include the startUrl hostname; send only the returned client URL, wait for the user to finish, then call public_web_browser_task_continue",
    }),
    inputSchema: publicWebLiveHandoffStartInputSchema,
    outputSchema: publicWebTaskOutputSchema,
    trustedChannelRequired: true,
  }),
  defineWriteTool({
    name: "public_web_browser_action_prepare_start",
    pluginId: PUBLIC_WEB_PLUGIN_ID,
    label: "Prepare Browser Action",
    description: writeToolDescription({
      useWhen:
        "the user explicitly wants a website action prepared up to a review boundary and existing provider/API tools cannot satisfy the request",
      operation:
        "Uses a bounded browser session to prepare a cart, form, selection, or similar action, then stops before final confirmation; if login, MFA, or captcha blocks progress, may create a short-lived client handoff and wait for continuation",
      returns: `the ${toolOutputProperty(publicWebTaskOutputSchema, "task")} lifecycle state, prepared action summary, artifacts, structured failure, or redacted handoff metadata with a client-facing portal URL`,
      doNotUse:
        "submitting purchases, payments, bookings, messages, account changes, legal forms, or any irreversible website action",
      sideEffect:
        "may change temporary browser page state and, when authentication blocks preparation, may create a saved browser auth context plus short-lived client handoff; it must not submit final external actions",
      safety:
        "requires an explicit reviewBoundary and a trusted user messaging session supplied by invocation context, not by a tool input; allowedDomains must include the startUrl hostname; use authContextId only for a saved login the user expects; if handoff is returned, send the client URL, wait for the user to finish, then call public_web_browser_task_continue; stop before the final submit/payment/send/book/place-order action",
    }),
    inputSchema: publicWebActionPrepareStartInputSchema,
    outputSchema: publicWebTaskOutputSchema,
    trustedChannelRequired: true,
  }),
] as const satisfies readonly ToolContract[];

export type PublicWebToolName = (typeof publicWebToolContracts)[number]["name"];
