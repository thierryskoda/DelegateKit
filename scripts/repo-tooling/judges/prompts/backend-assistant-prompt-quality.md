Judge whether one backend-rendered assistant prompt is coherent, complete, concise, and appropriate for a client-facing personal assistant.

Return JSON only with fields: is_valid, summary, findings.
Use severity "error" when the backend prompt is materially missing, contradictory, noisy enough to change behavior, misleading, unsafe, or likely to make the assistant expose internal implementation details. Use severity "warning" for clarity, duplication, or maintainability issues that should not block the guard.

The backend prompt should:

- Clearly identify the client display name, assistant identity, and default timezone from `runtimeProfile`.
- Give the assistant enough always-loaded operational context to handle mobile-first client messages with typo tolerance, ambiguity handling, clear failures, and concise confirmations.
- Explain that source and profile guidance are selected at runtime and injected as selected guidance, without requiring a static workspace document.
- Make provider readiness and blockers explicit, especially auth expiry, quota/rate limits, missing setup, unavailable data, and stale data.
- Keep client-facing behavior short, practical, tolerant of typos/ambiguity, and private: concise replies, clear confirmations, useful small result sets, and no backend/provider/source-path/database/internal-id leakage to the client.
- Be easy to scan: coherent section order, useful headings, no duplicated large blocks, no contradictory instructions, and no generic noise that does not help this client.
- Preserve tool and evidence rules needed for action guidance, while making client-visible wording human and non-internal.

Do not allow the backend prompt to:

- Omit discovery/readiness expectations for assigned capability tools or imply provider data is live when readiness must be checked.
- Tell the assistant to hand-edit runtime files, inspect repo source, use production/client data as a fallback, guess missing required state, hide blockers, bypass approvals, or continue with fake/default/empty values.
- Expose maintainer-only details such as internal runtime architecture, Supabase/control-plane table names, provider integration internals, source paths, generated file paths, credentials, tokens, raw config fields, architecture records, or deleted designs.
- Repeat broad bootstrap or provider guidance in multiple sections unless each repetition is short and needed for a different decision point.

Do not flag:

- Tool names, domain status names, artifact ids, request ids, record ids, account labels, or provider names when they are necessary tool inputs, returned evidence, or operational distinctions and are not presented as client-facing copy.
- A prompt that omits profile workflow guidance from source-rendered sections because profile guidance is injected dynamically from the control plane.
- A prompt that omits full source capability `GUIDANCE.ts` sections because capability guidance is selected and injected at runtime by the guidance router.
- Concise repetition of a critical safety rule when it prevents a realistic assistant mistake.

Every finding must include severity, title, line when possible, explanation, evidence, and recommendation.
If there are no error findings, set is_valid true. If there is at least one error finding, set is_valid false.
