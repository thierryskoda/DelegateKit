---
status: recorded
date: 2026-06-09
scope: "BoldSign document ownership and profile isolation"
---

# BoldSign Document Ownership

## What Changed

BoldSign now uses a backend-owned `boldsign_documents` ledger to assign provider document ids to exactly one assistant profile. New assistant-created signature requests are sent with a deterministic profile label and metadata, then recorded in the ownership ledger. Agent-visible reads, downloads, reminders, cancellations, and webhook routing must prove ownership through that ledger before exposing or acting on a document.

The repo can still use one managed BoldSign API key for multiple clients. The shared credential is only transport. It is not the privacy boundary.

## Why

BoldSign's account-level API can list documents created under the shared managed account. Without a separate resource ownership layer, one client's assistant could see another client's signature requests through broad list calls, direct document ids, or webhook routing guesses.

The right product boundary is profile-owned provider resources. Clients should not need separate BoldSign setup just to make the backend safe, and agents should not be responsible for filtering another client's data out of shared provider results.

## Rules

- The DB ownership ledger is authoritative for agent-visible access.
- Provider labels and metadata narrow provider reads and help with discovery/backfill, but they are not the only safety control.
- Unknown historical documents remain invisible until a maintainer explicitly assigns them.
- Direct document actions must reject unowned document ids before calling BoldSign.
- Webhooks route by assigned document ownership. Unknown or ambiguous document events fail closed and do not wake a client assistant.

## Tradeoffs

- Historical documents need an explicit maintainer audit/backfill before assistants can see them.
- Provider list results can be empty even when the shared BoldSign account contains matching documents, because unassigned documents are intentionally hidden.
- The model is provider-specific rather than a generic resource-ownership abstraction. That keeps today's privacy boundary clear and avoids speculative cross-provider machinery.

## Alternatives Rejected

- Agent-side filtering by client name or labels was rejected because it would expose raw provider data to the model before isolation.
- Treating `connectedAccountId`, account email, or the managed API credential as the isolation boundary was rejected because all profiles use the same BoldSign API account.
- Auto-assigning historical documents by title, signer, or sender was rejected because ambiguous evidence could leak a document to the wrong client.

## Operational Posture

Deploy the ownership migration and runtime enforcement before production backfill. Then run `npm run integrations -- boldsign-documents audit --profile=prod`, assign only reviewed documents with `--confirm-assign --confirm-prod`, and leave unknown documents unassigned.

Provider-first capability ownership from [0016](0016-provider-first-capability-surfaces.md), proxy-backed operations from [0012](0012-provider-operations-are-proxy-backed.md), and agent-facing tool contracts from [0013](0013-agent-tool-contracts-are-llm-facing.md) still apply.
