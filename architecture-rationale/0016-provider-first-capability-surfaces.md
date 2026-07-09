---
status: recorded
date: 2026-05-31
scope: provider capabilities, plugins, tool contracts, events, routing
---

# Provider-First Capability Surfaces

## What Changed

Assistant-visible and product-contract surfaces now use provider-first names and
ownership boundaries.

Capabilities, plugin ids, tool names, write-policy action ids, proposal kinds,
assistant work event types, webhook adapter keys, generated guidance, tests, and
backend capability folders name the concrete provider that owns the behavior.
Examples include `gmail`, `outlook-mail`, `google-calendar`,
`outlook-calendar`, `microsoft-onedrive`, and `microsoft-sharepoint`.

Shared implementation may still exist, but only as low-level substrate outside
provider capability folders. The shared code must not own public tool ids,
action ids, event names, provider behavior, route semantics, capability config,
or assistant-facing contracts.

## Why

The earlier mixed model used broad surfaces such as email, calendar, and
Microsoft files while also carrying provider-specific behavior underneath. That
looked simpler at first, but it made future configuration less clear:

- OneDrive and SharePoint need independent routing and webhook behavior.
- Gmail and Outlook Mail have different send, thread, auth, and webhook
  semantics.
- Google Calendar and Outlook Calendar expose different provider fields and
  limitations.
- Provider-specific proposals, approvals, diagnostics, and E2E coverage should
  fail fast when wired to the wrong provider contract.

Trying to hide those differences behind generic capability names encouraged
switch statements, optional fields, compatibility aliases, fallback branches,
and shared helpers whose real job was to route back to a provider. Those
abstractions made the code harder to reason about and made the assistant-facing
ontology less honest.

The product is pre-launch, so preserving generic aliases was less valuable than
removing the wrong boundary before it became persistent product language.

## Tradeoffs

- Provider-first names create more files, packages, and some duplicated code.
  That duplication is intentional when it keeps provider behavior obvious and
  independently configurable.
- Generic user language such as "email", "calendar", "files", and "documents"
  remains valid in client guidance and client-facing prose. It should not become
  a generic public capability, plugin, tool, action, event, or backend module
  unless a current product workflow truly consumes that abstraction.
- Shared transport remains useful for provider-neutral mechanics such as Nango
  HTTP execution, but provider operation maps, normalization, diagnostics, and
  public contracts belong to the owning provider.
- Adding a new provider means adding explicit provider-owned surfaces instead of
  appending branches to a generic module. The up-front work is larger, but the
  resulting behavior is easier to configure, test, and remove.

## Alternatives Rejected

- Keep generic event types such as `email.received`, `calendar.event.changed`,
  or `file.changed`: rejected because exact-match routing needs independent
  provider configuration without extra filter fields or grouping conventions.
- Use provider-scoped metadata on generic routes, such as
  `{ eventType: "file.changed", provider: "microsoft-onedrive" }`: rejected
  because it adds a second routing axis before there is a current workflow that
  needs grouped cross-provider routes.
- Keep generic plugin packages such as `email-tools`, `calendar-tools`, or
  `microsoft-files-tools`: rejected because those packages still need
  provider-specific contracts and implementation branches.
- Put shared provider helpers inside aggregate folders such as
  `apps/backend/src/capabilities/email` or
  `apps/backend/src/capabilities/calendar`: rejected because `capabilities/*`
  folders should represent real capability slugs. Low-level shared substrate
  belongs in `apps/backend/src/integrations/*` or another neutral backend area.
- Preserve compatibility aliases for old identifiers: rejected because the
  product is pre-launch and aliases would keep teaching old product language to
  future code.

## More Information

Related records:

- [Capabilities and document tools boundary](0007-capabilities-and-document-tools-boundary.md)
- [Document tools provider decoupling](0008-document-tools-provider-decoupling.md)
- [Monday provider-owned semantic capability](0010-monday-provider-owned-semantic-capability.md)
- [Provider operations are proxy backed](0012-provider-operations-are-proxy-backed.md)
- [Backend capability colocation](0015-backend-capability-colocation.md)

Revisit this rationale only after multiple shipped providers prove a concrete
cross-provider workflow that needs a shared public abstraction. Extract that
abstraction from real overlap, not from similar words in provider APIs.
