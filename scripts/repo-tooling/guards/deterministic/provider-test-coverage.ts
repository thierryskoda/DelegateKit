import { boldsignToolContracts } from "@ai-assistants/boldsign-contracts/contracts";
import { googleCalendarToolContracts } from "@ai-assistants/google-calendar-contracts/contracts";
import { gmailToolContracts } from "@ai-assistants/gmail-contracts/contracts";
import { googleDriveToolContracts } from "@ai-assistants/google-drive-contracts/contracts";
import { microsoftOnedriveToolContracts } from "@ai-assistants/microsoft-onedrive-contracts/contracts";
import { microsoftSharepointToolContracts } from "@ai-assistants/microsoft-sharepoint-contracts/contracts";
import { microsoftTodoToolContracts } from "@ai-assistants/microsoft-todo-contracts/contracts";
import { mondayToolContracts } from "@ai-assistants/monday-contracts/contracts";
import { outlookCalendarToolContracts } from "@ai-assistants/outlook-calendar-contracts/contracts";
import { outlookMailToolContracts } from "@ai-assistants/outlook-mail-contracts/contracts";
import type { ToolContract } from "@ai-assistants/tool-contracts";
import { publicWebToolContracts } from "@ai-assistants/public-web-contracts";
import { existsSync } from "node:fs";

const coverageKinds = [
  "liveWorkflow",
  "adapterContract",
  "approvalContract",
  "intentionallyDeferred",
] as const;

type CoverageKind = (typeof coverageKinds)[number];

type CoverageEntry = {
  kind: CoverageKind;
  evidence: string;
  reason?: string;
};

type ProviderCoverage = {
  contracts: readonly ToolContract[];
  coverage: Record<string, CoverageEntry>;
};

const prunedMondayStructureMutationCoverage = {
  kind: "intentionallyDeferred",
  evidence: "mock-heavy Monday structure-action coverage pruned",
  reason:
    "The old test mocked provider writes and job enqueueing; replace with a real Monday structure mutation workflow if these tools become launch-critical.",
} as const satisfies CoverageEntry;

const deferredMicrosoftSharepointCoverage = {
  kind: "intentionallyDeferred",
  evidence: "packages/microsoft-sharepoint-contracts/src/contracts.ts",
  reason:
    "No stable SharePoint testing fixture exists yet. Add one real fixture-backed SharePoint capability E2E before treating these tools as live covered.",
} as const satisfies CoverageEntry;

