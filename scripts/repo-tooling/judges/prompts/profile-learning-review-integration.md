Judge whether profile-learning review candidate concepts are integrated across the product surfaces that consume them.

Return JSON only with fields: `is_valid`, `summary`, `findings`.

Use severity **`error`** when a candidate type, target kind, or durable state concept appears supported in one profile-learning surface but is materially missing, contradicted, or impossible to use in another required surface. Use severity **`warning`** for drift risk, unclear ownership, or maintainability issues that do not currently block the candidate lifecycle.

Evidence includes canonical profile-learning schemas, backend profile-learning review source, reviewer source, Connect/API display surfaces, workflow-recipe/profile-guidance/scheduled-task/work-route stores, runtime guidance that routes durable state, and repo-root `AGENTS.md`.

Scope is control-plane durable state owned by profile-learning candidates: scheduled tasks, work routes, DB-owned `profile_guidance`, and state-destination routing guidance. Provider capability guidance under `capabilities/*/GUIDANCE.ts` and client `seed.ts` bootstrap copies are out of scope unless a candidate type explicitly targets them. `runtime-guidance/state_destination_router/GUIDANCE.ts` and similar state-routing guidance sources remain in scope because they define the durable-state routing lifecycle.

Review the candidate lifecycle end to end:

1. Generation: reviewers can propose the candidate with the right candidate type, target kind, target id rule, evidence refs, and patch shape.
2. Normalization and validation: generated candidates can be normalized, parsed, verified, stored, and rejected safely when invalid.
3. Maintainer review surfaces: API and Connect DTO/UI code can display the candidate clearly enough for the maintainer to review a named client profile. Connect is not an end-user chat channel; client-facing privacy rules apply to durable content that assistants will use and to any preview text that may be shown outside maintainer-only UI.
4. Approval/application: manual approval, auto-apply/default approval behavior, expected revisions, and final mutation handlers are coherent for the candidate's risk.
5. Durable state ownership and privacy: the target owner, runtime guidance, and apply handler agree about whether the candidate belongs in profile guidance, scheduled tasks, work routes, or profile-specific state. Applied profile guidance, scheduled-task instructions, and work-route instructions must remain safe for client-facing assistant runtime use and must not expose internal platform names, source paths, table names, credentials, tokens, or maintainer-only internals.

Focus especially on new durable-state concepts and candidate target kinds. If a new first-class product concept appears in schemas, reviewer prompts, stores, guidance, or UI, check whether profile-learning-review has absorbed it across the whole lifecycle.

Treat these as required downstream surfaces when the candidate type implies a durable mutation:

- patch schema and generated-decision validation;
- candidate normalization;
- evidence loading and prompt compaction;
- reviewer prompt contracts and reviewer-specific allowed candidates;
- evidence/ref verification;
- Connect/API recommendation labels, summaries, previews, and actions;
- approval/default-apply behavior;
- final apply handler and target owner store;
- runtime/state-destination guidance when the candidate changes where durable client behavior belongs.

Do not require every candidate to be supported by every reviewer. Different reviewers have different ownership. Flag only when the missing support contradicts the candidate's intended lifecycle or durable-state owner.

Do not flag purely deterministic TypeScript exhaustiveness issues unless the evidence shows the drift already exists or a human maintainer would likely miss it from the current code shape.

Do not require generic registries, unit tests, type tests, schema tests, or new non-E2E test files. This repo prefers LLM semantic guards for judgment-heavy coverage and E2E tests only for runtime behavior.

When an integration, ownership, privacy, or apply-surface concern is not covered by the checklist above, use the provided `AGENTS.md` evidence as fallback authority. Error on material contradiction with source/runtime boundaries, durable-state ownership, fail-fast required state, or client-facing privacy rules. Also error on wake paths that use chat-copy wakeups, push dispatch, polling loops, or anything other than backend-owned work that immediately invokes the appropriate agent execution path when ready.

Do not flag:

- Existing conservative auto-apply policy merely because a candidate remains manual-review only.
- Separate reviewer prompts that intentionally restate a short candidate rule for task clarity, unless the restatement is stale or materially likely to drift.
- UI copy that is concise but sufficient for a maintainer-facing review queue.
- Missing generated runtime workspace AGENTS.md evidence; this source-only judge should flag source/guidance gaps, not live runtime data.
- Candidate types that are intentionally schema-valid but not proposed by a specific reviewer because that reviewer does not own that decision.

Every finding must include `severity`, `title`, `surfaces`, `candidate_types`, `explanation`, `evidence`, and `recommendation`.
If there are no error findings, set `is_valid` true. If there is at least one error finding, set `is_valid` false.
