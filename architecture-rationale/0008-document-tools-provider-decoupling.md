# Document tools stay provider-independent

Date: 2026-05-13

## What Changed

Document tools now own only the document lifecycle: definitions, preview rendering, finalization, artifacts, hashes, revisions, and status.

They do not fetch CRM records, provider files, email messages, or signature-provider state. Provider plugins own provider reads and writes. Client skills map provider facts into explicit document field values.

Backend artifact validation is a shared artifact-domain primitive. Providers can validate profile ownership, SHA-256, MIME type, and optional case correlation without importing document capability code.

Email and BoldSign tools are artifact-aware, not document-run-aware.

## Why

The first document-tools implementation moved generation out of `workflows/`, but Email and BoldSign still had special document-run branches.

That made provider tools understand document internals, such as document-specific hash fields. It also made document definitions carry downstream signature and delivery policy.

The cleaner boundary is that documents produce safe artifacts, providers operate on artifacts, and client skills decide business sequencing.

## Tradeoffs

- Document definitions no longer encode BoldSign or email delivery policy.
- Document definitions no longer encode provider-specific field sources such as Monday CRM fields.
- Client skills must compose document preview and finalization with provider tools.
- Future providers can consume artifacts through the same generic validation boundary.
- There are no compatibility paths for removed document-run provider payloads because the product is pre-launch.

## Alternatives Rejected

- Keeping document-run modes inside provider tools was rejected because it made providers depend on document capability internals.
- Adding document-themed send or sign tools was rejected because it would duplicate provider ownership and confuse tool choice.
- Building a backend workflow engine for mandate sequencing was rejected because client-specific skills should own business flow order.
