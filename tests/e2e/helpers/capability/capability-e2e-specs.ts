import { boldsignToolContracts } from "@ai-assistants/boldsign-contracts/contracts";
import { googleCalendarToolContracts } from "@ai-assistants/google-calendar-contracts/contracts";
import { documentToolContracts } from "@ai-assistants/document-contracts/contracts";
import { fileAnalysisToolContracts } from "@ai-assistants/file-analysis-contracts/contracts";
import { gmailToolContracts } from "@ai-assistants/gmail-contracts/contracts";
import { googleDriveToolContracts } from "@ai-assistants/google-drive-contracts/contracts";
import { microsoftOnedriveToolContracts } from "@ai-assistants/microsoft-onedrive-contracts/contracts";
import { microsoftTodoToolContracts } from "@ai-assistants/microsoft-todo-contracts/contracts";
import { mondayToolContracts } from "@ai-assistants/monday-contracts/contracts";
import { outlookCalendarToolContracts } from "@ai-assistants/outlook-calendar-contracts/contracts";
import { outlookMailToolContracts } from "@ai-assistants/outlook-mail-contracts/contracts";
import { phoneToolContracts } from "@ai-assistants/phone-contracts/contracts";
import { profileFileToolContracts } from "@ai-assistants/profile-files-contracts/contracts";
import { publicWebToolContracts } from "@ai-assistants/public-web-contracts";

export const capabilityE2eSpecs = [
  {
    capabilityId: "google-drive",
    e2eFile: "tests/e2e/capabilities/google-drive-e2e.ts",
    contracts: googleDriveToolContracts,
  },
  {
    capabilityId: "gmail",
    e2eFile: "tests/e2e/capabilities/gmail-e2e.ts",
    contracts: gmailToolContracts,
    waivedToolsExport: "CAPABILITY_E2E_WAIVED_TOOLS",
  },
  {
    capabilityId: "outlook-mail",
    e2eFile: "tests/e2e/capabilities/outlook-mail-e2e.ts",
    contracts: outlookMailToolContracts,
    waivedToolsExport: "OUTLOOK_MAIL_CAPABILITY_E2E_WAIVED_TOOLS",
  },
  {
    capabilityId: "google-calendar",
    e2eFile: "tests/e2e/capabilities/google-calendar-e2e.ts",
    contracts: googleCalendarToolContracts,
    waivedToolsExport: "CAPABILITY_E2E_WAIVED_TOOLS",
  },
  {
    capabilityId: "outlook-calendar",
    e2eFile: "tests/e2e/capabilities/outlook-calendar-e2e.ts",
    contracts: outlookCalendarToolContracts,
    waivedToolsExport: "OUTLOOK_CALENDAR_CAPABILITY_E2E_WAIVED_TOOLS",
  },
  {
    capabilityId: "microsoft-onedrive",
    e2eFile: "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
    contracts: microsoftOnedriveToolContracts,
    waivedToolsExport: "CAPABILITY_E2E_WAIVED_TOOLS",
  },
  {
    capabilityId: "microsoft-todo",
    e2eFile: "tests/e2e/capabilities/microsoft-todo-e2e.ts",
    contracts: microsoftTodoToolContracts,
  },
  {
    capabilityId: "monday",
    e2eFile: "tests/e2e/capabilities/monday-e2e.ts",
    contracts: mondayToolContracts,
  },
  {
    capabilityId: "boldsign",
    e2eFile: "tests/e2e/capabilities/boldsign-e2e.ts",
    contracts: boldsignToolContracts,
  },
  {
    capabilityId: "document-tools",
    e2eFile: "tests/e2e/capabilities/document-tools-e2e.ts",
    contracts: documentToolContracts,
  },
  {
    capabilityId: "file-analysis",
    e2eFile: "tests/e2e/capabilities/file-analysis-e2e.ts",
    contracts: fileAnalysisToolContracts,
    waivedToolsExport: "CAPABILITY_E2E_WAIVED_TOOLS",
  },
  {
    capabilityId: "public-web",
    e2eFile: "tests/e2e/capabilities/public-web-e2e.ts",
    contracts: publicWebToolContracts,
  },
  {
    capabilityId: "phone",
    e2eFile: "tests/e2e/capabilities/phone-e2e.ts",
    contracts: phoneToolContracts,
  },
  {
    capabilityId: "profile-files",
    e2eFile: "tests/e2e/profile-files-direct-e2e.ts",
    contracts: profileFileToolContracts,
  },
] as const;
