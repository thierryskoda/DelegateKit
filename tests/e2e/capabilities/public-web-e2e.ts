import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import {
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  publicWebToolContracts,
  type PublicWebToolName,
} from "@ai-assistants/public-web-contracts";
import { E2E_TEST_CHANNEL_DEFAULT_PEER_ID } from "../helpers/run/e2e-run";
import { createCapabilityToolCoverage } from "../helpers/capability/capability-tool-coverage";
import { useE2eDb } from "../helpers/db/e2e-db";
import { seedTestingTrustedE2eChannel } from "../helpers/fixtures/testing-trusted-channel-fixture";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import {
  buildCapabilityToolRequest,
  executeCapabilityTool,
  parseCapabilityToolOutput,
  withTrustedChannel,
} from "../helpers/run/execute-capability-backend-tool";
import { startBackend } from "../helpers/processes/start-backend";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";

const CAPABILITY_ID = "public-web";
const coverage = createCapabilityToolCoverage(CAPABILITY_ID, publicWebToolContracts);

type EnvSnapshot = {
  browserbaseApiKey?: string;
  openAiApiKey?: string;
  perplexityApiKey?: string;
};

async function typedPublicWebTool<const T extends PublicWebToolName>(
  db: SupabaseServiceClient,
  toolName: T,
  params: Record<string, unknown>,
) {
  coverage.exercise(toolName);
  const result = await executeCapabilityTool(
    db,
    withTrustedChannel(
      buildCapabilityToolRequest({
        capabilityId: CAPABILITY_ID,
        toolName,
        params,
      }),
      CAPABILITY_ID,
    ),
  );
  return parseCapabilityToolOutput(result, publicWebToolContracts, toolName);
}

async function rawPublicWebTool(
  db: SupabaseServiceClient,
  toolName: PublicWebToolName,
  params: Record<string, unknown>,
) {
  const result = await executeCapabilityTool(
    db,
    withTrustedChannel(
      buildCapabilityToolRequest({
        capabilityId: CAPABILITY_ID,
        toolName,
        params,
      }),
      CAPABILITY_ID,
    ),
  );
  return result;
}

function captureEnv(): EnvSnapshot {
  return {
    browserbaseApiKey: process.env.BROWSERBASE_API_KEY,
    openAiApiKey: process.env.OPENAI_API_KEY,
    perplexityApiKey: process.env.PERPLEXITY_API_KEY,
  };
}

