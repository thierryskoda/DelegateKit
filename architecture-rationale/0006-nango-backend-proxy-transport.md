# Nango backend proxy transport

Date: 2026-05-12

## What Changed

All backend calls to Nango's HTTP proxy go through one transport module: `apps/backend/src/integrations/nango/nango-proxy-client.ts`.

Provider modules expose small typed wrappers with schemas and operation ids. Those wrappers call `nangoProxyRequestJson`, `nangoProxyRequestJsonWithHeaders`, or `nangoProxyRequestBinary`.

## Why

Nango retry and proxy options should be handled in one place. Provider code should not reimplement the same client setup and backoff behavior.

JSON proxy responses also need schema validation at the boundary. Unknown provider shapes should fail with structured evidence instead of passing through silently.

A source guard now blocks raw `nango.get`, `post`, `put`, `patch`, and `delete` calls under provider code except in the transport file.

## Tradeoffs

- Provider modules still need wrapper functions for each operation they use.
- The schemas intentionally validate only the fields the backend reads. Full provider API mirroring would be too heavy.

## Alternatives Rejected

- Per-provider copy-paste proxy helpers were rejected because they duplicate client setup and drift on validation.
- A heavy operation registry was rejected because provider-local wrappers plus one shared transport are simpler pre-launch.
