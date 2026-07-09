import type { TableRow } from "@ai-assistants/control-db";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { controlDb } from "../../api/control-db";
import { loadClientDurableState } from "../../product/client-state/read-model";
import { listPortalProfileActions } from "../../product/profiles/portal-queries";
import { toConnectPortalActionDto } from "../../product/actions/connect-action-dtos";
import { resolveChatGptAppInvocationContext } from "../context";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";

const morningBriefItemSchema = z.object({
  priority: z.enum(["high", "medium", "low"]),
  title: z.string().min(1),
  reason: z.string().min(1),
  source: z.string().min(1),
});

export const morningBriefOutputSchema = z.object({
  profileName: z.string().min(1),
  timezone: z.string().min(1),
  generatedAt: z.string().datetime(),
  summary: z.string().min(1),
  attentionItems: z.array(morningBriefItemSchema).max(5),
  pendingApprovalCount: z.number().int().nonnegative(),
  configuredBriefSources: z.array(z.string().min(1)).max(5),
});

type MorningBriefOutput = z.infer<typeof morningBriefOutputSchema>;
type AppsSdkToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function includesBriefSignal(value: string): boolean {
  return /brief|morning|attention|approval|workflow|financing/i.test(value);
}

function scheduledTaskBriefSources(tasks: TableRow<"assistant_scheduled_tasks">[]): string[] {
  return tasks
    .filter((task) => task.status !== "deleted")
    .filter((task) => includesBriefSignal(`${task.title} ${task.instructions}`))
    .map((task) => `Scheduled task: ${truncate(task.title, 80)}`)
    .slice(0, 3);
}

function guidanceBriefSources(guidanceRows: TableRow<"profile_guidance">[]): string[] {
  return guidanceRows
    .filter((guidance) => guidance.status === "active")
    .filter((guidance) =>
      includesBriefSignal(
        `${guidance.key} ${guidance.title} ${guidance.selector_description} ${guidance.body_markdown}`,
      ),
    )
    .map((guidance) => `Guidance: ${truncate(guidance.title, 80)}`)
    .slice(0, 2);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].slice(0, 5);
}

async function buildMorningBrief(profileId: string): Promise<MorningBriefOutput> {
  const db = controlDb();
  const [durableState, pendingActions] = await Promise.all([
    loadClientDurableState(db, { profileId, mode: "snapshot", limit: 50 }),
    listPortalProfileActions(db, profileId, { status: "pending_approval" }),
  ]);

  const approvalItems = pendingActions
    .map((action) => toConnectPortalActionDto(action))
    .slice(0, 5)
    .map((action) => ({
      priority: "high" as const,
      title: truncate(action.detail.headline, 100),
      reason: "Waiting for approval before the assistant can complete this action.",
      source: `Pending ${action.detail.kind.replaceAll("_", " ")} approval`,
    }));

  const configuredBriefSources = uniqueStrings([
    ...scheduledTaskBriefSources(durableState.scheduledTasks),
    ...guidanceBriefSources(durableState.profileGuidance),
  ]);

  const configurationItems =
    approvalItems.length === 0
      ? configuredBriefSources.slice(0, 3).map((source) => ({
          priority: "medium" as const,
          title: source.replace(/^(Scheduled task|Guidance): /, ""),
          reason: "Configured as a relevant source for morning brief or attention-list behavior.",
          source,
        }))
      : [];

  const attentionItems = [...approvalItems, ...configurationItems].slice(0, 5);

  const summary =
    attentionItems.length > 0
      ? `${durableState.profile.display_name} has ${attentionItems.length} item${
          attentionItems.length === 1 ? "" : "s"
        } worth checking now.`
      : `${durableState.profile.display_name} has no pending approvals or configured brief sources visible to this prototype.`;

  return {
    profileName: durableState.profile.display_name,
    timezone: durableState.profile.timezone,
    generatedAt: new Date().toISOString(),
    summary,
    attentionItems,
    pendingApprovalCount: pendingActions.length,
    configuredBriefSources,
  } satisfies MorningBriefOutput;
}

export async function getMorningBrief(extra: AppsSdkToolExtra): Promise<CallToolResult> {
  const resolved = resolveChatGptAppInvocationContext(extra);
  if (!resolved.ok) return resolved.result;

  let structuredContent: MorningBriefOutput;
  try {
    structuredContent = await buildMorningBrief(resolved.context.profileId);
  } catch {
    return {
      isError: true,
      structuredContent: {
        error: {
          code: "ASSISTANT_BRIEF_DATA_UNAVAILABLE",
          message:
            "The assistant backend could not load profile data for the morning brief. Check that the backend data store is running and the profile is available.",
        },
      },
      content: [
        {
          type: "text",
          text: "The assistant backend could not load profile data for the morning brief. Check that the backend data store is running and the profile is available.",
        },
      ],
    };
  }

  return {
    structuredContent,
    content: [
      {
        type: "text",
        text:
          structuredContent.attentionItems.length > 0
            ? structuredContent.summary
            : "There are no pending morning-brief items visible to this prototype.",
      },
    ],
  };
}
