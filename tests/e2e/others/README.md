`others/` is a temporary home for real runtime E2Es that do not yet have a stable product category.

New E2Es should prefer `capabilities/`, `scenarios/`, or `connect/` when the intent is clear. Use `connect/` for portal, channel auth, and Connect HTTP surfaces. Do not put static source/config guard tests here; those belong in `scripts/repo-tooling/guards/`.
