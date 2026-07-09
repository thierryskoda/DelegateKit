import {
  publicWebAuthContextDeleteInputSchema,
  publicWebAuthContextOutputSchema,
  publicWebAuthContextsListInputSchema,
  publicWebAuthContextsOutputSchema,
  publicWebAuthContextSetupStartInputSchema,
  publicWebActionPrepareStartInputSchema,
  publicWebExtractStartInputSchema,
  publicWebFetchUrlInputSchema,
  publicWebFetchUrlOutputSchema,
  publicWebLiveHandoffStartInputSchema,
  publicWebSearchInputSchema,
  publicWebSearchOutputSchema,
  publicWebTaskCancelInputSchema,
  publicWebTaskContinueInputSchema,
  publicWebTaskGetInputSchema,
  publicWebToolContracts,
  type PublicWebActionPrepareStartInput,
  type PublicWebAuthContextSetupStartInput,
  type PublicWebExtractStartInput,
  type PublicWebFailureKind,
  type PublicWebHandoffReason,
  type PublicWebLiveHandoffStartInput,
} from "@ai-assistants/public-web-contracts";
import {
  toolContractByName,
  toolDataForContract,
  type BackendToolResult,
  type ImmediateToolNameFor,
  type ToolContractByName,
  type ToolOutput,
} from "@ai-assistants/tool-contracts";
import { requireSupabaseRows, type TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes, formatUnknownError } from "@ai-assistants/errors";
import type { ExecutorContext } from "../../runtime/agent-tools/executor/context";
import { saveProfileArtifactBytes } from "../../product/artifacts/artifact-service";
import {
  createOrGetBrowserTask,
  requireBrowserTaskForProfile,
  transitionBrowserTask,
  type BrowserTaskStatus,
} from "./browser-task-store";
import { defineBackendCapabilityModule } from "../registry/backend-capability-module";
import {
  browserArtifactDto,
  browserTaskDto,
  browserTaskResultState,
  browserTaskStateFromBrowserTask,
  initialBrowserTaskState,
  waitingFailureKinds,
  type BrowserTaskFailure,
  type BrowserTaskMode,
  type BrowserTaskState,
} from "./task-state";
import {
  navigateStagehandHandoffSession,
  runStagehandActionPrepare,
  runStagehandExtraction,
  type BrowserAutomationResult,
} from "./stagehand-provider";
import {
  browserAuthContextDto,
  createBrowserAuthContext,
  listActiveBrowserAuthContexts,
  markBrowserAuthContextDeleted,
  markBrowserAuthContextVerified,
  requireActiveBrowserAuthContext,
} from "./auth-context-store";
import {
  browserHandoffDto,
  cancelBrowserHandoff,
  createBrowserHandoff,
  expireBrowserHandoffIfNeeded,
  latestBrowserHandoffForTask,
} from "./handoff-store";
import {
  createBrowserbaseContext,
  createBrowserbaseHandoffSession,
  deleteBrowserbaseContext,
  releaseBrowserbaseSession,
} from "./browserbase-provider";
import { runPerplexityFetchUrl, runPerplexitySearch } from "./perplexity-provider";

type BrowserAutomationArtifactBytes = Extract<
  BrowserAutomationResult,
  { ok: true }
>["value"]["artifacts"][number];

type BrowserStartInput =
  | { mode: "extract"; params: PublicWebExtractStartInput }
  | { mode: "action_prepare"; params: PublicWebActionPrepareStartInput };

type BrowserAuthContextStartInput =
  | BrowserStartInput
  | { mode: "live_handoff"; params: PublicWebLiveHandoffStartInput };

function taskOutputFor<const TName extends ImmediateToolNameFor<typeof publicWebToolContracts>>(
  toolName: TName,
  browserTask: TableRow<"browser_tasks">,
): BackendToolResult<ToolOutput<ToolContractByName<typeof publicWebToolContracts, TName>>> {
  const contract = toolContractByName(publicWebToolContracts, toolName);
  const payload = { task: browserTaskDto(browserTask) };
  return toolDataForContract(
    contract,
    payload as ToolOutput<ToolContractByName<typeof publicWebToolContracts, TName>>,
  );
}

