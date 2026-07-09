---
status: "superseded by [0022](0022-e2e-runtime-pool-leasing.md)"
date: 2026-06-05
scope: e2e infrastructure, local Supabase isolation, multi-agent test execution
---

# Dynamic E2E runtime lanes

## What Changed

Every `npm run e2e ...` command now creates its own dynamic E2E runtime under
`~/.ai-assistants-e2e-runs/<run-id>/`. That runtime owns a unique Supabase project id,
Supabase workdir, local port set, generated env file,
and profile build output. The command starts a fresh local Supabase project for
that runtime, applies the checked-in E2E Nango bindings into that isolated DB,
builds the E2E profile into the runtime root, runs `node --test` with the dynamic
env, then stops Supabase and removes the runtime by default.

The old global E2E prep lock and canonical E2E database reset are no longer the
normal E2E path. Parallel `npm run e2e` commands are allowed because they do not
share a Supabase project, workdir, or generated runtime config.

Normal suite commands such as `npm run e2e -- scenarios` use one dynamic runtime
for the whole command and run Node tests with `--test-concurrency=1`. The
`e2e:sweep` command still gets a fresh runtime per file because it intentionally
invokes `npm run e2e -- <file>` one file at a time.

## Why

Several coding agents may work in the same checkout and run E2Es at the same
time. A single shared E2E Supabase project made that unsafe: one agent could
reset the DB while another agent's test was still running. A global lock avoided
some corruption, but it created poor developer experience, stale lock states,
and unclear failures when agents overlapped.

Dynamic runtimes make the ownership boundary explicit. A command owns its local
Supabase state and generated runtime config from start to cleanup. Another
command gets a different runtime instead of waiting for or mutating the first
one.

This also matches the broader E2E split: scenario E2Es use typed provider
sandbox state, capability E2Es own live provider API coverage, and external
provider cleanup remains explicit where real provider writes are made. Local DB
isolation should not pretend to clean Gmail, Drive, Monday, Microsoft, Calendar,
or BoldSign resources.

## Tradeoffs

- Parallel E2E commands are safer and easier for multiple agents to run without
  stale lock failures or cross-command DB resets.
- Each E2E command starts from a fresh local DB, so normal cleanup can focus on
  in-command suite isolation, runtime artifacts, and external provider resources.
- Timings now show where startup cost is spent (`e2e.supabase_start`,
  `e2e.nango_bind_apply`, `e2e.profile_build_validate`, `node_test`, cleanup),
  which keeps future optimization evidence-based.
- A single suite command still shares one dynamic DB across files. Per-file
  isolation is available through `e2e:sweep`, but it costs another Supabase
  startup per file.
- Dynamic lanes can still contend for Docker CPU/memory, Nango rate limits,
  model/provider quotas, and live provider accounts. This design isolates local
  runtime state, not every external system.
- Crash recovery needs a local cleanup command because abandoned dynamic
  runtimes can leave Supabase Docker containers, workdirs, or volumes behind.

## Alternatives Rejected

- Keep a global E2E prep lock: rejected because it serializes independent
  agents, creates stale-lock UX, and still depends on one shared runtime being
  treated carefully.
- Reset one canonical E2E database per command: rejected because parallel
  commands can still corrupt each other by resetting shared state.
- Run every normal suite file in its own dynamic runtime: rejected for normal
  validation because it pays Supabase startup repeatedly. `e2e:sweep` keeps this
  mode for diagnosis and stronger per-file isolation.
- Create fixed named lanes: rejected as extra operational complexity. Dynamic
  lanes avoid pre-allocating ports or asking agents to pick a lane.
- Treat dynamic local runtime cleanup as provider cleanup: rejected because live
  provider writes are outside local Supabase and still require capability E2E
  cleanup or explicit fixture cleanup workflows.

## More Information

Operational guidance lives in the `run-tests` and `test-strategy` focused
skills. Current source-of-truth entrypoints include:

- `scripts/repo-tooling/run-e2e-tests.ts`
- `scripts/repo-tooling/e2e-dynamic-runtime.ts`
- `scripts/repo-tooling/e2e-test-scope.ts`
- `scripts/repo-tooling/e2e-cleanup-runtimes.ts`
- `tests/e2e/helpers/processes/attach-supabase.ts`

Related records:

- [Isolated E2E profile and scenario provider sandbox](0018-isolated-e2e-profile-and-scenario-provider-sandbox.md)

Revisit this decision if Supabase startup dominates E2E time enough to justify a
migrated base snapshot, or if external provider contention becomes common enough
that dynamic local runtime isolation is no longer the limiting concern.
