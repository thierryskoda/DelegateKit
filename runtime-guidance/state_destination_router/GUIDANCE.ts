import { defineGenericGuidance, md } from "@ai-assistants/guidance-authoring";

export default defineGenericGuidance({
  name: "state_destination_router",
  description:
    "Load when the user asks to remember, remind, follow up later, set up recurring work, react when something happens, keep working across turns, or change future assistant behavior.",
  body: md`
# State Destination Router

Use this guidance when a request could be saved in more than one durable place, especially remember/remind/follow-up requests, future behavior changes, incoming-event behavior, client-specific instructions, or work that must continue later.

Resolve the destination by the durable owner, not by the verb the user used. "Remember", "keep track", "do this next time", and "follow up" can point to different systems.

High-risk boundaries:

- Prefer the most specific operational owner. Provider facts belong in provider records, future work belongs in scheduled tasks or work routes, reusable behavior belongs in profile guidance, and review-later ideas belong in proposals.
- Do not use durable state as a catch-all for tasks, workflow instructions, scheduled behavior, routes, CRM state, document state, or provider state.
- Durable client preferences and reusable assistant behavior belong in profile guidance when they should affect future turns but do not need persisted ordered execution state.

When creating or updating scheduled task instructions or work route instructions, do not copy long reusable rules that already exist in profile guidance. Prefer a short instruction that names the relevant profile guidance by title or key, then add only the event-specific or schedule-specific details. The durable work item should say what wakes it and what outcome to produce; profile guidance should say how to do the reusable behavior well.

Use profile guidance for reusable instructions that shape future behavior. Use scheduled tasks or work routes to wake future work; those trigger rows should reference relevant guidance by title/key instead of carrying the whole reusable behavior.

## Common Cases

- "Remember I like short replies": profile guidance.
- "Remind me tomorrow" or "Every Monday, check X": scheduled task; use scheduled-task guidance for the exact schedule shape.
- "When an email from Stripe comes in, summarize it": work route.
- "Don't summarize Stripe emails anymore": update the work route.
- "Add call Alex to my tasks": Microsoft To Do when enabled.
- "When updating Monday Quick Notes, keep it to one punchy line": profile guidance.
- "Remember this as the way we handle Jordan financing follow-ups, start it now, and pause until I confirm the deal": profile guidance plus a direct current task or scheduled follow-up, depending on timing.
- "For client intake emails, save attachments to the matching Drive folder and update CRM when unambiguous": profile guidance when it is a reusable workflow rule; work route only for the event-specific trigger/outcome.
- "For incoming Outlook attachments, use the Document Intake Workflow guidance": work route instruction referencing profile guidance.
- "Every weekday morning, create the deal command center using Morning Deal Command Center guidance": scheduled task instruction referencing profile guidance.
- "For each qualified Monday deal, check relevant news, decide if it creates a financing follow-up angle, and draft the next step": profile guidance for the reusable behavior; add a scheduled task only if it should run at a future time or cadence.
- "This signed mandate belongs to the current deal": save/update the document or CRM provider record.
- "ACME Co. and Alex Smith are the same client/contact": CRM/contact record when possible; otherwise ask before creating durable assistant guidance.
- "Speak to Alex about the financing file": Microsoft To Do when enabled.
- Later-review follow-up discovered by background work: proposal.
- Draft, send, or update now: direct provider write and approval path.
- Keep working after browser automation or another async operation reaches a waiting point: the owning browser task or work item, depending on what created the continuation state.

If the requested destination is ambiguous, ask one concise clarification before creating durable state.
  `,
});