function authContextsOutput(
  rows: readonly TableRow<"browser_auth_contexts">[],
): BackendToolResult<typeof publicWebAuthContextsOutputSchema._output> {
  const contract = toolContractByName(publicWebToolContracts, "public_web_browser_auth_contexts_list");
  return toolDataForContract(
    contract,
    publicWebAuthContextsOutputSchema.parse({
      authContexts: rows.map(browserAuthContextDto),
    }),
  );
}

function authContextOutput(
  row: TableRow<"browser_auth_contexts">,
): BackendToolResult<typeof publicWebAuthContextOutputSchema._output> {
  const contract = toolContractByName(publicWebToolContracts, "public_web_browser_auth_context_delete");
  return toolDataForContract(
    contract,
    publicWebAuthContextOutputSchema.parse({
      authContext: browserAuthContextDto(row),
    }),
  );
}

function searchOutput(
  output: typeof publicWebSearchOutputSchema._output,
): BackendToolResult<typeof publicWebSearchOutputSchema._output> {
  const contract = toolContractByName(publicWebToolContracts, "public_web_search");
  return toolDataForContract(contract, publicWebSearchOutputSchema.parse(output));
}

function fetchUrlOutput(
  output: typeof publicWebFetchUrlOutputSchema._output,
): BackendToolResult<typeof publicWebFetchUrlOutputSchema._output> {
  const contract = toolContractByName(publicWebToolContracts, "public_web_fetch_url");
  return toolDataForContract(contract, publicWebFetchUrlOutputSchema.parse(output));
}

function goalFor(input: BrowserStartInput): string {
  if (input.mode === "extract") return `Web extraction: ${input.params.objective}`;
  return `Web action preparation: ${input.params.objective}`;
}

function initialStateFor(input: BrowserStartInput): BrowserTaskState {
  return initialBrowserTaskState({
    mode: input.mode,
    objective: input.params.objective,
    startUrl: input.params.startUrl,
    authContextId: input.params.authContextId ?? null,
    ...(input.mode === "action_prepare" ? { resumeActionPrepare: input.params } : {}),
  });
}

function primaryDomainForUrl(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

function domainCovered(domain: string, allowedDomains: readonly string[]): boolean {
  const normalized = domain.trim().toLowerCase();
  return allowedDomains.some(
    (allowedDomain) => normalized === allowedDomain || normalized.endsWith(`.${allowedDomain}`),
  );
}

function requireAuthContextCoversDomains(
  row: TableRow<"browser_auth_contexts">,
  requestedDomains: readonly string[],
): void {
  for (const domain of requestedDomains) {
    if (domainCovered(domain, row.allowed_domains)) continue;
    throw new DomainError(
      domainCodes.FORBIDDEN,
      `Browser auth context ${row.id} is not saved for ${domain}.`,
    );
  }
}

function providerFailure(
  kind: PublicWebFailureKind,
  message: string,
  retryable: boolean,
): BrowserTaskFailure {
  return { kind, message, retryable };
}

function providerUnavailableFailure(error: unknown): BrowserTaskFailure {
  if (error instanceof DomainError) {
    return providerFailure("provider_unavailable", error.message, false);
  }
  return providerFailure("provider_unavailable", formatUnknownError(error), true);
}

async function artifactsForBrowserTask(ctx: ExecutorContext, browserTaskId: string) {
  const result = await ctx.db
    .from("artifacts")
    .select()
    .eq("profile_id", ctx.profile.id)
    .eq("browser_task_id", browserTaskId)
    .order("created_at", { ascending: true });
  return requireSupabaseRows("List browser task artifacts", result.data, result.error).map(
    browserArtifactDto,
  );
}

function jsonBytes(value: unknown): Uint8Array {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function saveBrowserArtifacts(
  ctx: ExecutorContext,
  browserTaskId: string,
  artifacts: readonly BrowserAutomationArtifactBytes[],
) {
  const saved = [];
  for (const artifact of artifacts) {
    const result = await saveProfileArtifactBytes(ctx.db, {
      profileId: ctx.profile.id,
      browserTaskId,
      filename: artifact.filename,
      description: artifact.description,
      artifactType: artifact.artifactType,
      mimeType: artifact.mimeType,
      bytes: artifact.bytes,
      metadata: artifact.metadata,
    });
    saved.push(browserArtifactDto(result.artifact));
  }
  return saved;
}

async function saveResultArtifact(
  ctx: ExecutorContext,
  input: {
    browserTaskId: string;
    mode: BrowserTaskMode;
    state: BrowserTaskState;
  },
) {
  const result = await saveProfileArtifactBytes(ctx.db, {
    profileId: ctx.profile.id,
    browserTaskId: input.browserTaskId,
    filename: `public-web-${input.mode}-result.json`,
    description: "Structured browser task result and evidence summary.",
    artifactType: "public_web.browser.result_json",
    mimeType: "application/json",
    bytes: jsonBytes({
      provider: input.state.provider,
      mode: input.state.mode,
      objective: input.state.objective,
      startUrl: input.state.startUrl,
      currentUrl: input.state.currentUrl,
      extractedFields: input.state.extractedFields ?? null,
      preparedAction: input.state.preparedAction ?? null,
      failure: input.state.failure ?? null,
      artifacts: input.state.artifacts,
    }),
    metadata: {
      mode: input.mode,
    },
  });
  return browserArtifactDto(result.artifact);
}

function requireTrustedChannel(ctx: ExecutorContext) {
  if (!ctx.resolvedTrustedChannelOrigin) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      "Trusted channel origin is required for browser handoff.",
    );
  }
  return ctx.resolvedTrustedChannelOrigin;
}

