---
status: recorded
date: 2026-06-06
scope: e2e infrastructure, local Supabase leasing, multi-agent test execution
---

# E2E Runtime Pool Leasing

## What Changed

`npm run e2e ...` now leases a fixed E2E worker lane from the local pool under
`~/.ai-assistants-e2e-lanes/` instead of creating, starting, stopping, and removing a
full Supabase stack for every command. Each fixed lane owns a unique Supabase
project id, workdir, port set, env file, generated profile config, runtime root,
and Docker context.

The runner resets and prepares the leased Supabase lane before spawning
`node --test`, heartbeats the lease while the command is active, releases the
lane after normal test execution with metadata only, and quarantines the lane
when setup fails before test execution. Cleanliness is guaranteed by the next
pre-run reset, not by post-test release. Stale leases are recoverable through
owner-pid and heartbeat expiry checks, while fencing tokens prevent stale owners
from modifying a newer lease.

Supabase/Docker startup and cleanup commands are bounded. E2E setup failures
write infrastructure diagnostics instead of leaving only a hanging process or a
generic stack trace. Scenario-only E2E commands skip global live Nango binding
and rely on scenario sandbox setup; capability, connect, others, and full-suite
commands still apply checked-in live E2E Nango bindings.

## Why

Dynamic runtime lanes solved shared-database corruption, but they still asked
one Docker Desktop daemon to start many full Supabase stacks concurrently. In
practice, concurrent coding agents could wedge Docker/Supabase startup before a
scenario reached product code. A separate VM or Docker daemon per agent would
increase capacity, but it is too operationally heavy for the local maintainer
workflow.

The clean local compromise is a small pool of isolated Supabase runtimes with a
durable lease lifecycle. Agents still get isolated runtime state, but startup
pressure is bounded and warm runtimes can be reused after reset. The lease state
is explicit enough to recover from crashed agents without relying on raw lock
files that can silently go stale.

## Tradeoffs

- Local parallelism is now bounded by pool size and startup capacity instead of
  being unbounded. Extra E2E commands wait for a lease rather than stampeding
  Docker Desktop.
- Reset-before-run keeps tests isolated, but a reset is still paid for each E2E
  command. Lane state `ready` means available for the next command; it is not a
  claim that the database is already clean before the next lease.
- Quarantine avoids reusing uncertain runtimes, but it requires cleanup to
  return disk/Docker resources to a small steady state.
- Scenario setup is cheaper because it avoids unrelated live provider binding,
  but live provider coverage must remain in capability/connect/others suites.
- The pool improves local reliability; it does not create more Docker CPU,
  memory, provider quota, or model capacity.

## Alternatives Rejected

- Keep creating a fresh runtime per command: rejected because concurrent
  Supabase startup through one Docker Desktop daemon was the failure mode.
- Add one raw lock around all E2E prep: rejected because it serializes too much
  work and reintroduces stale-lock UX without durable runtime state.
- Use separate VMs or Docker daemons per agent: rejected for local development as
  too operationally heavy, though it remains the answer for true many-worker
  capacity.
- Bind every testing Nango provider for every scenario: rejected because
  unrelated providers can block sandbox-only scenario validation.

## More Information

Operational guidance lives in the `run-tests` focused skill. Current
source-of-truth entrypoints include:

- `scripts/repo-tooling/run-e2e-tests.ts`
- `scripts/repo-tooling/e2e-lanes.ts`
- `scripts/repo-tooling/e2e-lane-state.ts`
- `scripts/repo-tooling/e2e-lane-prepare.ts`
- `scripts/repo-tooling/e2e-test-scope.ts`
- `scripts/repo-tooling/e2e-sweep/e2e-sweep.ts`
- `tests/e2e/others/e2e-worker-lane-leasing-e2e.ts`
- `tests/e2e/others/e2e-worker-lane-clean-state-e2e.ts`

Related records:

- [Dynamic E2E runtime lanes](0020-dynamic-e2e-runtime-lanes.md)
- [Isolated E2E profile and scenario provider sandbox](0018-isolated-e2e-profile-and-scenario-provider-sandbox.md)

Revisit this decision if local E2E demand regularly exceeds the pool or if a
dedicated worker pool with separate Docker capacity becomes cheaper than local
leasing.
