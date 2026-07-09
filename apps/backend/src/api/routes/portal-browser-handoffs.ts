import type { Hono } from "hono";
import {
  browserHandoffParamsSchema,
  browserHandoffResponseSchema,
} from "@ai-assistants/connect-api-contracts";
import { requireOwnedProfile } from "../../auth/profile-access";
import { controlDb } from "../control-db";
import { authenticatedUser } from "../http-auth";
import { parseRouteParams } from "../../shared/http-validation";
import {
  browserHandoffDto,
  cancelBrowserHandoff,
  completeBrowserHandoff,
  expireBrowserHandoffIfNeeded,
  requireBrowserHandoffForProfile,
} from "../../capabilities/public-web/handoff-store";
import {
  browserbaseLiveViewUrl,
  releaseBrowserbaseSession,
} from "../../capabilities/public-web/browserbase-provider";
import {
  browserTaskResultState,
  browserTaskStateFromBrowserTask,
} from "../../capabilities/public-web/task-state";
import {
  requireBrowserTaskForProfile,
  transitionBrowserTask,
} from "../../capabilities/public-web/browser-task-store";

function connectBrowserHandoffDto(input: {
  handoff: Awaited<ReturnType<typeof requireBrowserHandoffForProfile>>;
  liveViewUrl: string | null;
}) {
  if (!input.handoff.browser_task_id) {
    throw new Error(`Browser handoff ${input.handoff.id} has no browser task.`);
  }
  return {
    handoffId: input.handoff.id,
    browserTaskId: input.handoff.browser_task_id,
    reason: input.handoff.reason,
    status: input.handoff.status,
    expiresAt: input.handoff.expires_at,
    liveViewUrl: input.liveViewUrl,
  };
}

export function registerPortalBrowserHandoffRoutes(app: Hono) {
  app.get("/profiles/:profileId/browser-handoffs/:handoffId", async (c) => {
    const user = await authenticatedUser(c);
    const { profileId, handoffId } = parseRouteParams(
      c,
      browserHandoffParamsSchema,
      "Browser handoff route params",
    );
    await requireOwnedProfile(controlDb(), user, profileId);
    const handoff = await expireBrowserHandoffIfNeeded(
      controlDb(),
      await requireBrowserHandoffForProfile({ db: controlDb(), profileId, handoffId }),
    );
    const liveViewUrl =
      handoff.status === "waiting"
        ? await browserbaseLiveViewUrl(handoff.browserbase_session_id)
        : null;
    return c.json(
      browserHandoffResponseSchema.parse({
        ok: true,
        handoff: connectBrowserHandoffDto({ handoff, liveViewUrl }),
      }),
    );
  });

  app.post("/profiles/:profileId/browser-handoffs/:handoffId/complete", async (c) => {
    const user = await authenticatedUser(c);
    const { profileId, handoffId } = parseRouteParams(
      c,
      browserHandoffParamsSchema,
      "Browser handoff complete route params",
    );
    await requireOwnedProfile(controlDb(), user, profileId);
    const handoff = await completeBrowserHandoff({ db: controlDb(), profileId, handoffId });
    return c.json(
      browserHandoffResponseSchema.parse({
        ok: true,
        handoff: connectBrowserHandoffDto({ handoff, liveViewUrl: null }),
      }),
    );
  });

  app.post("/profiles/:profileId/browser-handoffs/:handoffId/cancel", async (c) => {
    const user = await authenticatedUser(c);
    const { profileId, handoffId } = parseRouteParams(
      c,
      browserHandoffParamsSchema,
      "Browser handoff cancel route params",
    );
    await requireOwnedProfile(controlDb(), user, profileId);
    const handoff = await cancelBrowserHandoff({ db: controlDb(), profileId, handoffId });
    await releaseBrowserbaseSession(handoff.browserbase_session_id);
    if (!handoff.browser_task_id) {
      throw new Error(`Browser handoff ${handoff.id} has no browser task.`);
    }
    const browserTask = await requireBrowserTaskForProfile(controlDb(), profileId, handoff.browser_task_id);
    if (browserTask.status === "waiting") {
      const state = browserTaskStateFromBrowserTask(browserTask);
      const finalState = {
        ...state,
        handoff: browserHandoffDto(handoff, { includeClientUrl: false }),
      };
      await transitionBrowserTask(controlDb(), {
        profileId,
        browserTaskId: browserTask.id,
        expectedRevision: browserTask.revision,
        status: "cancelled",
        note: "Browser handoff cancelled by the client.",
        state: finalState,
        result: browserTaskResultState(finalState),
        cancelRequestedAt: new Date().toISOString(),
      });
    }
    return c.json(
      browserHandoffResponseSchema.parse({
        ok: true,
        handoff: connectBrowserHandoffDto({ handoff, liveViewUrl: null }),
      }),
    );
  });
}
