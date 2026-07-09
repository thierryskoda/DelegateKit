Judge whether the profile-learning reviewer prompts are current, relevant, and safely aligned with their source contracts.

Return JSON only with fields: `is_valid`, `summary`, `findings`.

Use severity **`error`** when a reviewer prompt is materially stale, contradicts a canonical schema/source, assigns the wrong reviewer ownership, or would likely cause unsafe/wrong durable state changes. Use **`warning`** for maintainability, clarity, or drift-risk issues that are not currently unsafe.

Evidence includes reviewer source files, reviewer orchestration, profile-learning schemas, supported work-route event types, the State Destination Router source, and repo-root `AGENTS.md`.

Reviewer boundaries:

- `daily_signal_reviewer` finds durable learning signals from recent evidence and proposes normal profile-learning changes.
- `state_destination_reviewer` asks whether durable client state is stored in the right owner. It should load and use the State Destination Router guidance directly instead of manually duplicating that guidance.
- `durable_state_structure_reviewer` asks whether active durable state is split at the right granularity. It should find overloaded scheduled tasks, work routes, or profile guidance that mix independent schedules, deliverables, approval boundaries, triggers, or workflows. It should not flag long-but-coherent instructions or redo destination/consistency review unless a structural split requires that change.
- `cross_state_consistency_reviewer` asks whether active durable places agree with each other. It should find direct contradictions or duplicate ownership, and should not redo destination routing unless there is also a contradiction or duplicate owner.
- Reviewers run sequentially. Later reviewers should receive and respect `proposedRecommendationsSoFar`, avoid duplicate candidates, and assume earlier reviewers may already have proposed fixes.

Prompt/source quality rules:

1. Candidate type names, target kind names, reviewer ids, supported event types, and other finite domains should be schema-backed or source-backed where practical. Flag raw string lists that are likely to drift when a nearby schema/constant already exists, especially in newly added reviewer prompts.
2. Prompt candidate-shape instructions must match `profileLearningReviewCandidateTypeSchema`, `profileLearningReviewTargetKindSchema`, and the downstream decision/candidate schemas. Error on nonexistent candidate types, target kinds, required patch fields that contradict schemas, or instructions that cannot be normalized/applied.
3. The State Destination reviewer must include the actual State Destination Router guidance in its prompt path. Do not require it to reword every router rule; prefer loading the canonical guidance and keeping reviewer-specific instructions short.
4. Cross-state consistency must stay narrower than staleness/quality review. It should only propose fixes for direct contradictions, incompatible duplicate ownership, or older durable state that conflicts with an already-proposed recommendation.
5. Durable-state structure review must stay narrower than broad instruction-quality review. It should only propose a split, merge, extraction, or recipe/guidance/task/route structural change when current durable rows or recent evidence show independent jobs; it must not flag instructions merely because they are long or detailed.
6. Reviewer prompts must not propose provider writes, assistant work items, push dispatch, chat-copy wakeups, polling loops, runtime file edits, production-data fallbacks, silent fallbacks, or guesses past missing required state.
7. Risky or broad durable changes should remain review-first through candidate confidence/verification/application policy. Reviewer prompts should prefer no candidate when evidence is thin, ambiguous, stylistic, or already covered.
8. Prompts should give full enough current-state context for the reviewer to understand the client snapshot while still constraining the reviewer to its own task.
9. Evidence refs and target ids must remain grounded in provided refs/targets. Flag prompts that invite invented evidence, broad rewrites, or edits without citing relevant durable rows.
10. Proposed profile guidance, scheduled-task instructions, or work-route instructions must not expose internal platform names, maintainer-only internals, source paths, table names, provider secrets, credentials, tokens, raw ids, or internal setup concepts in client-facing durable state.
11. When a reviewer-prompt safety, ownership, or durable-state concern is not covered above, use the provided `AGENTS.md` evidence as fallback authority. Error on material contradiction or omission that could affect profile-learning safety.

Do not flag:

- Short literal examples when the canonical owner is also present and the example is unlikely to drift.
- Reviewer-specific wording that intentionally repeats a small part of a canonical rule to explain the reviewer task.
- Warnings merely because a prompt is conservative, asks for empty candidates, or includes full context while narrowing its assignment.

Every finding must include `severity`, `title`, `reviewers`, `sources`, `explanation`, `evidence`, and `recommendation`.
If there are no error findings, set `is_valid` true. If there is at least one error finding, set `is_valid` false.