function restoreEnv(snapshot: EnvSnapshot): void {
  if (snapshot.browserbaseApiKey === undefined) delete process.env.BROWSERBASE_API_KEY;
  else process.env.BROWSERBASE_API_KEY = snapshot.browserbaseApiKey;
  if (snapshot.openAiApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = snapshot.openAiApiKey;
  if (snapshot.perplexityApiKey === undefined) delete process.env.PERPLEXITY_API_KEY;
  else process.env.PERPLEXITY_API_KEY = snapshot.perplexityApiKey;
}

function clearProviderEnv(): EnvSnapshot {
  const snapshot = captureEnv();
  delete process.env.BROWSERBASE_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.PERPLEXITY_API_KEY;
  return snapshot;
}

function hasLiveBrowserConfig(): boolean {
  return Boolean(process.env.BROWSERBASE_API_KEY?.trim() && process.env.OPENAI_API_KEY?.trim());
}

function hasLivePerplexityConfig(): boolean {
  return Boolean(process.env.PERPLEXITY_API_KEY?.trim());
}

async function browserTasksForMarker(
  db: SupabaseServiceClient,
  marker: string,
): Promise<TableRow<"browser_tasks">[]> {
  const result = await db
    .from("browser_tasks")
    .select()
    .eq("profile_id", "testing")
    .ilike("goal", `%${marker}%`);
  return requireSupabaseRows("Load public web E2E browser tasks", result.data, result.error);
}

async function artifactsForBrowserTasks(
  db: SupabaseServiceClient,
  browserTaskIds: readonly string[],
): Promise<TableRow<"artifacts">[]> {
  if (browserTaskIds.length === 0) return [];
  const result = await db
    .from("artifacts")
    .select()
    .eq("profile_id", "testing")
    .in("browser_task_id", [...browserTaskIds]);
  return requireSupabaseRows("Load public web E2E artifacts", result.data, result.error);
}

async function cleanupPublicWebRows(db: SupabaseServiceClient, marker: string): Promise<void> {
  const browserTasks = await browserTasksForMarker(db, marker);
  const browserTaskIds = browserTasks.map((row) => row.id);
  if (browserTaskIds.length > 0) {
    const handoffs = await db
      .from("browser_handoffs")
      .delete()
      .in("browser_task_id", browserTaskIds)
      .select();
    requireSupabaseData(
      "Delete public web E2E handoffs",
      handoffs.data ?? [],
      handoffs.error,
    );
  }
  const authContexts = await db
    .from("browser_auth_contexts")
    .delete()
    .eq("profile_id", "testing")
    .or(`label.ilike.%${marker}%,account_hint.ilike.%${marker}%`)
    .select();
  requireSupabaseData(
    "Delete public web E2E auth contexts",
    authContexts.data ?? [],
    authContexts.error,
  );
  const artifacts = await artifactsForBrowserTasks(db, browserTaskIds);
  for (const artifact of artifacts) {
    await db.storage.from(artifact.storage_bucket).remove([artifact.storage_key]);
  }
  if (artifacts.length > 0) {
    const deletedArtifacts = await db
      .from("artifacts")
      .delete()
      .in(
        "id",
        artifacts.map((artifact) => artifact.id),
      )
      .select();
    requireSupabaseData(
      "Delete public web E2E artifacts",
      deletedArtifacts.data ?? [],
      deletedArtifacts.error,
    );
  }
  if (browserTaskIds.length > 0) {
    const deletedBrowserTasks = await db
      .from("browser_tasks")
      .delete()
      .in("id", browserTaskIds)
      .select();
    requireSupabaseData(
      "Delete public web E2E browser tasks",
      deletedBrowserTasks.data ?? [],
      deletedBrowserTasks.error,
    );
  }
}

async function seedRunningBrowserTask(
  db: SupabaseServiceClient,
  marker: string,
): Promise<TableRow<"browser_tasks">> {
  const inserted = await db
    .from("browser_tasks")
    .insert({
      profile_id: "testing",
      mode: "extract",
      status: "running",
      dedupe_key: `public-web-e2e-cancel:${marker}`,
      goal: `Web browser cancel flow ${marker}`,
      summary: "Browser task seeded for cancellation.",
      state: {
        provider: "browserbase-stagehand",
        mode: "extract",
        objective: `Seeded cancellation task ${marker}`,
        startUrl: "https://example.com",
        currentUrl: "https://example.com",
        authContextId: null,
        artifacts: [],
      },
    })
    .select()
    .single();
  return requireSupabaseData(
    "Seed public web cancellation browser task",
    inserted.data,
    inserted.error,
  );
}

async function seedCompletedAuthSetupHandoff(
  db: SupabaseServiceClient,
  marker: string,
): Promise<{ browserTask: TableRow<"browser_tasks">; authContext: TableRow<"browser_auth_contexts"> }> {
  const authContextResult = await db
    .from("browser_auth_contexts")
    .insert({
      profile_id: "testing",
      label: `Example.com saved login ${marker}`,
      primary_domain: "example.com",
      allowed_domains: ["example.com"],
      account_hint: `example.com account ${marker}`,
      browserbase_context_id: `ctx_${marker}`,
      status: "active",
    })
    .select()
    .single();
  const authContext = requireSupabaseData(
    "Seed browser auth context",
    authContextResult.data,
    authContextResult.error,
  );
  const browserTaskResult = await db
    .from("browser_tasks")
    .insert({
      profile_id: "testing",
      mode: "auth_context_setup",
      status: "waiting",
      dedupe_key: `public-web-e2e-continue:${marker}`,
      goal: `Web browser login setup continuation ${marker}`,
      summary: "Browser login setup seeded for continuation.",
      state: {
        provider: "browserbase-stagehand",
        mode: "auth_context_setup",
        objective: `Seeded login setup ${marker}`,
        startUrl: "https://example.com",
        currentUrl: "https://example.com",
        authContextId: authContext.id,
        artifacts: [],
      },
      wait: {
        reason: "login_required",
        handoffId: "seeded",
      },
    })
    .select()
    .single();
  const browserTask = requireSupabaseData(
    "Seed browser continuation browser task",
    browserTaskResult.data,
    browserTaskResult.error,
  );
  const handoffResult = await db
    .from("browser_handoffs")
    .insert({
      profile_id: "testing",
      browser_task_id: browserTask.id,
      browser_auth_context_id: authContext.id,
      browserbase_session_id: `session_${marker}`,
      reason: "login_required",
      status: "completed",
      client_url: "https://connect.ai-assistants.dev/assistants/testing/browser-handoff/00000000-0000-4000-8000-000000000000",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      completed_at: new Date().toISOString(),
    })
    .select()
    .single();
  requireSupabaseData("Seed browser completed handoff", handoffResult.data, handoffResult.error);
  return { browserTask, authContext };
}

async function setupPublicWebE2e(t: TestContext, markerPrefix: string) {
  const run = await createE2eRun(t, { id: CAPABILITY_ID });
  const supabase = await attachE2eSupabase(run);
  const db = await useE2eDb();
  const marker = createMarker(markerPrefix);

  await cleanupPublicWebRows(db, marker);
  await startBackend(run, { supabase });
  const trustedChannel = await seedTestingTrustedE2eChannel({
    db,
    profileId: "testing",
    peerId: E2E_TEST_CHANNEL_DEFAULT_PEER_ID,
    marker,
    purpose: CAPABILITY_ID,
  });
  t.after(async () => {
    await trustedChannel.cleanup();
    await cleanupPublicWebRows(db, marker);
  });

  return { db, marker };
}

test("Public-web capability handles setup failures, disallowed domains, get, cancel, and action preparation.", async (t) => {
  const { db, marker } = await setupPublicWebE2e(t, "public-web");

  const untrustedActionPrepare = await executeCapabilityTool(
    db,
    buildCapabilityToolRequest({
      capabilityId: CAPABILITY_ID,
      toolName: "public_web_browser_action_prepare_start",
      params: {
        startUrl: "https://example.com",
        allowedDomains: ["example.com"],
        objective: `Reject untrusted action preparation for ${marker}`,
        targetAction: "Prepare a visible page action.",
        reviewBoundary: "Submitting any final action.",
        preparationInstruction: "Inspect the page state without submitting anything.",
      },
    }),
  );
  assert.equal("error" in untrustedActionPrepare, true);
  assert.ok("error" in untrustedActionPrepare);
  assert.match(untrustedActionPrepare.error.message, /Trusted channel origin is required/);

  const untrustedAuthSetup = await executeCapabilityTool(
    db,
    buildCapabilityToolRequest({
      capabilityId: CAPABILITY_ID,
      toolName: "public_web_browser_auth_context_setup_start",
      params: {
        startUrl: "https://example.com",
        allowedDomains: ["example.com"],
        objective: `Reject untrusted login setup for ${marker}`,
        label: `Example.com login ${marker}`,
      },
    }),
  );
  assert.equal("error" in untrustedAuthSetup, true);
  assert.ok("error" in untrustedAuthSetup);
  assert.match(untrustedAuthSetup.error.message, /Trusted channel origin is required/);

  const untrustedContinue = await executeCapabilityTool(
    db,
    buildCapabilityToolRequest({
      capabilityId: CAPABILITY_ID,
      toolName: "public_web_browser_task_continue",
      params: {
        browserTaskId: "00000000-0000-4000-8000-000000000000",
      },
    }),
  );
  assert.equal("error" in untrustedContinue, true);
  assert.ok("error" in untrustedContinue);
  assert.match(untrustedContinue.error.message, /Trusted channel origin is required/);

  const untrustedLiveHandoff = await executeCapabilityTool(
    db,
    buildCapabilityToolRequest({
      capabilityId: CAPABILITY_ID,
      toolName: "public_web_browser_live_handoff_start",
      params: {
        startUrl: "https://example.com",
        allowedDomains: ["example.com"],
        objective: `Reject untrusted live handoff for ${marker}`,
        authContextId: "00000000-0000-4000-8000-000000000000",
      },
    }),
  );
  assert.equal("error" in untrustedLiveHandoff, true);
  assert.ok("error" in untrustedLiveHandoff);
  assert.match(untrustedLiveHandoff.error.message, /Trusted channel origin is required/);

  const env = clearProviderEnv();
  try {
    const initialContexts = (
      await typedPublicWebTool(db, "public_web_browser_auth_contexts_list", {})
    ).authContexts;
    assert.equal(initialContexts.some((context) => context.accountHint?.includes(marker)), false);

    const publicSearch = await typedPublicWebTool(db, "public_web_search", {
      query: `current public web status check ${marker}`,
      count: 1,
    });
    assert.equal(publicSearch.status, "failed");
    assert.equal(publicSearch.failure?.kind, "missing_config");
    assert.match(publicSearch.failure?.message ?? "", /PERPLEXITY_API_KEY/);

    const publicFetchMissingConfig = await typedPublicWebTool(db, "public_web_fetch_url", {
      url: "https://example.com",
      objective: `Fetch example.com for ${marker}`,
      instructions: "Return the page title if available.",
    });
    assert.equal(publicFetchMissingConfig.status, "failed");
    assert.equal(publicFetchMissingConfig.failure?.kind, "missing_config");
    assert.match(publicFetchMissingConfig.failure?.message ?? "", /PERPLEXITY_API_KEY/);

    const blockedFetch = await typedPublicWebTool(db, "public_web_fetch_url", {
      url: "http://127.0.0.1/private",
      objective: `Reject private URL fetch for ${marker}`,
      instructions: "Fetch only if this is a public URL.",
    });
    assert.equal(blockedFetch.status, "failed");
    assert.equal(blockedFetch.failure?.kind, "blocked_url");

    const blockedIpv6Fetch = await typedPublicWebTool(db, "public_web_fetch_url", {
      url: "http://[::1]/private",
      objective: `Reject private IPv6 URL fetch for ${marker}`,
      instructions: "Fetch only if this is a public URL.",
    });
    assert.equal(blockedIpv6Fetch.status, "failed");
    assert.equal(blockedIpv6Fetch.failure?.kind, "blocked_url");

    const authSetup = (
      await typedPublicWebTool(db, "public_web_browser_auth_context_setup_start", {
        startUrl: "https://example.com",
        allowedDomains: ["example.com"],
        objective: `Set up login for ${marker}`,
        label: `Example.com login ${marker}`,
        accountHint: `example.com account ${marker}`,
      })
    ).task;
    assert.equal(authSetup.status, "failed");
    assert.equal(authSetup.mode, "auth_context_setup");
    assert.equal(authSetup.failure?.kind, "provider_unavailable");
    assert.match(authSetup.failure?.message ?? "", /BROWSERBASE_API_KEY/);
    assert.equal(authSetup.handoff, undefined);

    const seededContinuation = await seedCompletedAuthSetupHandoff(db, marker);
    const continued = (
      await typedPublicWebTool(db, "public_web_browser_task_continue", {
        browserTaskId: seededContinuation.browserTask.id,
      })
    ).task;
    assert.equal(continued.status, "succeeded");
    assert.equal(continued.mode, "auth_context_setup");
    assert.equal(continued.authContextId, seededContinuation.authContext.id);
    assert.equal(continued.handoff?.status, "completed");
    assert.equal(continued.handoff?.clientUrl, null);

    const contextsAfterContinue = (
      await typedPublicWebTool(db, "public_web_browser_auth_contexts_list", {})
    ).authContexts;
    assert.ok(
      contextsAfterContinue.some(
        (context) => context.authContextId === seededContinuation.authContext.id,
      ),
    );

    const liveHandoff = (
      await typedPublicWebTool(db, "public_web_browser_live_handoff_start", {
        startUrl: "https://example.com",
        allowedDomains: ["example.com"],
        objective: `Let the user inspect example.com manually for ${marker}`,
        authContextId: seededContinuation.authContext.id,
      })
    ).task;
    assert.equal(liveHandoff.status, "failed");
    assert.equal(liveHandoff.mode, "live_handoff");
    assert.equal(liveHandoff.authContextId, seededContinuation.authContext.id);
    assert.equal(liveHandoff.failure?.kind, "provider_unavailable");
    assert.match(liveHandoff.failure?.message ?? "", /BROWSERBASE_API_KEY/);
    assert.equal(liveHandoff.handoff, undefined);

    const deletedContext = (
      await typedPublicWebTool(db, "public_web_browser_auth_context_delete", {
        authContextId: seededContinuation.authContext.id,
        reason: `Remove saved login ${marker}`,
      })
    ).authContext;
    assert.equal(deletedContext.status, "deleted");
    assert.equal(deletedContext.authContextId, seededContinuation.authContext.id);

    const extract = (
      await typedPublicWebTool(db, "public_web_browser_extract_start", {
        startUrl: "https://example.com",
        allowedDomains: ["example.com"],
        objective: `Extract page details for ${marker}`,
        extractionInstruction: "Extract the page heading and a short summary.",
        fields: [
          {
            name: "heading",
            description: "The main page heading.",
            required: true,
          },
          {
            name: "summary",
            description: "A short summary of the page content.",
            required: true,
          },
        ],
      })
    ).task;
    assert.equal(extract.status, "failed");
    assert.equal(extract.failure?.kind, "provider_unavailable");
    assert.match(extract.failure?.message ?? "", /BROWSERBASE_API_KEY/);
    assert.equal(extract.artifacts.length, 1);
    assert.equal(extract.artifacts[0]?.artifactType, "public_web.browser.result_json");

    const fetched = (
      await typedPublicWebTool(db, "public_web_browser_task_get", {
        browserTaskId: extract.browserTaskId,
      })
    ).task;
    assert.equal(fetched.browserTaskId, extract.browserTaskId);
    assert.equal(fetched.status, "failed");
    assert.equal(fetched.failure?.kind, "provider_unavailable");

    const actionPrepare = (
      await typedPublicWebTool(db, "public_web_browser_action_prepare_start", {
        startUrl: "https://example.com",
        allowedDomains: ["example.com"],
        objective: `Prepare but do not submit a page action for ${marker}`,
        targetAction: "Prepare to inspect the More information link.",
        reviewBoundary: "Opening or submitting any final external action.",
        preparationInstruction:
          "Review the page state and stop before opening any link or submitting anything.",
      })
    ).task;
    assert.equal(actionPrepare.status, "failed");
    assert.equal(actionPrepare.failure?.kind, "provider_unavailable");
    assert.equal(actionPrepare.mode, "action_prepare");
    assert.equal(actionPrepare.artifacts.length, 1);

    const disallowedDomain = await rawPublicWebTool(db, "public_web_browser_extract_start", {
      startUrl: "https://example.com",
      allowedDomains: ["openai.com"],
      objective: `Reject disallowed start domain for ${marker}`,
      extractionInstruction: "Extract the page heading.",
      fields: [
        {
          name: "heading",
          description: "The main page heading.",
          required: true,
        },
      ],
    });
    assert.equal("error" in disallowedDomain, true);
    assert.ok("error" in disallowedDomain);
    assert.match(disallowedDomain.error.message, /allowedDomains must include/);

    const seeded = await seedRunningBrowserTask(db, marker);
    const cancelled = (
      await typedPublicWebTool(db, "public_web_browser_task_cancel", {
        browserTaskId: seeded.id,
        reason: `No longer needed ${marker}`,
      })
    ).task;
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.browserTaskId, seeded.id);
    assert.equal(cancelled.failure, undefined);
  } finally {
    restoreEnv(env);
  }

  coverage.assertComplete();
});

