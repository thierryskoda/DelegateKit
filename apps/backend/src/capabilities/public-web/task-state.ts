import {
  publicWebActionPrepareStartInputSchema,
  publicWebArtifactSchema,
  publicWebFailureSchema,
  publicWebHandoffSchema,
  publicWebModeSchema,
  publicWebPreparedActionSchema,
  publicWebProviderSchema,
  publicWebTaskSchema,
  type PublicWebFailureKind,
  type PublicWebTask,
} from "@ai-assistants/public-web-contracts";
import type { TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";

const PUBLIC_WEB_PROVIDER = "browserbase-stagehand" as const;

const browserTaskStateSchema = z
  .object({
    provider: publicWebProviderSchema,
    mode: publicWebModeSchema,
    objective: z.string().trim().min(1),
    startUrl: z.string().trim().url(),
    currentUrl: z.string().trim().url().nullable(),
    authContextId: z.string().trim().uuid().nullable().default(null),
    artifacts: z.array(publicWebArtifactSchema),
    extractedFields: z.record(z.string().trim().min(1), z.string().nullable()).optional(),
    preparedAction: publicWebPreparedActionSchema.optional(),
    handoff: publicWebHandoffSchema.optional(),
    resumeActionPrepare: publicWebActionPrepareStartInputSchema.optional(),
    failure: publicWebFailureSchema.optional(),
  })
  .strict();

export type BrowserTaskState = z.infer<typeof browserTaskStateSchema>;
export type BrowserTaskMode = BrowserTaskState["mode"];
export type BrowserTaskFailure = NonNullable<BrowserTaskState["failure"]>;

export const waitingFailureKinds = new Set<PublicWebFailureKind>([
  "login_required",
  "mfa_required",
  "captcha_required",
]);

export function initialBrowserTaskState(input: {
  mode: BrowserTaskMode;
  objective: string;
  startUrl: string;
  authContextId?: string | null;
  resumeActionPrepare?: z.infer<typeof publicWebActionPrepareStartInputSchema>;
}): BrowserTaskState {
  return browserTaskStateSchema.parse({
    provider: PUBLIC_WEB_PROVIDER,
    mode: input.mode,
    objective: input.objective,
    startUrl: input.startUrl,
    currentUrl: input.startUrl,
    authContextId: input.authContextId ?? null,
    artifacts: [],
    ...(input.resumeActionPrepare === undefined
      ? {}
      : { resumeActionPrepare: input.resumeActionPrepare }),
  } satisfies BrowserTaskState);
}

export function browserArtifactDto(artifact: TableRow<"artifacts">) {
  return publicWebArtifactSchema.parse({
    profileFileId: artifact.id,
    filename: artifact.filename,
    artifactType: artifact.artifact_type,
    mimeType: artifact.mime_type,
    byteSize: artifact.byte_size,
    sha256: artifact.sha256,
  });
}

export function browserTaskStateFromBrowserTask(
  browserTask: TableRow<"browser_tasks">,
): BrowserTaskState {
  const parsed = browserTaskStateSchema.safeParse(browserTask.state);
  if (parsed.success) return parsed.data;

  const result = browserTaskStateSchema.safeParse(browserTask.result);
  if (result.success) return result.data;

  throw new DomainError(
    domainCodes.BAD_REQUEST,
    `Browser task ${browserTask.id} is not a readable public web task.`,
  );
}

export function browserTaskDto(browserTask: TableRow<"browser_tasks">): PublicWebTask {
  const state = browserTaskStateFromBrowserTask(browserTask);
  const dto = {
    browserTaskId: browserTask.id,
    provider: state.provider,
    mode: state.mode,
    status: browserTask.status,
    objective: state.objective,
    startUrl: state.startUrl,
    currentUrl: state.currentUrl,
    authContextId: state.authContextId,
    artifacts: state.artifacts,
    ...(state.extractedFields === undefined ? {} : { extractedFields: state.extractedFields }),
    ...(state.preparedAction === undefined ? {} : { preparedAction: state.preparedAction }),
    ...(state.handoff === undefined ? {} : { handoff: state.handoff }),
    ...(state.failure === undefined ? {} : { failure: state.failure }),
    createdAt: browserTask.created_at,
    updatedAt: browserTask.updated_at,
  };
  return publicWebTaskSchema.parse(dto);
}

export function browserTaskResultState(state: BrowserTaskState): Record<string, unknown> {
  return browserTaskStateSchema.parse(state);
}