async function transitionTaskToWaitingHandoff(
  ctx: ExecutorContext,
  input: {
    browserTask: TableRow<"browser_tasks">;
    state: BrowserTaskState;
    authContext: TableRow<"browser_auth_contexts">;
    providerSessionId: string;
    reason: PublicWebHandoffReason;
    currentUrl: string;
  },
): Promise<TableRow<"browser_tasks">> {
  const handoff = await createBrowserHandoff({
    db: ctx.db,
    profile: ctx.profile,
    browserTaskId: input.browserTask.id,
    authContextId: input.authContext.id,
    providerSessionId: input.providerSessionId,
    reason: input.reason,
    assistantId: ctx.assistant.assistant_id,
    invocation: ctx.input.invocation,
    trustedChannelOrigin: requireTrustedChannel(ctx),
    toolCallId: ctx.input.toolCallId,
  });
  const finalState = {
    ...input.state,
    currentUrl: input.currentUrl,
    authContextId: input.authContext.id,
    handoff: browserHandoffDto(handoff, { includeClientUrl: true }),
  } satisfies BrowserTaskState;
  return transitionBrowserTask(ctx.db, {
    profileId: ctx.profile.id,
    browserTaskId: input.browserTask.id,
    expectedRevision: input.browserTask.revision,
    status: "waiting",
    note: "Browser task is waiting for the client to complete a secure handoff.",
    state: finalState,
    wait: {
      reason: input.reason,
      handoffId: handoff.id,
      expiresAt: handoff.expires_at,
    },
    result: browserTaskResultState(finalState),
  });
}

async function failBrowserTask(
  ctx: ExecutorContext,
  input: {
    browserTask: TableRow<"browser_tasks">;
    state: BrowserTaskState;
    failure: BrowserTaskFailure;
  },
): Promise<TableRow<"browser_tasks">> {
  const finalState = {
    ...input.state,
    failure: input.failure,
  } satisfies BrowserTaskState;
  return transitionBrowserTask(ctx.db, {
    profileId: ctx.profile.id,
    browserTaskId: input.browserTask.id,
    expectedRevision: input.browserTask.revision,
    status: "failed",
    note: input.failure.message,
    state: finalState,
    result: browserTaskResultState(finalState),
  });
}

function statusForFailure(failure: BrowserTaskFailure, waitingAllowed: boolean): BrowserTaskStatus {
  return waitingAllowed && waitingFailureKinds.has(failure.kind) ? "waiting" : "failed";
}

function waitForFailure(
  failure: BrowserTaskFailure,
  waitingAllowed: boolean,
): Record<string, unknown> | null {
  if (!waitingAllowed || !waitingFailureKinds.has(failure.kind)) return null;
  return {
    reason: failure.kind,
    message: failure.message,
  };
}

function handoffReasonForFailure(failure: BrowserTaskFailure): PublicWebHandoffReason {
  if (
    failure.kind === "login_required" ||
    failure.kind === "mfa_required" ||
    failure.kind === "captcha_required"
  ) {
    return failure.kind;
  }
  throw new DomainError(domainCodes.BAD_REQUEST, `${failure.kind} is not a handoff reason.`);
}

