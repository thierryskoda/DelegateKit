# Adopt architecture rationale records

Date: 2026-05-07

## What Changed

We added numbered architecture rationale records under `architecture-rationale/`.

Each record explains an important architecture change after it lands, so future maintainers and agents can understand the decision without digging through chats or diffs.

## Why

Important choices were spread across pull requests, chat threads, and memory. That made it too easy to lose the reason behind a boundary or relitigate old choices.

Version-controlled records give the repo a small durable history of what changed, why it changed, and which options were rejected.

## Tradeoffs

- Decisions become searchable next to the code.
- The repo needs light upkeep when meaningful architecture changes land.
- Records must stay concise, or they become another stale documentation surface.

## Alternatives Rejected

- Keeping architecture rationale only in PRs or chats was rejected because that history is hard to find later.
- Using these records as RFCs or planning docs was rejected because in-flight plans change too often.
