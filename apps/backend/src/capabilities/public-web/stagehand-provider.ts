import { Stagehand } from "@browserbasehq/stagehand";
import {
  publicWebPreparedActionSchema,
  type PublicWebActionPrepareStartInput,
  type PublicWebExtractStartInput,
  type PublicWebFailureKind,
} from "@ai-assistants/public-web-contracts";
import { DomainError, domainCodes, formatUnknownError } from "@ai-assistants/errors";
import { z } from "zod";
import { backendApiEnv } from "../../shared/env";
import type { BrowserTaskFailure } from "./task-state";

const STAGEHAND_MODEL = "openai/gpt-4.1-mini";
const PUBLIC_WEB_EXECUTION_DEADLINE_MS = 38_000;
const DOM_SETTLE_TIMEOUT_MS = 2_000;
const BROWSER_SESSION_CLOSE_TIMEOUT_MS = 1_500;

type BrowserAutomationArtifactBytes = {
  filename: string;
  description: string;
  artifactType: string;
  mimeType: string;
  bytes: Uint8Array;
  metadata: Record<string, unknown>;
};

type BrowserAutomationSuccess = {
  currentUrl: string;
  extractedFields?: Record<string, string | null>;
  preparedAction?: {
    targetAction: string;
    reviewBoundary: string;
    summary: string;
  };
  artifacts: BrowserAutomationArtifactBytes[];
};

export type BrowserAutomationResult =
  | { ok: true; value: BrowserAutomationSuccess }
  | { ok: false; failure: BrowserTaskFailure };

type StagehandPage = {
  goto(
    url: string,
    options?: { waitUntil?: "domcontentloaded" | "load"; timeoutMs?: number },
  ): Promise<unknown>;
  url(): string;
  screenshot(options?: { fullPage?: boolean; type?: "png"; timeout?: number }): Promise<Buffer>;
  waitForLoadState?(state: "domcontentloaded" | "load", timeoutMs?: number): Promise<void>;
};

type StagehandSession = {
  stagehand: Stagehand;
  page: StagehandPage;
};

type BrowserExecutionDeadline = {
  readonly timeoutMs: number;
  readonly expiresAt: number;
};

export type BrowserAutomationRunOptions = {
  authContextProviderId?: string | null;
  browserbaseSessionId?: string | null;
  keepAlive?: boolean;
  persistContext?: boolean;
  closeOnFinish?: boolean;
};

function allowedDomainSet(allowedDomains: readonly string[]): Set<string> {
  return new Set(allowedDomains.map((domain) => domain.trim().toLowerCase()));
}

function domainAllowed(url: string, allowedDomains: readonly string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const domains = allowedDomainSet(allowedDomains);
  return [...domains].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function requireAllowedUrl(url: string, allowedDomains: readonly string[]): void {
  if (domainAllowed(url, allowedDomains)) return;
  throw new DomainError(domainCodes.FORBIDDEN, `Navigation to ${url} is outside allowedDomains.`);
}

function textFromUnknown(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

function buildExtractSchema(fields: PublicWebExtractStartInput["fields"]) {
  const shape: Record<string, z.ZodType<string | null | undefined>> = {};
  for (const field of fields) {
    const schema = z.string().trim().min(1).nullable().describe(field.description);
    shape[field.name] = field.required ? schema : schema.optional();
  }
  return z.object(shape).strict();
}

function normalizeExtractedFields(
  extracted: Record<string, unknown>,
  fields: PublicWebExtractStartInput["fields"],
): Record<string, string | null> {
  return Object.fromEntries(
    fields.map((field) => [field.name, textFromUnknown(extracted[field.name])]),
  );
}

function screenshotArtifact(input: {
  mode: "extract" | "action_prepare";
  bytes: Uint8Array;
  currentUrl: string;
}): BrowserAutomationArtifactBytes {
  return {
    filename: `public-web-${input.mode}-screenshot.png`,
    description: "Browser page screenshot captured at the task boundary.",
    artifactType: "public_web.browser.screenshot",
    mimeType: "image/png",
    bytes: input.bytes,
    metadata: {
      mode: input.mode,
      currentUrl: input.currentUrl,
    },
  };
}

function providerFailure(
  kind: PublicWebFailureKind,
  message: string,
  retryable: boolean,
): BrowserTaskFailure {
  return { kind, message, retryable };
}

class BrowserAutomationDeadlineError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Browser task timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    this.name = "BrowserAutomationDeadlineError";
  }
}