async function createAndNavigateHandoffSession(input: {
  authContext: TableRow<"browser_auth_contexts">;
  startUrl: string;
  allowedDomains: readonly string[];
  browserTaskId: string;
}): Promise<{ providerSessionId: string; currentUrl: string }> {
  const session = await createBrowserbaseHandoffSession({
    authContextProviderId: input.authContext.browserbase_context_id,
    metadata: {
      profileId: input.authContext.profile_id,
      browserTaskId: input.browserTaskId,
      authContextId: input.authContext.id,
    },
  });
  const navigated = await navigateStagehandHandoffSession({
    startUrl: input.startUrl,
    allowedDomains: input.allowedDomains,
    providerSessionId: session.providerSessionId,
  });
  if (!navigated.ok) {
    await releaseBrowserbaseSession(session.providerSessionId);
    throw new DomainError(domainCodes.SERVICE_UNAVAILABLE, navigated.failure.message);
  }
  return {
    providerSessionId: session.providerSessionId,
    currentUrl: navigated.value.currentUrl,
  };
}

async function finishBrowserTask(
  ctx: ExecutorContext,
  input: {
    browserTask: TableRow<"browser_tasks">;
    state: BrowserTaskState;
    result: BrowserAutomationResult;
    waitingAllowed?: boolean;
  },
) {
  if (input.result.ok) {
    const evidenceArtifacts = await saveBrowserArtifacts(
      ctx,
      input.browserTask.id,
      input.result.value.artifacts,
    );
    const stateBeforeResultArtifact = {
      ...input.state,
      currentUrl: input.result.value.currentUrl,
      artifacts: evidenceArtifacts,
      ...(input.result.value.extractedFields === undefined
        ? {}
        : { extractedFields: input.result.value.extractedFields }),
      ...(input.result.value.preparedAction === undefined
        ? {}
        : { preparedAction: input.result.value.preparedAction }),
    } satisfies BrowserTaskState;
    const resultArtifact = await saveResultArtifact(ctx, {
      browserTaskId: input.browserTask.id,
      mode: stateBeforeResultArtifact.mode,
      state: stateBeforeResultArtifact,
    });
    const finalState = {
      ...stateBeforeResultArtifact,
      artifacts: [...stateBeforeResultArtifact.artifacts, resultArtifact],
    } satisfies BrowserTaskState;
    return transitionBrowserTask(ctx.db, {
      profileId: ctx.profile.id,
      browserTaskId: input.browserTask.id,
      expectedRevision: input.browserTask.revision,
      status: "succeeded",
      note: "Browser task completed.",
      state: finalState,
      result: browserTaskResultState(finalState),
    });
  }

  const stateBeforeResultArtifact = {
    ...input.state,
    failure: input.result.failure,
  } satisfies BrowserTaskState;
  const resultArtifact = await saveResultArtifact(ctx, {
    browserTaskId: input.browserTask.id,
    mode: stateBeforeResultArtifact.mode,
    state: stateBeforeResultArtifact,
  });
  const finalState = {
    ...stateBeforeResultArtifact,
    artifacts: [...stateBeforeResultArtifact.artifacts, resultArtifact],
  } satisfies BrowserTaskState;
  const status = statusForFailure(input.result.failure, input.waitingAllowed ?? false);
  return transitionBrowserTask(ctx.db, {
    profileId: ctx.profile.id,
    browserTaskId: input.browserTask.id,
    expectedRevision: input.browserTask.revision,
    status,
    note: input.result.failure.message,
    state: finalState,
    wait: waitForFailure(input.result.failure, input.waitingAllowed ?? false),
    result: browserTaskResultState(finalState),
  });
}

async function authContextForStart(
  ctx: ExecutorContext,
  input: BrowserAuthContextStartInput,
): Promise<TableRow<"browser_auth_contexts"> | null> {
  const authContextId = input.params.authContextId ?? null;
  if (!authContextId) return null;
  const row = await requireActiveBrowserAuthContext(ctx.db, ctx.profile.id, authContextId);
  requireAuthContextCoversDomains(row, input.params.allowedDomains);
  return row;
}

