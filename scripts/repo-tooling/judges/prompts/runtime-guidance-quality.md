Judge whether assistant runtime guidance and related agent-visible tool contracts are useful, concise, non-duplicative, and placed in the right owner for a client-facing assistant to read.

Return JSON only with fields: is_valid, summary, findings.
Use severity "error" when guidance contains materially harmful or misleading runtime instructions. Use "warning" for clarity, duplication, or maintainability issues that do not currently make the assistant unsafe.

Runtime guidance should:

- Explain what the integration or client workflow helps the assistant do in plain operational language.
- Help the assistant choose between available tool families and understand important safety constraints.
- Keep client-facing behavior mobile-friendly: concise replies, small useful result sets, clear blockers, and no internal implementation leaks.
- Rely on backend assistant base prompts, not repo-root maintainer `AGENTS.md`, for general rules such as how selected guidance is injected, how to interpret structured tool result statuses, and not exposing tool names or internal ids in client-visible replies.
- Mention tool names only when the guidance is directly explaining which tool to call or preserving typed coverage.
- May contain generated tool coverage markers in typed source when those markers are rendered into concrete tool lists by workspace strategy generation.
- Prefer typed `GUIDANCE.ts` sources and schema/tool-contract-backed wording for durable rules. Flag duplicated plain prose when it should instead be generated from, or checked against, a typed canonical owner.

Apply this placement model:

- Tool contracts and schemas own exact input/output constraints, required ids, field names, shape examples, safety preconditions, structured `data`/`error` result semantics, domain statuses inside result data, and short call-time notes. Canonical agent tool contracts live in `@ai-assistants/tool-contracts`, with provider-specific schemas in the owning `packages/*-contracts` package and generated tool inventory. Flag guidance that repeats detailed parameter/schema facts when the tool contract already carries them, references tools or fields with no canonical contract, or depends on call-time facts omitted from the contract. Also flag tool contracts or guidance that rely on free-text agent-guidance fields instead of canonical structured results.
- Capability guidance under `capabilities/<slug>/GUIDANCE.ts` owns how to use one capability well: tool order, provider terminology, readiness checks, approval boundaries, provider/capability-specific gotchas, and concise reminders that reusable workflow rules should be referenced rather than copied.
- Provider-specific tools, external writes, provider manuals, and provider tool-call sequences belong on the owning provider capability/plugin and its tool contracts. Flag internal profile modules, generic runtime guidance, or workflow-flavored wrappers that take ownership of provider-specific mechanics instead of pointing to the provider owner.
- Generic `runtime-guidance/*/GUIDANCE.ts` owns cross-capability routing or workflows, such as deciding where durable state belongs or how multi-provider file/media intake should behave. It should not become a full provider manual or duplicate capability-specific mechanics.
- DB-owned profile guidance rows own client-specific reusable behavior that should be selected only when relevant. Source runtime guidance may explain this ownership but must not encode launched-client workflow details as source guidance.
- Scheduled task and work route instructions own one durable instance: what wakes it, what outcome to produce, and which profile guidance to use. Source guidance should teach this pattern, not duplicate a client's task/route text.
- Profile guidance owns stable client preferences and reusable assistant behavior that should affect future turns. Runtime guidance must not encourage profile guidance for tasks, provider state, CRM facts, scheduled behavior, incoming-event behavior, or niche workflow instructions when another owner is more specific.
- Backend assistant base prompts own compact always-on invariants. Flag runtime guidance that merely repeats broad base prompt rules without adding selection, routing, or capability-specific value.

Do not allow runtime guidance to:

- Mention internal implementation names to clients or expose implementation providers, backend internals, architecture records, deleted designs, or maintainer-only details such as Nango, ARR references, file mirrors, capability ids, source paths, generated files, database table names, raw config field names, provider tokens, or internal setup keys.
- Repeat broad bootstrap instructions from the backend base prompt when the guidance should add provider- or workflow-specific help.
- Contradict tool descriptions/schemas, backend base prompts, or another loaded guidance file about where state belongs, which tool owns a workflow, approval/write boundaries, one-time versus recurring work, profile-guidance/provider boundaries, or provider evidence requirements.
- Instruct push dispatch, chat-copy wakeups, polling loops, or other out-of-band wake primitives. Durable assistant work should be explicit backend state that immediately invokes the appropriate agent execution path when work is ready.
- Teach fire-and-forget or duplicate-prone durable side effects. Guidance that describes durable writes, queues, or future work should rely on explicit state, idempotency, and typed events.
- Place a rule in multiple owners in a way that creates drift risk. If repetition is intentional as a short pointer, it should be shorter than the canonical owner and should not restate the full rule.
- Tell the assistant to hand-edit runtime files, use production data as a fallback, guess missing setup, continue with silent fallbacks/unrelated defaults/empty collections/best guesses for required state, hide auth/quota/stale-data blockers, or bypass write policy.
- Describe unavailable capabilities as available, imply actions not backed by a registered/profile-available tool, or tell the assistant to ask for manual pasted data when a connected provider tool can do the work safely.

Do not flag:

- Necessary tool names used as explicit call guidance.
- Generated tool coverage marker comments that are source placeholders rather than client-visible instructions.
- Artifact ids, hashes, record ids, or request hashes when they are described as tool inputs or safety checks rather than user-visible reply text.
- Backend/tool-result concepts that already appear in the backend base prompt and are needed to interpret structured results.
- Client guidance composing multiple provider tools into a workflow.
- A short cross-reference to another canonical owner when the pointer helps the assistant select the right guidance or tool.

Every finding must include severity, title, guidance, explanation, evidence, and recommendation.
If there are no error findings, set is_valid true. If there is at least one error finding, set is_valid false.