function executionDeadline(): BrowserExecutionDeadline {
  return {
    timeoutMs: PUBLIC_WEB_EXECUTION_DEADLINE_MS,
    expiresAt: Date.now() + PUBLIC_WEB_EXECUTION_DEADLINE_MS,
  };
}

function remainingDeadlineMs(deadline: BrowserExecutionDeadline): number {
  return Math.max(1, deadline.expiresAt - Date.now());
}

async function withBrowserDeadline<T>(
  deadline: BrowserExecutionDeadline,
  run: () => Promise<T>,
): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new BrowserAutomationDeadlineError(deadline.timeoutMs)),
          remainingDeadlineMs(deadline),
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function mapDomainError(error: DomainError): BrowserTaskFailure {
  if (error.code === domainCodes.FORBIDDEN) {
    return providerFailure("domain_not_allowed", error.message, false);
  }
  if (error.code === domainCodes.SERVICE_UNAVAILABLE) {
    return providerFailure("provider_unavailable", error.message, false);
  }
  if (error.code === domainCodes.BAD_REQUEST || error.code === domainCodes.VALIDATION) {
    return providerFailure("bad_request", error.message, false);
  }
  return providerFailure("provider_contract", error.message, false);
}

function mapProviderError(error: unknown): BrowserTaskFailure {
  if (error instanceof BrowserAutomationDeadlineError) {
    return providerFailure("timeout", error.message, true);
  }
  if (error instanceof DomainError) return mapDomainError(error);

  const message = formatUnknownError(error);
  const lower = message.toLowerCase();
  const name = error instanceof Error ? error.name.toLowerCase() : "";

  if (lower.includes("captcha") || name.includes("captcha")) {
    return providerFailure("captcha_required", "The site presented a captcha.", false);
  }
  if (lower.includes("multi-factor") || lower.includes("mfa") || lower.includes("2fa")) {
    return providerFailure("mfa_required", "The site requires multi-factor authentication.", false);
  }
  if (lower.includes("login") || lower.includes("sign in") || lower.includes("authenticate")) {
    return providerFailure(
      "login_required",
      "The site requires a login before this task can continue.",
      false,
    );
  }
  if (lower.includes("timeout") || name.includes("timeout")) {
    return providerFailure("timeout", message, true);
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return providerFailure("rate_limit", message, true);
  }
  if (
    lower.includes("api key") ||
    lower.includes("unauthorized") ||
    lower.includes("browserbase") ||
    lower.includes("service unavailable") ||
    lower.includes("fetch failed") ||
    lower.includes("network")
  ) {
    return providerFailure("provider_unavailable", message, true);
  }
  if (lower.includes("ambiguous") || lower.includes("could not determine")) {
    return providerFailure("ambiguous_page", message, false);
  }
  return providerFailure("provider_contract", message, false);
}