async function runLiveHandoffStart(
  ctx: ExecutorContext,
  params: PublicWebLiveHandoffStartInput,
): Promise<TableRow<"browser_tasks">> {
  const authContext = await requireActiveBrowserAuthContext(
    ctx.db,
    ctx.profile.id,
    params.authContextId,
  );
  requireAuthContextCoversDomains(authContext, params.allowedDomains);
  const state = initialBrowserTaskState({
    mode: "live_handoff",
    objective: params.objective,
    startUrl: params.startUrl,
    authContextId: authContext.id,
  });
  const created = await createOrGetBrowserTask(ctx.db, {
    profileId: ctx.profile.id,
    dedupeKey: `public-web:${ctx.input.toolName}:${ctx.input.toolCallId}`,
    mode: "live_handoff",
    goal: `Web live handoff: ${params.objective}`,
    note: "Browser live handoff started.",
    state,
    assignedAgentId: ctx.assistant.assistant_id,
  });
  if (!created.created) return created.browserTask;

  try {
    const handoffSession = await createAndNavigateHandoffSession({
      authContext,
      startUrl: params.startUrl,
      allowedDomains: params.allowedDomains,
      browserTaskId: created.browserTask.id,
    });
    return transitionTaskToWaitingHandoff(ctx, {
      browserTask: created.browserTask,
      state,
      authContext,
      providerSessionId: handoffSession.providerSessionId,
      reason: "user_control_requested",
      currentUrl: handoffSession.currentUrl,
    });
  } catch (error) {
    return failBrowserTask(ctx, {
      browserTask: created.browserTask,
      state,
      failure: providerUnavailableFailure(error),
    });
  }
}

async function createAuthContextForSetup(
  ctx: ExecutorContext,
  params: PublicWebAuthContextSetupStartInput,
): Promise<TableRow<"browser_auth_contexts">> {
  const providerContext = await createBrowserbaseContext();
  try {
    return await createBrowserAuthContext({
      db: ctx.db,
      profileId: ctx.profile.id,
      label: params.label,
      primaryDomain: primaryDomainForUrl(params.startUrl),
      allowedDomains: params.allowedDomains,
      accountHint: params.accountHint ?? null,
      providerContextId: providerContext.providerContextId,
    });
  } catch (error) {
    await deleteBrowserbaseContext(providerContext.providerContextId);
    throw error;
  }
}

async function createAuthContextForActionHandoff(
  ctx: ExecutorContext,
  params: PublicWebActionPrepareStartInput,
): Promise<TableRow<"browser_auth_contexts">> {
  const providerContext = await createBrowserbaseContext();
  try {
    return await createBrowserAuthContext({
      db: ctx.db,
      profileId: ctx.profile.id,
      label: primaryDomainForUrl(params.startUrl),
      primaryDomain: primaryDomainForUrl(params.startUrl),
      allowedDomains: params.allowedDomains,
      accountHint: null,
      providerContextId: providerContext.providerContextId,
    });
  } catch (error) {
    await deleteBrowserbaseContext(providerContext.providerContextId);
    throw error;
  }
}

async function startWaitingAuthContextSetup(
  ctx: ExecutorContext,
  input: {
    browserTask: TableRow<"browser_tasks">;
    state: BrowserTaskState;
    params: PublicWebAuthContextSetupStartInput;
  },
): Promise<TableRow<"browser_tasks">> {
  let authContext: TableRow<"browser_auth_contexts"> | null = null;
  try {
    authContext = await createAuthContextForSetup(ctx, input.params);
    const handoffSession = await createAndNavigateHandoffSession({
      authContext,
      startUrl: input.params.startUrl,
      allowedDomains: input.params.allowedDomains,
      browserTaskId: input.browserTask.id,
    });
    return transitionTaskToWaitingHandoff(ctx, {
      browserTask: input.browserTask,
      state: input.state,
      authContext,
      providerSessionId: handoffSession.providerSessionId,
      reason: "login_required",
      currentUrl: handoffSession.currentUrl,
    });
  } catch (error) {
    if (authContext) {
      await markBrowserAuthContextDeleted({
        db: ctx.db,
        profileId: ctx.profile.id,
        authContextId: authContext.id,
      }).catch(() => undefined);
      await deleteBrowserbaseContext(authContext.browserbase_context_id);
    }
    return failBrowserTask(ctx, {
      browserTask: input.browserTask,
      state: input.state,
      failure: providerUnavailableFailure(error),
    });
  }
}

