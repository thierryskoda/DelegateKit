---
status: "superseded by [0017: Replace Monday semantic schema with raw provider tools](0017-replace-monday-semantic-schema-with-raw-provider-tools.md)"
date: 2026-05-17
scope: monday capability, provider integrations
---

# Monday provider-owned semantic capability

## What Changed

Monday moved from the old `monday-crm` shape to a provider-owned `monday` capability.

The assistant-facing surface is now Monday-specific but semantic: normal reads and writes use record types and field keys from `profile_account_slots.config.monday`; board, column, and group administration remains explicitly provider-id based because those are Monday structure operations.

`monday_schema_get` is the runtime discovery tool for record types, field keys, writable/required fields, duplicate rules, relationships, admin structure, schema hash, and readiness. Authored client guidance may explain business vocabulary and workflow expectations, but generated schema prose is not kept as a parallel source of truth for board ids, column ids, or write mappings.

The v1 runtime path removed Monday custom Nango syncs. Nango remains the OAuth/proxy boundary for live Monday GraphQL calls, while Monday search/get/create/update/archive hydrate and write against the provider live. Writes fail fast before approval on unknown fields, missing required title values, read-only/unsupported fields, invalid value shapes, stale schema, and obvious configured duplicates.

## Why

Monday is flexible enough that every client can model CRM data differently: different boards, groups, columns, status labels, relation columns, and naming conventions. Hard-coding one client's CRM assumptions into the capability would not scale to more clients.

At the same time, adding a centralized generic CRM abstraction before a second provider exists would guess at common concepts too early. Monday, HubSpot, Salesforce, Airtable, and strict CRMs may share some later patterns, but the first real implementation needs to stay provider-owned until another provider proves what should be shared.

The chosen boundary keeps the durable contract explicit:

- Monday owns Monday tools, schema discovery, field codecs, and provider id translation.
- Profile capability config owns the current semantic mapping for a connected account.
- Authored client guidance owns human workflow context and vocabulary when schema facts alone are not enough.
- The assistant composes semantic tools instead of copying raw board and column ids for normal record work.

This matches the product direction: maintainers can customize messy client workflows, but clients and runtime assistants do not become automation builders or raw provider-schema operators.

## Tradeoffs

- Provider-owned tools keep Monday-specific behavior, errors, codecs, and admin operations close to the API that actually has those semantics.
- Live reads avoid stale sync-cache behavior and make post-write verification simpler, but they depend more directly on Monday API availability, rate limits, and search limitations.
- The semantic config generator and validator carry more responsibility because guidance is descriptive only; stale or invalid `config.monday` must block instead of being worked around.
- We intentionally keep some CRM vocabulary in client workflows where it describes the business domain, but source paths, tool ids, config keys, and provider contracts use `monday`.
- Future CRM providers should start as provider-owned capabilities. Shared packages or abstractions should be introduced only after multiple real providers demonstrate a stable common boundary.

## Alternatives Rejected

- A central `crm` or `structured-records` abstraction was rejected for v1 because it would force Monday and future strict CRMs into a speculative common model before there is evidence.
- Keeping the old `monday-crm` compatibility paths was rejected because the product is pre-launch and old names would preserve the wrong boundary.
- Making generated guidance carry raw board ids and column ids was rejected because guidance is prose for assistant behavior, not an authoritative provider mapping store.
- Keeping Monday Nango syncs in the runtime path was rejected because v1 needs authoritative live reads and fewer parallel hydration paths. Custom syncs can return later only if a concrete performance or offline-read need justifies them.
- Letting writes fill missing item titles or unknown fields with fallbacks was rejected because provider writes must fail before approval when required semantic input is missing or ambiguous.

## More Information

Related records:

- [Nango backend proxy transport](0006-nango-backend-proxy-transport.md)
- [Document tools provider decoupling](0008-document-tools-provider-decoupling.md)
- [Schema contract ownership](0009-schema-contract-ownership.md)

Revisit this rationale when a second real CRM or record-system provider ships. At that point, extract only the pieces proven common by implementation, not by naming similarity.
