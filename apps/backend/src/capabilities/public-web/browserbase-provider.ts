import Browserbase from "@browserbasehq/sdk";
import type { SessionCreateParams } from "@browserbasehq/sdk/resources/sessions";
import { backendApiEnv } from "../../shared/env";

const HANDOFF_SESSION_TIMEOUT_SECONDS = 15 * 60;

function browserbaseClient(): Browserbase {
  return new Browserbase({ apiKey: backendApiEnv().browserbaseApiKey });
}

export async function createBrowserbaseContext(): Promise<{ providerContextId: string }> {
  const context = await browserbaseClient().contexts.create();
  return { providerContextId: context.id };
}

export async function deleteBrowserbaseContext(providerContextId: string): Promise<void> {
  try {
    await browserbaseClient().contexts.delete(providerContextId);
  } catch {
    return undefined;
  }
}

export async function createBrowserbaseHandoffSession(input: {
  authContextProviderId: string;
  metadata: Record<string, string>;
}): Promise<{ providerSessionId: string }> {
  const params = {
    keepAlive: true,
    timeout: HANDOFF_SESSION_TIMEOUT_SECONDS,
    browserSettings: {
      solveCaptchas: false,
      recordSession: false,
      logSession: false,
      context: {
        id: input.authContextProviderId,
        persist: true,
      },
    },
    userMetadata: input.metadata,
  } satisfies SessionCreateParams;
  const session = await browserbaseClient().sessions.create(params);
  return { providerSessionId: session.id };
}

export async function browserbaseLiveViewUrl(providerSessionId: string): Promise<string> {
  const urls = await browserbaseClient().sessions.debug(providerSessionId);
  return urls.debuggerFullscreenUrl;
}

export async function releaseBrowserbaseSession(providerSessionId: string): Promise<void> {
  try {
    await browserbaseClient().sessions.update(providerSessionId, { status: "REQUEST_RELEASE" });
  } catch {
    return undefined;
  }
}
