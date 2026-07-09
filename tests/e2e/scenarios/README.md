# Scenario E2E Boundaries

This folder covers high-value product scenarios for the testing profile.

Most files simulate a natural channel message from John with `sendChannelMessage(...)`. Those messages should read like real Telegram, WhatsApp, or iMessage requests: no test markers, tool names, raw artifact mechanics, provider exclusion lists, ids, hashes, setup labels, or grading rubrics.

Some scenario files exercise non-channel product paths, such as provider-routed events, scheduled work, backend-executed work items, or direct backend tool contracts. Keep those cases explicit in comments, setup, assertions, and catalog wording. Operational details belong in seeded work-item instructions, tool assertions, or judges, not in simulated client messages.
