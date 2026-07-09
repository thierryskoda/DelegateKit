# Errors Package

This package defines the shared error vocabulary used at service and HTTP
boundaries. It keeps expected domain failures, transport failures, public API
error bodies, and unknown thrown values consistent across the repo.

Use this package when a boundary needs a stable machine-readable error code or a
safe public error shape. Do not add codes just to mirror every database, vendor,
or implementation detail.

## What Belongs Here

- stable domain error codes that callers can branch on;
- domain error and HTTP adapter primitives;
- helpers for converting unknown thrown values into safe messages;
- schemas and serializers for public API error bodies.

The package should stay small and boundary-focused. Feature-specific recovery,
provider-specific retry semantics, and product workflow decisions belong with
the owning feature or capability.

## Design Intent

Errors should be explicit enough for clients, jobs, and diagnostics to tell the
truth about what failed, while avoiding leaks of secrets, credentials, raw vendor
payloads, or internal stack detail.

When adding new behavior, prefer one canonical code for a real product or
operational branch. If nothing branches on a distinction, a more general code is
usually the clearer contract.