test(
  "Public-web search and fetch call Perplexity when config is present.",
  { skip: hasLivePerplexityConfig() ? false : "PERPLEXITY_API_KEY is required." },
  async (t) => {
    const { db, marker } = await setupPublicWebE2e(t, "public-web-perplexity");

    const search = await typedPublicWebTool(db, "public_web_search", {
      query: `Example Domain ${marker}`,
      count: 2,
      search_domain_filter: ["example.com"],
      max_tokens_per_page: 512,
    });
    assert.equal(search.status, "succeeded");
    assert.ok(search.count >= 1);
    assert.ok(search.results.some((result) => result.url.includes("example.com")));

    const fetchResult = await typedPublicWebTool(db, "public_web_fetch_url", {
      url: "https://example.com",
      objective: `Read Example Domain for ${marker}`,
      instructions: "Fetch the URL and summarize the visible page purpose in one sentence.",
      maxOutputTokens: 400,
    });
    assert.notEqual(fetchResult.status, "failed");
    assert.ok(fetchResult.answer || fetchResult.fetchedContents.length > 0);
    assert.equal(fetchResult.requestedUrl, "https://example.com");
  },
);

test(
  "Public-web live extraction and action preparation produce evidence when Browserbase config is present.",
  { skip: hasLiveBrowserConfig() ? false : "BROWSERBASE_API_KEY and OPENAI_API_KEY are required." },
  async (t) => {
    const { db, marker } = await setupPublicWebE2e(t, "public-web-live");

    const extract = (
      await typedPublicWebTool(db, "public_web_browser_extract_start", {
        startUrl: "https://example.com",
        allowedDomains: ["example.com"],
        objective: `Live extraction ${marker}`,
        extractionInstruction: "Extract the main heading and the first sentence of body text.",
        fields: [
          {
            name: "heading",
            description: "The main heading visible on the page.",
            required: true,
          },
          {
            name: "bodySummary",
            description: "One short sentence describing the visible page body.",
            required: true,
          },
        ],
      })
    ).task;
    assert.equal(extract.status, "succeeded");
    assert.equal(new URL(extract.currentUrl ?? "").hostname, "example.com");
    assert.ok(extract.extractedFields?.heading);
    assert.ok(
      extract.artifacts.some((artifact) => artifact.artifactType === "public_web.browser.screenshot"),
    );
    assert.ok(
      extract.artifacts.some((artifact) => artifact.artifactType === "public_web.browser.result_json"),
    );

    const actionPrepare = (
      await typedPublicWebTool(db, "public_web_browser_action_prepare_start", {
        startUrl: "https://example.com",
        allowedDomains: ["example.com"],
        objective: `Live action preparation ${marker}`,
        targetAction: "Prepare to review the visible page before following its information link.",
        reviewBoundary: "Opening the More information link or submitting any external action.",
        preparationInstruction:
          "Inspect the visible page state. Do not open links and do not submit anything.",
      })
    ).task;
    assert.equal(actionPrepare.status, "succeeded");
    assert.equal(actionPrepare.mode, "action_prepare");
    assert.ok(actionPrepare.preparedAction?.summary);
    assert.match(actionPrepare.preparedAction?.reviewBoundary ?? "", /More information|submitting/);
    assert.ok(
      actionPrepare.artifacts.some(
        (artifact) => artifact.artifactType === "public_web.browser.screenshot",
      ),
    );
  },
);

