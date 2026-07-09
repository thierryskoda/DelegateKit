# Runtime Diagnostics Scripts

This folder contains maintainer tools for querying, pruning, reviewing, and
summarizing runtime diagnostics from a selected assistant runtime profile.

Diagnostics are evidence for understanding assistant runs, backend behavior,
worker activity, tool execution, and channel events. They are not source data,
and collected logs should stay under the runtime profile rather than being
checked into this repo.

## What Belongs Here

The scripts in this folder should help maintainers answer questions such as:

- what happened during a recent assistant turn;
- which runtime services emitted related events;
- whether a failure was caused by profile setup, tool behavior, provider limits,
  or assistant decision-making;
- what evidence should be included in a concise diagnostic report.

Keep command parsing, report formatting, and review support close to these
scripts. Keep product behavior in backend code and assistant tools, not in
diagnostics helpers.

## Boundaries

Diagnostics tooling may summarize or judge runtime evidence, but it should not
become a second implementation of the product. It should preserve profile
isolation, redact sensitive data, and make missing runtime selection fail fast.

For exact commands and flags, use the package scripts and TypeScript entry
points. This README is only folder context.