async function runBrowserStart(
  ctx: ExecutorContext,
  input: BrowserStartInput,
): Promise<TableRow<"browser_tasks">> {
  const state = initialStateFor(input);
  const authContext = await authContextForStart(ctx, input);
  const created = await createOrGetBrowserTask(ctx.db, {
    profileId: ctx.profile.id,
    dedupeKey: `public-web:${ctx.input.toolName}:${ctx.input.toolCallId}`,
    mode: input.mode,
    goal: goalFor(input),
    note: "Browser task started.",
    state,
    assignedAgentId: ctx.assistant.assistant_id,
  });
  if (!created.created) return created.browserTask;

  const result =
    input.mode === "extract"
      ? await runStagehandExtraction(input.params, {
          authContextProviderId: authContext?.browserbase_context_id ?? null,
          persistContext: false,
        })
      : await runStagehandActionPrepare(input.params, {
          authContextProviderId: authContext?.browserbase_context_id ?? null,
          persistContext: true,
        });
  if (
    input.mode === "action_prepare" &&
    !result.ok &&
    waitingFailureKinds.has(result.failure.kind)
  ) {
    let handoffAuthContext = authContext;
    let createdForHandoff = false;
    try {
      if (!handoffAuthContext) {
        handoffAuthContext = await createAuthContextForActionHandoff(ctx, input.params);
        createdForHandoff = true;
      }
      const handoffSession = await createAndNavigateHandoffSession({
        authContext: handoffAuthContext,
        startUrl: input.params.startUrl,
        allowedDomains: input.params.allowedDomains,
        browserTaskId: created.browserTask.id,
      });
      return transitionTaskToWaitingHandoff(ctx, {
        browserTask: created.browserTask,
        state: {
          ...state,
          authContextId: handoffAuthContext.id,
          resumeActionPrepare: {
            ...input.params,
            authContextId: handoffAuthContext.id,
          },
        },
        authContext: handoffAuthContext,
        providerSessionId: handoffSession.providerSessionId,
        reason: handoffReasonForFailure(result.failure),
        currentUrl: handoffSession.currentUrl,
      });
    } catch (error) {
      if (createdForHandoff && handoffAuthContext) {
        await markBrowserAuthContextDeleted({
          db: ctx.db,
          profileId: ctx.profile.id,
          authContextId: handoffAuthContext.id,
        }).catch(() => undefined);
        await deleteBrowserbaseContext(handoffAuthContext.browserbase_context_id);
      }
      return failBrowserTask(ctx, {
        browserTask: created.browserTask,
        state,
        failure: providerUnavailableFailure(error),
      });
    }
  }
  return finishBrowserTask(ctx, {
    browserTask: created.browserTask,
    state,
    result,
  });
}

async function runAuthContextSetupStart(
  ctx: ExecutorContext,
  params: PublicWebAuthContextSetupStartInput,
): Promise<TableRow<"browser_tasks">> {
  const state = initialBrowserTaskState({
    mode: "auth_context_setup",
    objective: params.objective,
    startUrl: params.startUrl,
  });
  const created = await createOrGetBrowserTask(ctx.db, {
    profileId: ctx.profile.id,
    dedupeKey: `public-web:${ctx.input.toolName}:${ctx.input.toolCallId}`,
    mode: "auth_context_setup",
    goal: `Web login setup: ${params.objective}`,
    note: "Browser login setup started.",
    state,
    assignedAgentId: ctx.assistant.assistant_id,
  });
  if (!created.created) return created.browserTask;
  return startWaitingAuthContextSetup(ctx, {
    browserTask: created.browserTask,
    state,
    params,
  });
}

async function latestCompletedHandoffForTask(
  ctx: ExecutorContext,
  browserTask: TableRow<"browser_tasks">,
): Promise<TableRow<"browser_handoffs">> {
  const row = await latestBrowserHandoffForTask({
    db: ctx.db,
    profileId: ctx.profile.id,
    browserTaskId: browserTask.id,
  });
  if (!row) {
    throw new DomainError(domainCodes.CONFLICT, `Browser task ${browserTask.id} has no handoff.`);
  }
  const current = await expireBrowserHandoffIfNeeded(ctx.db, row);
  if (current.status !== "completed") {
    throw new DomainError(domainCodes.CONFLICT, `Browser handoff ${current.id} is ${current.status}.`);
  }
  return current;
}