test(
  "Public-web live extraction returns structured task timeout before proxy timeout.",
  { skip: hasLiveBrowserConfig() ? false : "BROWSERBASE_API_KEY and OPENAI_API_KEY are required." },
  async (t) => {
    const { db, marker } = await setupPublicWebE2e(t, "public-web-timeout");

    const timeoutTask = (
      await typedPublicWebTool(db, "public_web_browser_extract_start", {
        startUrl: "https://slee.pt/api/delay?time=75s",
        allowedDomains: ["slee.pt"],
        objective: `Trigger a bounded browser timeout for ${marker}`,
        extractionInstruction:
          "Extract the delayed JSON response after the page finishes loading.",
        fields: [
          {
            name: "statusText",
            description: "The visible delayed response text.",
            required: false,
          },
        ],
        maxSteps: 1,
      })
    ).task;

    assert.equal(timeoutTask.status, "failed");
    assert.equal(timeoutTask.failure?.kind, "timeout");
    assert.equal(timeoutTask.failure?.retryable, true);
    assert.ok(
      timeoutTask.artifacts.some((artifact) => artifact.artifactType === "public_web.browser.result_json"),
    );

    const fetched = (
      await typedPublicWebTool(db, "public_web_browser_task_get", {
        browserTaskId: timeoutTask.browserTaskId,
      })
    ).task;
    assert.equal(fetched.browserTaskId, timeoutTask.browserTaskId);
    assert.equal(fetched.status, "failed");
    assert.equal(fetched.failure?.kind, "timeout");
    assert.ok(
      fetched.artifacts.some((artifact) => artifact.artifactType === "public_web.browser.result_json"),
    );
  },
);