const providerCoverageLedger = {
  googleDrive: {
    contracts: googleDriveToolContracts,
    coverage: {
      google_drive_accounts_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_folder_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_search: {
        kind: "liveWorkflow",
        evidence:
          "tests/e2e/capabilities/google-drive-e2e.ts + apps/backend/src/capabilities/google-drive/read-tools.ts",
      },
      google_drive_file_get: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_shared_drives_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_permissions_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_permission_get: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_file_save: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_folder_create: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_file_rename: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_file_update_description: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_file_move: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_file_copy: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_file_upload: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_file_trash: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_file_restore: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_file_delete: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_file_share: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_permission_update: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
      google_drive_permission_delete: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-drive-e2e.ts",
      },
    },
  },
  microsoftOnedrive: {
    contracts: microsoftOnedriveToolContracts,
    coverage: {
      microsoft_onedrive_accounts_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_drives_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_drive_get: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_folder_children_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_recent_items_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_files_search: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_shared_items_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_item_get: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_versions_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_permissions_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_permission_get: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_file_save: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_folder_create: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_item_update: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_item_move: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_item_copy: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_item_delete: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_small_file_upload: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_sharing_link_create: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
      microsoft_onedrive_invite_recipients: {
        kind: "intentionallyDeferred",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
        reason:
          "CAPABILITY_E2E_WAIVED_TOOLS: OneDrive invite approval reaches unknown execution status in the testing tenant.",
      },
      microsoft_onedrive_permission_delete: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
      },
    },
  },
  microsoftSharepoint: {
    contracts: microsoftSharepointToolContracts,
    coverage: {
      microsoft_sharepoint_accounts_list: deferredMicrosoftSharepointCoverage,
      microsoft_sharepoint_shared_sites_list: deferredMicrosoftSharepointCoverage,
      microsoft_sharepoint_file_fetch: deferredMicrosoftSharepointCoverage,
      microsoft_sharepoint_file_save: deferredMicrosoftSharepointCoverage,
    },
  },
  microsoftTodo: {
    contracts: microsoftTodoToolContracts,
    coverage: {
      microsoft_todo_accounts_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-todo-e2e.ts",
      },
      microsoft_todo_lists_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-todo-e2e.ts",
      },
      microsoft_todo_tasks_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-todo-e2e.ts",
      },
      microsoft_todo_task_get: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-todo-e2e.ts",
      },
      microsoft_todo_task_create: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-todo-e2e.ts",
      },
      microsoft_todo_task_update: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-todo-e2e.ts",
      },
      microsoft_todo_task_complete: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-todo-e2e.ts",
      },
      microsoft_todo_task_delete: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/microsoft-todo-e2e.ts",
      },
    },
  },
  gmail: {
    contracts: gmailToolContracts,
    coverage: {
      gmail_accounts_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/gmail-e2e.ts",
      },
      gmail_messages_search: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/gmail-e2e.ts",
      },
      gmail_message_get: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/gmail-e2e.ts",
      },
      gmail_attachment_save: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/gmail-e2e.ts",
      },
      gmail_message_send: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/gmail-e2e.ts + tests/e2e/scenarios/scenarios.ts",
      },
      gmail_message_reply: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/gmail-e2e.ts",
      },
      gmail_message_forward: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/gmail-e2e.ts",
      },
      gmail_message_move: {
        kind: "intentionallyDeferred",
        evidence: "tests/e2e/capabilities/gmail-e2e.ts",
        reason:
          "CAPABILITY_E2E_WAIVED_TOOLS: durable mailbox folder/trash semantics not safely reversible without scenario fixtures.",
      },
      gmail_message_mark_read: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/gmail-e2e.ts",
      },
      gmail_message_delete: {
        kind: "intentionallyDeferred",
        evidence: "tests/e2e/capabilities/gmail-e2e.ts",
        reason:
          "CAPABILITY_E2E_WAIVED_TOOLS: durable mailbox folder/trash semantics not safely reversible without scenario fixtures.",
      },
    },
  },
  outlookMail: {
    contracts: outlookMailToolContracts,
    coverage: {
      outlook_mail_accounts_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/outlook-mail-e2e.ts",
      },
      outlook_mail_messages_search: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/outlook-mail-e2e.ts",
      },
      outlook_mail_message_get: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/outlook-mail-e2e.ts",
      },
      outlook_mail_attachment_save: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/outlook-mail-e2e.ts",
      },
      outlook_mail_message_send: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/outlook-mail-e2e.ts",
      },
      outlook_mail_message_reply: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/outlook-mail-e2e.ts",
      },
      outlook_mail_message_forward: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/outlook-mail-e2e.ts",
      },
      outlook_mail_message_move: {
        kind: "intentionallyDeferred",
        evidence: "tests/e2e/capabilities/outlook-mail-e2e.ts",
        reason:
          "CAPABILITY_E2E_WAIVED_TOOLS: durable mailbox folder/trash semantics are not safely reversible without Outlook scenario fixtures.",
      },
      outlook_mail_message_mark_read: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/outlook-mail-e2e.ts",
      },
      outlook_mail_message_delete: {
        kind: "intentionallyDeferred",
        evidence: "tests/e2e/capabilities/outlook-mail-e2e.ts",
        reason:
          "CAPABILITY_E2E_WAIVED_TOOLS: durable mailbox folder/trash semantics are not safely reversible without Outlook scenario fixtures.",
      },
    },
  },
  googleCalendar: {
    contracts: googleCalendarToolContracts,
    coverage: {
      google_calendar_accounts_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-calendar-e2e.ts",
      },
      google_calendar_calendars_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-calendar-e2e.ts",
      },
      google_calendar_events_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-calendar-e2e.ts",
      },
      google_calendar_event_get: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-calendar-e2e.ts",
      },
      google_calendar_freebusy_query: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-calendar-e2e.ts",
      },
      google_calendar_events_search: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-calendar-e2e.ts",
      },
      google_calendar_free_slots_find: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/google-calendar-e2e.ts",
      },
      google_calendar_event_create: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/google-calendar-e2e.ts",
      },
      google_calendar_event_update: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/google-calendar-e2e.ts",
      },
      google_calendar_event_cancel: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/google-calendar-e2e.ts",
      },
    },
  },
  outlookCalendar: {
    contracts: outlookCalendarToolContracts,
    coverage: {
      outlook_calendar_accounts_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/outlook-calendar-e2e.ts",
      },
      outlook_calendar_calendars_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/outlook-calendar-e2e.ts",
      },
      outlook_calendar_events_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/outlook-calendar-e2e.ts",
      },
      outlook_calendar_event_get: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/outlook-calendar-e2e.ts",
      },
      outlook_calendar_freebusy_query: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/outlook-calendar-e2e.ts",
      },
      outlook_calendar_free_slots_find: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/outlook-calendar-e2e.ts",
      },
      outlook_calendar_event_create: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/outlook-calendar-e2e.ts",
      },
      outlook_calendar_event_update: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/outlook-calendar-e2e.ts",
      },
      outlook_calendar_event_cancel: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/outlook-calendar-e2e.ts",
      },
    },
  },
  monday: {
    contracts: mondayToolContracts,
    coverage: {
      monday_workspace_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_board_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_board_get: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_column_type_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_item_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_item_get: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_item_create: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_item_update: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_item_archive: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_item_move_to_group: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_update_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_update_create: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_update_edit: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_update_delete: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_subitem_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_subitem_create: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_subitem_update: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_subitem_archive: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_file_add_to_column: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_file_add_to_update: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/monday-e2e.ts",
      },
      monday_board_create: prunedMondayStructureMutationCoverage,
      monday_board_rename: prunedMondayStructureMutationCoverage,
      monday_board_delete: prunedMondayStructureMutationCoverage,
      monday_column_create: prunedMondayStructureMutationCoverage,
      monday_column_rename: prunedMondayStructureMutationCoverage,
      monday_column_delete: prunedMondayStructureMutationCoverage,
      monday_group_create: prunedMondayStructureMutationCoverage,
      monday_group_rename: prunedMondayStructureMutationCoverage,
      monday_group_delete: prunedMondayStructureMutationCoverage,
    },
  },
  boldsign: {
    contracts: boldsignToolContracts,
    coverage: {
      boldsign_signature_requests_list: {
        kind: "liveWorkflow",
        evidence: "tests/e2e/capabilities/boldsign-e2e.ts",
      },
      boldsign_file_download: {
        kind: "intentionallyDeferred",
        evidence: "tests/e2e/capabilities/boldsign-e2e.ts",
        reason:
          "CAPABILITY_E2E_WAIVED_TOOLS: completed signed-document download requires deterministic signer completion in testing.",
      },
      boldsign_send_document_for_signature: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/boldsign-e2e.ts",
      },
      boldsign_signature_request_remind: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/boldsign-e2e.ts",
      },
      boldsign_signature_request_cancel: {
        kind: "approvalContract",
        evidence: "tests/e2e/capabilities/boldsign-e2e.ts",
      },
    },
  },
  publicWeb: {
    contracts: publicWebToolContracts,
    coverage: {
      public_web_search: {
        kind: "adapterContract",
        evidence: "tests/e2e/capabilities/public-web-e2e.ts",
      },
      public_web_fetch_url: {
        kind: "adapterContract",
        evidence: "tests/e2e/capabilities/public-web-e2e.ts",
      },
      public_web_browser_extract_start: {
        kind: "adapterContract",
        evidence: "tests/e2e/capabilities/public-web-e2e.ts",
      },
      public_web_browser_task_get: {
        kind: "adapterContract",
        evidence: "tests/e2e/capabilities/public-web-e2e.ts",
      },
      public_web_browser_auth_contexts_list: {
        kind: "adapterContract",
        evidence: "tests/e2e/capabilities/public-web-e2e.ts",
      },
      public_web_browser_task_cancel: {
        kind: "adapterContract",
        evidence: "tests/e2e/capabilities/public-web-e2e.ts",
      },
      public_web_browser_auth_context_setup_start: {
        kind: "adapterContract",
        evidence: "tests/e2e/capabilities/public-web-e2e.ts",
      },
      public_web_browser_task_continue: {
        kind: "adapterContract",
        evidence: "tests/e2e/capabilities/public-web-e2e.ts",
      },
      public_web_browser_auth_context_delete: {
        kind: "adapterContract",
        evidence: "tests/e2e/capabilities/public-web-e2e.ts",
      },
      public_web_browser_live_handoff_start: {
        kind: "adapterContract",
        evidence: "tests/e2e/capabilities/public-web-e2e.ts",
      },
      public_web_browser_action_prepare_start: {
        kind: "adapterContract",
        evidence: "tests/e2e/capabilities/public-web-e2e.ts",
      },
    },
  },
} as const satisfies Record<string, ProviderCoverage>;

