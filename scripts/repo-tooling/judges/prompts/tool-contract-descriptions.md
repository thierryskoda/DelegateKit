Judge whether each canonical repo agent tool contract has an accurate, sufficient description for an agent that only sees the tool name, label, description text, execution kind, effect, optional external write action, and JSON parameter schema. Canonical agent tool contracts live in `@ai-assistants/tool-contracts`, with provider-specific schemas in the owning contract package. "Sufficient" means descriptions carry enough call-time facts for generated guidance and inventories to teach correct tool use without duplicating detailed workflow prose elsewhere.

Return JSON only with fields: `is_valid`, `summary`, `findings`.

Use severity **`error`** only when the description is **materially misleading or unsafe** relative to the evidence (contradicts parameters schema, omits required side-effect reality, or would obviously steer agents to misuse the tool).

Use severity **`warning`** for clarity gaps, missing helpful context, or stale/vague wording that does **not** currently contradict the schema.

Evidence includes every tool's `description`, `label`, `parameters` (JSON Schema derived from Zod), `executionKind`, `effect`, and optional `externalAction`.

Rules:

1. **Schema alignment**: Required parameters (see `parameters.required`) should be explained or clearly implied. Optional parameters do not need exhaustive prose if schema `.describe()` strings already carry the nuance; flag only when the tool description promises behavior that parameters do not support, or ignores a required parameter agents must supply.

   **Zod refinements**: Exported `parameters` JSON Schema is derived from Zod and may **omit** cross-field rules (for example “at least one of threadId or providerThreadId”) even though runtime `parseToolParams` still enforces them. **Do not warn** solely because `parameters.required` is empty or underspecified when the tool description already states the same logical constraint in plain language.

2. **Safety and mutations**: If `effect` is `"write"` or `externalAction` is present, the description should reflect the mutation, external write, destructive effect, provider semantics, idempotency, artifact/hash checks, or exact target requirements that are central to correct use. Normal provider/write tool descriptions must not teach approval flow; approval state comes from domain facts inside structured tool `data`, such as `data.action.status`. Do not demand boilerplate if the label/description already states the operational risk clearly.

3. **Read tools**: If `effect` is `"read"`, do not error merely because the description lists informational outputs—those help agents choose tools.

4. **Scope**: Judge **tool descriptions only**. Do not require documenting full HTTP response shapes or backend implementation details unless the description already claims specific payload fields that are wrong or missing relative to common agent expectations (e.g. claiming a tool returns live queue state when it only returns cached summary). Missing tools in the catalog belong to plugin-boundary and inventory guards, but a description is wrong if it promises catalog-covered actions that are not reflected in that tool's parameters/effect.

5. **Maintainer contract alignment**: `agentsMd` is always provided in guard evidence; apply `AGENTS.md` Tool And Client Boundaries plus provider-ownership rules on every run. Error on descriptions that steer agents to expose internal platform names to end users, claim normal user-visible chat is returned by low-level tools, tell agents to treat failures as success, imply another provider's external write through a non-owning plugin, direct agents to rely on non-canonical result channels instead of the structured `data` / `error` envelope, document or imply domain statuses/blockers/agent-guidance text at the tool-result root or in non-`data` channels, omit structured error/blocker reality when the tool can return it, or imply uninterrupted/live provider data when setup, auth expiry, quota, rate limits, or stale-data limits may be structurally returned.

6. **Overlap between tools**: Similar verbs across plugins are fine when provider boundaries differ. Flag overlap only when two tool **descriptions** read as interchangeable for the same user intent **within** the same plugin surface.

7. **Findings**: Each finding must include `severity`, `title`, `tools` (tool `name` strings affected—usually one), `plugins` (plugin ids like `gmail-tools` when known), `explanation`, `evidence`, `recommendation`, and `suggested_owner_plugin` only when ownership confusion exists (often null).

8. **Pass**: If there are **no error findings**, set `is_valid` to **true**. If there is **at least one error finding**, set `is_valid` to **false**. Warnings alone may keep `is_valid` true.

LLMs can be wrong; prefer conservative errors over nitpicking.
