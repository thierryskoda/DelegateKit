# DelegateKit

DelegateKit is a TypeScript monorepo for building maintainer-operated AI assistants. It focuses on backend-owned capabilities, explicit tool contracts, connected-account workflows, a Connect web app, and profile/client bootstrap sources.

The repository is intentionally source-only. Keep real secrets, live client data, runtime logs, generated diagnostics, downloaded files, and provider credentials outside Git.

## Requirements

- Node.js `24.15.0`
- npm `11.12.1`
- Supabase CLI support through the repo scripts

## Setup

```bash
npm install
cp .env.example .env.development
npm run check
```

Fill `.env.development` with the provider keys you need for the surfaces you are testing.

## Local Development

| Surface | URL |
| --- | --- |
| Connect portal | http://127.0.0.1:5173 |
| Local backend | http://localhost:8787 |
| Local Supabase Studio | http://127.0.0.1:54323 |
| Local Supabase API | http://127.0.0.1:54321 |

Start the local development stack:

```bash
npm run start:dev
```

Useful checks:

```bash
npm run check
npm run typecheck
npm run build
```

## Clients

Client bootstrap sources live in `clients/`.

- `clients/_template` shows the shape for a new profile.
- `clients/testing` is the sanitized local/E2E fixture profile.
- Do not commit real client names, personal contact details, provider connection ids, generated snapshots, logs, downloads, or live guidance copied from production data.

## Deployment

This public repository does not include a production deployment target. Bring your own infrastructure and keep production environment files, operator runbooks, provider connection bindings, and runtime state outside the source tree.

## License

MIT