async function runTaskContinue(
  ctx: ExecutorContext,
  browserTask: TableRow<"browser_tasks">,
): Promise<TableRow<"browser_tasks">> {
  if (browserTask.status !== "waiting") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Browser task ${browserTask.id} is ${browserTask.status}, not waiting.`,
    );
  }
  const state = browserTaskStateFromBrowserTask(browserTask);
  const handoff = await latestCompletedHandoffForTask(ctx, browserTask);
  if (!handoff.browser_auth_context_id) {
    throw new DomainError(domainCodes.CONFLICT, `Browser handoff ${handoff.id} has no auth context.`);
  }
  const authContext = await requireActiveBrowserAuthContext(
    ctx.db,
    ctx.profile.id,
    handoff.browser_auth_context_id,
  );
  const stateWithCompletedHandoff = {
    ...state,
    authContextId: authContext.id,
    handoff: browserHandoffDto(handoff, { includeClientUrl: false }),
  } satisfies BrowserTaskState;

  if (state.mode === "auth_context_setup") {
    const verified = await markBrowserAuthContextVerified(ctx.db, authContext);
    await releaseBrowserbaseSession(handoff.browserbase_session_id);
    const finalState = {
      ...stateWithCompletedHandoff,
      authContextId: verified.id,
    } satisfies BrowserTaskState;
    return transitionBrowserTask(ctx.db, {
      profileId: ctx.profile.id,
      browserTaskId: browserTask.id,
      expectedRevision: browserTask.revision,
      status: "succeeded",
      note: "Browser login setup completed.",
      state: finalState,
      result: browserTaskResultState(finalState),
    });
  }

  if (state.mode === "live_handoff") {
    const verified = await markBrowserAuthContextVerified(ctx.db, authContext);
    await releaseBrowserbaseSession(handoff.browserbase_session_id);
    const finalState = {
      ...stateWithCompletedHandoff,
      authContextId: verified.id,
    } satisfies BrowserTaskState;
    return transitionBrowserTask(ctx.db, {
      profileId: ctx.profile.id,
      browserTaskId: browserTask.id,
      expectedRevision: browserTask.revision,
      status: "succeeded",
      note: "Browser live handoff completed.",
      state: finalState,
      result: browserTaskResultState(finalState),
    });
  }

  if (state.mode !== "action_prepare") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Browser task ${browserTask.id} cannot be continued in ${state.mode} mode.`,
    );
  }
  if (!state.resumeActionPrepare) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Browser task ${browserTask.id} is missing action preparation continuation state.`,
    );
  }

  try {
    const result = await runStagehandActionPrepare(
      {
        ...state.resumeActionPrepare,
        authContextId: authContext.id,
      },
      {
        browserbaseSessionId: handoff.browserbase_session_id,
        persistContext: true,
      },
    );
    if (result.ok) {
      await markBrowserAuthContextVerified(ctx.db, authContext);
    }
    return await finishBrowserTask(ctx, {
      browserTask,
      state: stateWithCompletedHandoff,
      result,
    });
  } finally {
    await releaseBrowserbaseSession(handoff.browserbase_session_id);
  }
}

function requireActiveBrowserTask(browserTask: TableRow<"browser_tasks">): void {
  const activeStatuses = new Set(["queued", "running", "waiting", "blocked"]);
  if (activeStatuses.has(browserTask.status)) return;
  throw new DomainError(
    domainCodes.CONFLICT,
    `Browser task ${browserTask.id} is already ${browserTask.status}.`,
  );
}

export const publicWebBackendCapabilityModule = defineBackendCapabilityModule({
  id: "public-web",
  contracts: publicWebToolContracts,
  immediateHandlers: {
    public_web_search: async (ctx: ExecutorContext) => {
      const params = publicWebSearchInputSchema.parse(ctx.params);
      return searchOutput(await runPerplexitySearch(params));
    },
    public_web_fetch_url: async (ctx: ExecutorContext) => {
      const params = publicWebFetchUrlInputSchema.parse(ctx.params);
      return fetchUrlOutput(await runPerplexityFetchUrl(params));
    },
    public_web_browser_extract_start: async (ctx: ExecutorContext) => {
      const params = publicWebExtractStartInputSchema.parse(ctx.params);
      const browserTask = await runBrowserStart(ctx, { mode: "extract", params });
      return taskOutputFor("public_web_browser_extract_start", browserTask);
    },
    public_web_browser_task_get: async (ctx: ExecutorContext) => {
      const params = publicWebTaskGetInputSchema.parse(ctx.params);
      const browserTask = await requireBrowserTaskForProfile(ctx.db, ctx.profile.id, params.browserTaskId);
      return taskOutputFor("public_web_browser_task_get", browserTask);
    },
    public_web_browser_auth_contexts_list: async (ctx: ExecutorContext) => {
      publicWebAuthContextsListInputSchema.parse(ctx.params);
      const rows = await listActiveBrowserAuthContexts(ctx.db, ctx.profile.id);
      return authContextsOutput(rows);
    },
    public_web_browser_task_cancel: async (ctx: ExecutorContext) => {
      const params = publicWebTaskCancelInputSchema.parse(ctx.params);
      const browserTask = await requireBrowserTaskForProfile(ctx.db, ctx.profile.id, params.browserTaskId);
      requireActiveBrowserTask(browserTask);
      const existingArtifacts = await artifactsForBrowserTask(ctx, browserTask.id);
      const currentState = browserTaskStateFromBrowserTask(browserTask);
      const handoff = await latestBrowserHandoffForTask({
        db: ctx.db,
        profileId: ctx.profile.id,
        browserTaskId: browserTask.id,
      });
      const currentHandoff = handoff
        ? await expireBrowserHandoffIfNeeded(ctx.db, handoff)
        : null;
      let handoffForState = currentHandoff;
      if (currentHandoff?.status === "waiting") {
        try {
          handoffForState = await cancelBrowserHandoff({
            db: ctx.db,
            profileId: ctx.profile.id,
            handoffId: currentHandoff.id,
          });
        } catch {
          handoffForState = currentHandoff;
        }
        await releaseBrowserbaseSession(currentHandoff.browserbase_session_id);
      }
      const finalState = {
        ...currentState,
        artifacts: existingArtifacts,
        ...(handoffForState
          ? { handoff: browserHandoffDto(handoffForState, { includeClientUrl: false }) }
          : {}),
      } satisfies BrowserTaskState;
      const cancelled = await transitionBrowserTask(ctx.db, {
        profileId: ctx.profile.id,
        browserTaskId: browserTask.id,
        expectedRevision: browserTask.revision,
        status: "cancelled",
        note: params.reason ?? "Browser task cancelled.",
        state: finalState,
        result: browserTaskResultState(finalState),
        cancelRequestedAt: new Date().toISOString(),
      });
      return taskOutputFor("public_web_browser_task_cancel", cancelled);
    },
    public_web_browser_auth_context_setup_start: async (ctx: ExecutorContext) => {
      const params = publicWebAuthContextSetupStartInputSchema.parse(ctx.params);
      const browserTask = await runAuthContextSetupStart(ctx, params);
      return taskOutputFor("public_web_browser_auth_context_setup_start", browserTask);
    },
    public_web_browser_task_continue: async (ctx: ExecutorContext) => {
      const params = publicWebTaskContinueInputSchema.parse(ctx.params);
      const browserTask = await requireBrowserTaskForProfile(ctx.db, ctx.profile.id, params.browserTaskId);
      const continued = await runTaskContinue(ctx, browserTask);
      return taskOutputFor("public_web_browser_task_continue", continued);
    },
    public_web_browser_auth_context_delete: async (ctx: ExecutorContext) => {
      const params = publicWebAuthContextDeleteInputSchema.parse(ctx.params);
      const row = await requireActiveBrowserAuthContext(ctx.db, ctx.profile.id, params.authContextId);
      await deleteBrowserbaseContext(row.browserbase_context_id);
      const deleted = await markBrowserAuthContextDeleted({
        db: ctx.db,
        profileId: ctx.profile.id,
        authContextId: row.id,
      });
      return authContextOutput(deleted);
    },
    public_web_browser_live_handoff_start: async (ctx: ExecutorContext) => {
      const params = publicWebLiveHandoffStartInputSchema.parse(ctx.params);
      const browserTask = await runLiveHandoffStart(ctx, params);
      return taskOutputFor("public_web_browser_live_handoff_start", browserTask);
    },
    public_web_browser_action_prepare_start: async (ctx: ExecutorContext) => {
      const params = publicWebActionPrepareStartInputSchema.parse(ctx.params);
      const browserTask = await runBrowserStart(ctx, { mode: "action_prepare", params });
      return taskOutputFor("public_web_browser_action_prepare_start", browserTask);
    },
  },
  externalWriteContracts: [],
});