async function createStagehandSession(
  options: BrowserAutomationRunOptions = {},
  deadline: BrowserExecutionDeadline,
): Promise<StagehandSession> {
  const env = backendApiEnv();
  const apiKey = env.browserbaseApiKey;
  void env.openAiApiKey;
  const browserbaseSessionCreateParams = options.authContextProviderId
    ? {
        keepAlive: options.keepAlive ?? false,
        browserSettings: {
          solveCaptchas: false,
          recordSession: false,
          logSession: false,
          context: {
            id: options.authContextProviderId,
            persist: options.persistContext ?? true,
          },
        },
      }
    : undefined;

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey,
    model: STAGEHAND_MODEL,
    waitForCaptchaSolves: false,
    disablePino: true,
    verbose: 0,
    actTimeoutMs: PUBLIC_WEB_EXECUTION_DEADLINE_MS,
    domSettleTimeout: DOM_SETTLE_TIMEOUT_MS,
    serverCache: false,
    ...(browserbaseSessionCreateParams ? { browserbaseSessionCreateParams } : {}),
    ...(options.browserbaseSessionId ? { browserbaseSessionID: options.browserbaseSessionId } : {}),
    ...(options.keepAlive === undefined ? {} : { keepAlive: options.keepAlive }),
  });
  try {
    await withBrowserDeadline(deadline, () => stagehand.init());
  } catch (error) {
    await closeStagehand(stagehand);
    throw error;
  }
  const page = stagehand.context.pages()[0];
  if (!page) {
    throw new DomainError(
      domainCodes.SERVICE_UNAVAILABLE,
      "Browser automation provider did not create a page.",
    );
  }
  return { stagehand, page };
}

