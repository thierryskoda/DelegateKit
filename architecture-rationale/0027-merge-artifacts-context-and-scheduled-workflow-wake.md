---
status: recorded
date: 2026-06-09
scope: "capability consolidation and scheduled workflow wake path"
---

# Merge Artifacts, Context, And Scheduled Workflow Wake

## What Changed

Saved artifact metadata tools moved into the runtime-local `artifacts` plugin as `artifact_list`, `artifact_get`, and `artifact_search`. The separate `saved-artifacts` capability and contract package were removed.

The split `overview` and `activity` internal modules became one always-granted `profile-context` capability with `profile_context_get` and `profile_activity_search`.

Scheduled tasks still support `target.kind = "workflow_recipe"`, but the scheduler now materializes heartbeat-only `assistant_work_items`. The assistant claims that work item and starts the workflow through `workflow_run_start`; the scheduler does not create workflow runs directly.

## Why

The removed modules were thin wrappers around one adjacent concept each. Keeping saved artifact metadata separate from artifact save/delivery made agents reason about two artificial artifact owners. Keeping overview and activity as separate always-granted modules created extra packages, manifests, guidance, and contract wiring for one profile-context read surface.

Scheduled workflow tasks had two wake paths: assistant-instruction schedules woke the assistant through work items, while workflow-target schedules could create workflow runs directly from the backend tick. That split made scheduled workflows less observable as assistant work and duplicated orchestration responsibility.

## Tradeoffs

- The assistant-facing capability catalog is smaller and closer to product language.
- Artifact metadata now shares the `artifacts` runtime-local plugin with inbound media and artifact delivery, while provider files remain provider-owned.
- Scheduled workflow starts keep the same heartbeat claim policy and work-item guidance path as other scheduled assistant work.
- Tool names changed without compatibility aliases, so generated guidance, tests, and inventories had to move in one refactor.
- `profile-context` is a broader internal module than the previous focused split, but it owns a single coherent profile-read surface rather than provider behavior.

## Alternatives Rejected

- Keep `saved-artifacts` as a separate capability: rejected because the tools only expose durable artifact metadata and belong with artifact save/delivery.
- Create a generic file capability: rejected because Drive, OneDrive, SharePoint, Gmail attachments, and similar provider files remain provider-owned.
- Merge proposals into actions at the same time: rejected because proposals have public/product semantics that should not be blurred with internal action state in this pass.
- Let scheduled workflow tasks keep direct backend run creation: rejected because durable assistant work should wake through heartbeat-claimed `assistant_work_items`.

## More Information

This updates the older focused-module rationale in [0019](0019-runtime-guidance-routing-and-focused-profile-modules.md) for the overview/activity split only. Provider-first ownership from [0016](0016-provider-first-capability-surfaces.md) still applies.
