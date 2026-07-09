# Security

Do not open a public issue for suspected vulnerabilities or leaked secrets.

Report security issues privately to the repository owner through GitHub. Include the affected commit, impact, reproduction steps, and any relevant logs with secrets redacted.

This project should not contain real credentials, tokens, provider connection ids, runtime state, or real client data. If any of those appear in a public branch, rotate the affected secret or account immediately and remove the data from history before continuing publication.

## Dependency Audit

Run `npm audit --audit-level=high` before release.

As of 2026-07-09, `npm audit --audit-level=high` exits cleanly. `npm audit` still reports low-severity advisories for `@ai-sdk/provider-utils` and `esbuild` pulled transitively through upstream assistant/browser automation packages. `npm audit fix` does not clear those without upstream package changes, so recheck upstream packages before production use rather than forcing untested dependency overrides.