async function closeStagehand(stagehand: Stagehand): Promise<void> {
  const close = stagehand.close({ force: true }).catch(() => undefined);
  let timeout: NodeJS.Timeout | null = null;
  await Promise.race([
    close,
    new Promise<void>((resolve) => {
      timeout = setTimeout(resolve, BROWSER_SESSION_CLOSE_TIMEOUT_MS);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
}

async function runWithStagehand(
  run: (
    session: StagehandSession,
    deadline: BrowserExecutionDeadline,
  ) => Promise<BrowserAutomationSuccess>,
  options: BrowserAutomationRunOptions = {},
): Promise<BrowserAutomationResult> {
  let session: StagehandSession | null = null;
  const deadline = executionDeadline();
  try {
    session = await createStagehandSession(options, deadline);
    const activeSession = session;
    return {
      ok: true,
      value: await withBrowserDeadline(deadline, () => run(activeSession, deadline)),
    };
  } catch (error) {
    return { ok: false, failure: mapProviderError(error) };
  } finally {
    if (session && options.closeOnFinish !== false) await closeStagehand(session.stagehand);
  }
}

async function runBoundedAgent(input: {
  stagehand: Stagehand;
  instruction: string;
  maxSteps: number;
  deadline: BrowserExecutionDeadline;
}): Promise<string> {
  const agent = input.stagehand.agent({
    model: STAGEHAND_MODEL,
    executionModel: STAGEHAND_MODEL,
    mode: "dom",
  });
  const result = await agent.execute({
    instruction: input.instruction,
    maxSteps: input.maxSteps,
    useSearch: false,
    toolTimeout: remainingDeadlineMs(input.deadline),
  });
  if (!result.success || !result.completed) {
    throw new Error(result.message || "Browser task did not complete within the allowed steps.");
  }
  return result.message;
}

function readOnlyExtractionInstruction(input: PublicWebExtractStartInput): string {
  return [
    `Objective: ${input.objective}`,
    `Prepare the current page state for extraction: ${input.extractionInstruction}`,
    "This is a read-only extraction task.",
    "You may navigate within allowed domains only when needed to read relevant public information.",
    "Do not fill forms, sign in, solve captchas, add items to carts, submit anything, change account settings, send messages, make bookings, or perform purchases.",
    "Stop when the page is ready for structured extraction.",
  ].join("\n");
}

export async function runStagehandExtraction(
  input: PublicWebExtractStartInput,
  options: BrowserAutomationRunOptions = {},
): Promise<BrowserAutomationResult> {
  return runWithStagehand(async ({ stagehand, page }, deadline) => {
    requireAllowedUrl(input.startUrl, input.allowedDomains);
    await page.goto(input.startUrl, {
      waitUntil: "domcontentloaded",
      timeoutMs: remainingDeadlineMs(deadline),
    });
    const currentUrl = page.url();
    requireAllowedUrl(currentUrl, input.allowedDomains);

    await runBoundedAgent({
      stagehand,
      instruction: readOnlyExtractionInstruction(input),
      maxSteps: input.maxSteps,
      deadline,
    });
    const afterAgentUrl = page.url();
    requireAllowedUrl(afterAgentUrl, input.allowedDomains);

    const schema = buildExtractSchema(input.fields);
    const extracted = await stagehand.extract(input.extractionInstruction, schema, {
      timeout: remainingDeadlineMs(deadline),
      serverCache: false,
    });
    const afterExtractUrl = page.url();
    requireAllowedUrl(afterExtractUrl, input.allowedDomains);
    const screenshot = await page.screenshot({
      fullPage: true,
      type: "png",
      timeout: remainingDeadlineMs(deadline),
    });

    return {
      currentUrl: afterExtractUrl,
      extractedFields: normalizeExtractedFields(extracted, input.fields),
      artifacts: [
        screenshotArtifact({
          mode: "extract",
          bytes: screenshot,
          currentUrl: afterExtractUrl,
        }),
      ],
    };
  }, options);
}

function actionPrepareInstruction(input: PublicWebActionPrepareStartInput): string {
  return [
    `Objective: ${input.objective}`,
    `Prepare this action: ${input.targetAction}`,
    `Follow this preparation instruction: ${input.preparationInstruction}`,
    `Stop before this review boundary: ${input.reviewBoundary}`,
    "Do not click, tap, press, or trigger any final submit, place-order, pay, book, send, confirm, purchase, save account change, or legally binding action.",
    "If the page requires login, MFA, captcha, or a final action to proceed, stop immediately without bypassing it.",
    "Stop once the action is prepared and the page is ready for the user to review.",
  ].join("\n");
}

export async function runStagehandActionPrepare(
  input: PublicWebActionPrepareStartInput,
  options: BrowserAutomationRunOptions = {},
): Promise<BrowserAutomationResult> {
  return runWithStagehand(async ({ stagehand, page }, deadline) => {
    requireAllowedUrl(input.startUrl, input.allowedDomains);
    await page.goto(input.startUrl, {
      waitUntil: "domcontentloaded",
      timeoutMs: remainingDeadlineMs(deadline),
    });
    requireAllowedUrl(page.url(), input.allowedDomains);

    const agentMessage = await runBoundedAgent({
      stagehand,
      instruction: actionPrepareInstruction(input),
      maxSteps: input.maxSteps,
      deadline,
    });
    const currentUrl = page.url();
    requireAllowedUrl(currentUrl, input.allowedDomains);

    const proposal = await stagehand.extract(
      "Summarize the prepared page state for the user. Explain exactly what is prepared now and what final review or confirmation action remains undone. Do not claim the action was submitted.",
      z
        .object({
          summary: z
            .string()
            .trim()
            .min(1)
            .describe("Concise user-review summary of the prepared action and remaining boundary."),
        })
        .strict(),
      {
        timeout: remainingDeadlineMs(deadline),
        serverCache: false,
      },
    );
    const screenshot = await page.screenshot({
      fullPage: true,
      type: "png",
      timeout: remainingDeadlineMs(deadline),
    });
    const preparedAction = publicWebPreparedActionSchema.parse({
      targetAction: input.targetAction,
      reviewBoundary: input.reviewBoundary,
      summary: proposal.summary || agentMessage,
    });

    return {
      currentUrl,
      preparedAction,
      artifacts: [
        screenshotArtifact({
          mode: "action_prepare",
          bytes: screenshot,
          currentUrl,
        }),
      ],
    };
  }, options);
}

export async function navigateStagehandHandoffSession(input: {
  startUrl: string;
  allowedDomains: readonly string[];
  providerSessionId: string;
}): Promise<BrowserAutomationResult> {
  return runWithStagehand(async ({ page }, deadline) => {
    requireAllowedUrl(input.startUrl, input.allowedDomains);
    await page.goto(input.startUrl, {
      waitUntil: "domcontentloaded",
      timeoutMs: remainingDeadlineMs(deadline),
    });
    const currentUrl = page.url();
    requireAllowedUrl(currentUrl, input.allowedDomains);
    return {
      currentUrl,
      artifacts: [],
    };
  }, {
    browserbaseSessionId: input.providerSessionId,
    closeOnFinish: false,
  });
}
