---
status: recorded
date: 2026-06-09
scope: "Google OAuth connected-account ownership"
---

# Single Google OAuth Account

## What Changed

Gmail, Google Calendar, and Google Drive now share one canonical Nango OAuth integration: `ai-assistants-google`. The integration uses Nango provider `google`, requests the combined Google scopes needed by those capabilities, and maps to the existing provider-owned capability surfaces:

- `gmail` / `gmail`
- `google-calendar` / `google-calendar`
- `google-drive` / `google-drive`

The connected account stores the shared account provider as `google`. Capability account links remain provider-owned, so Gmail tools still resolve Gmail links, Calendar tools still resolve Google Calendar links, and Drive tools still resolve Google Drive links.

## Why

Google OAuth is account-scoped from the user's perspective. Asking the same client to connect Gmail, Calendar, and Drive as separate Google accounts creates unnecessary setup work and makes the Connect surface feel inconsistent with Outlook, where Mail, Calendar, and To Do already share one account.

The product boundary is still provider-first. OAuth transport can be shared without creating aggregate Google tools or moving Gmail, Calendar, and Drive behavior into a generic Google module.

## Tradeoffs

- A Google reconnect now asks for the full combined Google scope set, not a capability-specific subset.
- Existing legacy Gmail, Google Calendar, and Google Drive OAuth rows cannot be merged safely. They must be retired and affected profiles must reconnect through `ai-assistants-google`.
- Post-connect setup hooks still run per linked sibling capability, so shared Google OAuth can enqueue Gmail watches, Calendar watches, and Drive subscriptions from one completed connection.
- Live E2E and maintainer binding files need one Google Nango connection id reused across Google capabilities.

## Alternatives Rejected

- UI-only grouping: rejected because it would still create three OAuth integrations and three connected accounts behind one visual group.
- Long-lived dual Google provider configs: rejected because compatibility shims would keep stale auth paths and make readiness/reconnect behavior ambiguous.
- Aggregate Google tools: rejected because provider behavior, contracts, normalization, and guidance belong to Gmail, Google Calendar, and Google Drive.

## Migration Posture

Old three-config Google auth is retired rather than silently rewritten. Maintainers should run `npm run integrations -- nango retire-old-google-auth check ...`, review the inventory, then run the apply mode for explicit profile targets. The script disconnects old remote Nango connections where possible, deletes old connected-account rows, unlinks affected capability links, and marks them reconnect-required through the new Google OAuth flow.

## More Information

Provider-first ownership from [0016](0016-provider-first-capability-surfaces.md) and proxy-backed provider operations from [0012](0012-provider-operations-are-proxy-backed.md) still apply. This decision changes the OAuth connected-account layer, not the provider tool ownership model.
