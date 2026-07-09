# Clients

This folder contains source templates and sanitized fixture profiles for assistant profiles.

## Contents

- `_template/`: copy this when creating a new private client profile in your own fork or private workspace.
- `testing/`: sanitized profile used by local and E2E workflows.
- `seed.schema.generated.json` and `runtime.schema.generated.json`: generated from `scripts/clients/schema.ts`.

## Rules

- Do not commit real client names, personal emails, phone numbers, messaging identifiers, provider account ids, or private workflow guidance.
- Do not commit generated client snapshots, summaries, logs, downloads, or runtime profile state.
- Keep `seed.ts` as create-only bootstrap data. Changing a seed does not update an existing profile.
- Keep `runtime.ts` as source-owned runtime inclusion config.

Generate schemas after changing the client schema:

```bash
npm run clients -- schema
```