function assertValidCoverageEntry(provider: string, toolName: string, entry: CoverageEntry): void {
  if (!coverageKinds.includes(entry.kind)) {
    throw new Error(
      `${provider}.${toolName} has invalid provider test coverage kind ${entry.kind}.`,
    );
  }
  if (!entry.evidence.trim()) {
    throw new Error(`${provider}.${toolName} provider test coverage entry must name evidence.`);
  }
  if (entry.kind === "intentionallyDeferred" && !entry.reason?.trim()) {
    throw new Error(`${provider}.${toolName} intentionallyDeferred coverage requires a reason.`);
  }
  for (const evidencePath of evidencePaths(entry.evidence)) {
    if (!existsSync(evidencePath)) {
      throw new Error(
        `${provider}.${toolName} provider test coverage evidence path is missing: ${evidencePath}.`,
      );
    }
  }
}

function evidencePaths(evidence: string): string[] {
  return evidence
    .split("+")
    .map((part) => part.trim())
    .filter((part) => /^(apps|packages|scripts|tests)\//.test(part));
}

export function assertProviderToolTestCoverageLedgerComplete(): void {
  const errors: string[] = [];
  for (const [provider, spec] of Object.entries(providerCoverageLedger)) {
    const contractNames = spec.contracts.map((contract): string => contract.name).sort();
    const ledgerNames = Object.keys(spec.coverage).sort();
    const missing = contractNames.filter((name) => !ledgerNames.includes(name));
    const extra = ledgerNames.filter((name) => !contractNames.includes(name));
    if (missing.length) {
      errors.push(`${provider} missing provider test coverage decisions: ${missing.join(", ")}`);
    }
    if (extra.length) {
      errors.push(`${provider} has stale provider test coverage entries: ${extra.join(", ")}`);
    }
    for (const [toolName, entry] of Object.entries(spec.coverage)) {
      try {
        assertValidCoverageEntry(provider, toolName, entry);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  if (errors.length) {
    throw new Error(errors.join("\n"));
  }
}
