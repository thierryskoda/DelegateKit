import { documentBackendCapabilityModule } from "../document-tools/backend-module";
import { fileAnalysisBackendCapabilityModule } from "../file-analysis/backend-module";
import { actionsBackendCapabilityModule } from "../actions/backend-module";
import { boldsignBackendCapabilityModule } from "../boldsign/backend-module";
import { googleCalendarBackendCapabilityModule } from "../google-calendar/backend-module";
import { outlookCalendarBackendCapabilityModule } from "../outlook-calendar/backend-module";
import { gmailBackendCapabilityModule } from "../gmail/backend-module";
import { outlookMailBackendCapabilityModule } from "../outlook-mail/backend-module";
import { phoneBackendCapabilityModule } from "../phone/backend-module";
import { googleDriveBackendCapabilityModule } from "../google-drive/backend-module";
import { microsoftOnedriveBackendCapabilityModule } from "../microsoft-onedrive/backend-module";
import { microsoftSharepointBackendCapabilityModule } from "../microsoft-sharepoint/backend-module";
import { microsoftTodoBackendCapabilityModule } from "../microsoft-todo/backend-module";
import { mondayBackendCapabilityModule } from "../monday/backend-module";
import { profileContextBackendCapabilityModule } from "../profile-context/backend-module";
import { profileFilesBackendCapabilityModule } from "../profile-files/backend-module";
import { profileLinksBackendCapabilityModule } from "../profile-links/backend-module";
import { proposalsBackendCapabilityModule } from "../proposals/backend-module";
import { publicWebBackendCapabilityModule } from "../public-web/backend-module";
import { scheduledTasksBackendCapabilityModule } from "../scheduled-tasks/backend-module";
import { timeBackendCapabilityModule } from "../time/backend-module";
import { workBackendCapabilityModule } from "../work/backend-module";
import type { BackendCapabilityModule } from "./backend-capability-module";

const backendCapabilityModules: readonly BackendCapabilityModule[] = [
  profileContextBackendCapabilityModule,
  timeBackendCapabilityModule,
  workBackendCapabilityModule,
  scheduledTasksBackendCapabilityModule,
  actionsBackendCapabilityModule,
  proposalsBackendCapabilityModule,
  profileFilesBackendCapabilityModule,
  profileLinksBackendCapabilityModule,
  publicWebBackendCapabilityModule,
  microsoftOnedriveBackendCapabilityModule,
  microsoftSharepointBackendCapabilityModule,
  microsoftTodoBackendCapabilityModule,
  googleDriveBackendCapabilityModule,
  googleCalendarBackendCapabilityModule,
  outlookCalendarBackendCapabilityModule,
  mondayBackendCapabilityModule,
  documentBackendCapabilityModule,
  fileAnalysisBackendCapabilityModule,
  boldsignBackendCapabilityModule,
  gmailBackendCapabilityModule,
  outlookMailBackendCapabilityModule,
  phoneBackendCapabilityModule,
];

const immediateHandlersByToolName = new Map(
  backendCapabilityModules.flatMap((module) => [...module.immediateHandlers.entries()]),
);

export function backendCapabilityImmediateHandlerForTool(toolName: string) {
  return immediateHandlersByToolName.get(toolName) ?? null;
}

export const backendCapabilityExternalWriteContracts = backendCapabilityModules.flatMap(
  (module) => module.externalWriteContracts,
);
