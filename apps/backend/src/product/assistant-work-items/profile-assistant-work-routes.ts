import {
  requireJsonObject,
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  isProviderAssistantWorkEventType,
  type ProviderAssistantWorkEventType,
} from "@ai-assistants/tool-contracts";
import { z } from "zod";
import {
  enqueueAssistantWorkItem,
  parseAssistantWorkItemPayload,
  type AssistantWorkItem,
  type AssistantWorkItemKind,
  type AssistantWorkItemOrigin,
} from "./assistant-work-items";
import {
  deterministicGuidanceIdsForEvent,
  mergeGuidanceIds,
  selectAdditionalWorkItemGuidance,
} from "./runtime-guidance";
import { shouldPassProviderEventRouteTriage } from "./work-item-triage";

const profileAssistantWorkRouteConfigSchema = z
  .object({
    instructions: z.string().trim().min(1).max(10_000).optional(),
    priority: z.number().int().min(0).optional(),
  })
  .passthrough()
  .transform(({ instructions, priority }) => ({
    ...(instructions === undefined ? {} : { instructions }),
    ...(priority === undefined ? {} : { priority }),
  }));

type ProfileAssistantWorkRouteConfig = z.infer<typeof profileAssistantWorkRouteConfigSchema>;

const connectedAccountSummarySchema = z.object({
  id: z.string().uuid(),
  provider: z.string().trim().min(1),
  account_email: z.string().trim().min(1).nullable(),
  display_label: z.string().trim().min(1).nullable(),
});

type ConnectedAccountSummary = z.infer<typeof connectedAccountSummarySchema>;

export type LoadedProfileAssistantWorkRoute = Omit<
  TableRow<"profile_assistant_work_routes">,
  "config"
> & {
  config: ProfileAssistantWorkRouteConfig;
  connectedAccount: ConnectedAccountSummary | null;
};

const PROFILE_MANAGED_WORK_ROUTE = "profile";

const PROVIDERS_BY_EVENT_TYPE: Record<ProviderAssistantWorkEventType, readonly string[]> = {
  "google_calendar.event.changed": ["google-calendar"],
  "outlook_calendar.event.changed": ["outlook-calendar"],
  "gmail.email.received": ["gmail"],
  "outlook_mail.email.received": ["outlook-mail"],
  "twilio.sms.received": ["twilio-messaging"],
  "monday.item.created": ["monday"],
  "monday.item.updated": ["monday"],
  "boldsign.signature_request.changed": ["boldsign"],
  "google_drive.file.created": ["google-drive"],
  "google_drive.file.updated": ["google-drive"],
  "google_drive.file.deleted": ["google-drive"],
  "microsoft_onedrive.file.created": ["microsoft-onedrive"],
  "microsoft_onedrive.file.updated": ["microsoft-onedrive"],
  "microsoft_onedrive.file.deleted": ["microsoft-onedrive"],
  "microsoft_sharepoint.file.created": ["microsoft-sharepoint"],
  "microsoft_sharepoint.file.updated": ["microsoft-sharepoint"],
  "microsoft_sharepoint.file.deleted": ["microsoft-sharepoint"],
};

function routeWithConfig(
  route: TableRow<"profile_assistant_work_routes">,
  connectedAccount: ConnectedAccountSummary | null,
): LoadedProfileAssistantWorkRoute {
  return {
    ...route,
    config: profileAssistantWorkRouteConfigSchema.parse(route.config),
    connectedAccount,
  };
}

async function loadConnectedAccountSummary(
  db: SupabaseServiceClient,
  input: { profileId: string; connectedProviderAccountId: string },
): Promise<ConnectedAccountSummary> {
  const result = await db
    .from("connected_provider_accounts")
    .select("id,provider,account_email,display_label")
    .eq("profile_id", input.profileId)
    .eq("id", input.connectedProviderAccountId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `Connected provider account ${input.connectedProviderAccountId} was not found for this profile.`,
    );
  }
  return connectedAccountSummarySchema.parse(result.data);
}

async function requireCompatibleConnectedAccount(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    eventType: ProviderAssistantWorkEventType;
    connectedProviderAccountId: string;
  },
): Promise<ConnectedAccountSummary> {
  const account = await loadConnectedAccountSummary(db, input);
  const allowedProviders = PROVIDERS_BY_EVENT_TYPE[input.eventType];
  if (!allowedProviders.includes(account.provider)) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Connected provider account ${input.connectedProviderAccountId} uses provider ${account.provider}, which cannot emit ${input.eventType}.`,
    );
  }
  return account;
}

async function loadExactProfileAssistantWorkRoute(
  db: SupabaseServiceClient,
  input: { profileId: string; eventType: string; connectedProviderAccountId?: string | null },
): Promise<LoadedProfileAssistantWorkRoute | null> {
  let query = db
    .from("profile_assistant_work_routes")
    .select()
    .eq("profile_id", input.profileId)
    .eq("event_type", input.eventType);
  query =
    input.connectedProviderAccountId === undefined || input.connectedProviderAccountId === null
      ? query.is("connected_provider_account_id", null)
      : query.eq("connected_provider_account_id", input.connectedProviderAccountId);
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  const connectedAccount = result.data.connected_provider_account_id
    ? await loadConnectedAccountSummary(db, {
        profileId: input.profileId,
        connectedProviderAccountId: result.data.connected_provider_account_id,
      })
    : null;
  return routeWithConfig(result.data, connectedAccount);
}

async function loadProfileAssistantWorkRoute(
  db: SupabaseServiceClient,
  input: { profileId: string; eventType: string; connectedProviderAccountId?: string | null },
): Promise<LoadedProfileAssistantWorkRoute | null> {
  if (input.connectedProviderAccountId) {
    const accountRoute = await loadExactProfileAssistantWorkRoute(db, input);
    if (accountRoute) return accountRoute;
  }
  return loadExactProfileAssistantWorkRoute(db, {
    profileId: input.profileId,
    eventType: input.eventType,
    connectedProviderAccountId: null,
  });
}

export async function listProfileAssistantWorkRoutes(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<LoadedProfileAssistantWorkRoute[]> {
  const result = await db
    .from("profile_assistant_work_routes")
    .select()
    .eq("profile_id", profileId)
    .order("event_type", { ascending: true })
    .order("connected_provider_account_id", { ascending: true, nullsFirst: true });
  const rows = requireSupabaseRows("List profile assistant work routes", result.data, result.error);
  const accountIds = [
    ...new Set(
      rows
        .map((row) => row.connected_provider_account_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const accountSummaries = new Map<string, ConnectedAccountSummary>();
  if (accountIds.length > 0) {
    const accountsResult = await db
      .from("connected_provider_accounts")
      .select("id,provider,account_email,display_label")
      .eq("profile_id", profileId)
      .in("id", accountIds);
    const accounts = requireSupabaseRows(
      "List connected accounts for profile assistant work routes",
      accountsResult.data,
      accountsResult.error,
    ).map((account) => connectedAccountSummarySchema.parse(account));
    for (const account of accounts) accountSummaries.set(account.id, account);
  }
  return rows.map((row) =>
    routeWithConfig(
      row,
      row.connected_provider_account_id
        ? (accountSummaries.get(row.connected_provider_account_id) ?? null)
        : null,
    ),
  );
}

export async function createProfileAssistantWorkRoute(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    eventType: ProviderAssistantWorkEventType;
    connectedProviderAccountId?: string;
    instructions: string;
    priority?: number;
  },
): Promise<LoadedProfileAssistantWorkRoute> {
  const connectedAccount = input.connectedProviderAccountId
    ? await requireCompatibleConnectedAccount(db, {
        profileId: input.profileId,
        eventType: input.eventType,
        connectedProviderAccountId: input.connectedProviderAccountId,
      })
    : null;
  const existing = await loadExactProfileAssistantWorkRoute(db, {
    profileId: input.profileId,
    eventType: input.eventType,
    connectedProviderAccountId: input.connectedProviderAccountId ?? null,
  });
  if (existing) {
    const scope = input.connectedProviderAccountId
      ? ` for connected account ${input.connectedProviderAccountId}`
      : "";
    throw new DomainError(
      domainCodes.CONFLICT,
      `A profile trigger already exists for ${input.eventType}${scope}. Update the existing trigger instead.`,
    );
  }
  const config = {
    instructions: input.instructions,
    ...(input.priority === undefined ? {} : { priority: input.priority }),
  };
  const result = await db
    .from("profile_assistant_work_routes")
    .insert({
      profile_id: input.profileId,
      event_type: input.eventType,
      ...(input.connectedProviderAccountId === undefined
        ? {}
        : { connected_provider_account_id: input.connectedProviderAccountId }),
      config: requireJsonObject(config, "profileAssistantWorkRoute.config"),
      managed_by: PROFILE_MANAGED_WORK_ROUTE,
    })
    .select()
    .single();
  const row = requireSupabaseData("Create profile assistant work route", result.data, result.error);
  return {
    ...routeWithConfig(row, connectedAccount),
  };
}

export async function updateProfileAssistantWorkRoute(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    workRouteId: string;
    instructions?: string;
    priority?: number | null;
  },
): Promise<LoadedProfileAssistantWorkRoute> {
  const currentResult = await db
    .from("profile_assistant_work_routes")
    .select()
    .eq("profile_id", input.profileId)
    .eq("id", input.workRouteId)
    .maybeSingle();
  if (currentResult.error) throw currentResult.error;
  if (!currentResult.data) {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `Profile trigger ${input.workRouteId} was not found.`,
    );
  }
  const currentConfig = profileAssistantWorkRouteConfigSchema.parse(currentResult.data.config);
  const nextConfig = {
    ...currentConfig,
    ...(input.instructions === undefined ? {} : { instructions: input.instructions }),
  };
  if (input.priority !== undefined) {
    if (input.priority === null) delete nextConfig.priority;
    else nextConfig.priority = input.priority;
  }
  const result = await db
    .from("profile_assistant_work_routes")
    .update({
      config: requireJsonObject(nextConfig, "profileAssistantWorkRoute.config"),
      managed_by: PROFILE_MANAGED_WORK_ROUTE,
    })
    .eq("profile_id", input.profileId)
    .eq("id", input.workRouteId)
    .select()
    .single();
  const row = requireSupabaseData("Update profile assistant work route", result.data, result.error);
  return {
    ...routeWithConfig(
      row,
      row.connected_provider_account_id
        ? await loadConnectedAccountSummary(db, {
            profileId: input.profileId,
            connectedProviderAccountId: row.connected_provider_account_id,
          })
        : null,
    ),
  };
}

export async function deleteProfileAssistantWorkRoute(
  db: SupabaseServiceClient,
  input: { profileId: string; workRouteId: string },
): Promise<LoadedProfileAssistantWorkRoute> {
  const currentResult = await db
    .from("profile_assistant_work_routes")
    .select()
    .eq("profile_id", input.profileId)
    .eq("id", input.workRouteId)
    .maybeSingle();
  if (currentResult.error) throw currentResult.error;
  if (!currentResult.data) {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `Profile trigger ${input.workRouteId} was not found.`,
    );
  }
  const deleted = await db
    .from("profile_assistant_work_routes")
    .delete()
    .eq("profile_id", input.profileId)
    .eq("id", input.workRouteId);
  if (deleted.error) throw deleted.error;
  return {
    ...routeWithConfig(
      currentResult.data,
      currentResult.data.connected_provider_account_id
        ? await loadConnectedAccountSummary(db, {
            profileId: input.profileId,
            connectedProviderAccountId: currentResult.data.connected_provider_account_id,
          })
        : null,
    ),
  };
}

export async function enqueueRoutedAssistantWorkItem(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    eventType: ProviderAssistantWorkEventType;
    kind: AssistantWorkItemKind;
    payload: Record<string, unknown>;
    dedupeKey: string;
    priority?: number;
    origin?: AssistantWorkItemOrigin;
    availableAt?: string;
    connectedProviderAccountId?: string;
  },
): Promise<{ workItem: AssistantWorkItem | null; routeFound: boolean; joinedExisting: boolean }> {
  const route = await loadProfileAssistantWorkRoute(db, {
    profileId: input.profileId,
    eventType: input.eventType,
    ...(input.connectedProviderAccountId === undefined
      ? {}
      : { connectedProviderAccountId: input.connectedProviderAccountId }),
  });
  if (!route) return { workItem: null, routeFound: false, joinedExisting: false };

  if (!isProviderAssistantWorkEventType(input.eventType)) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Assistant work route ${input.eventType} is not a supported provider event route.`,
    );
  }

  if (!route.config.instructions) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Provider assistant work route ${input.eventType} for profile ${input.profileId} requires config.instructions.`,
    );
  }

  const payloadWithoutSelectedGuidance = route.config.instructions
    ? {
        ...input.payload,
        instructions: route.config.instructions,
      }
    : input.payload;
  const parsedPayload = parseAssistantWorkItemPayload(input.kind, payloadWithoutSelectedGuidance);
  const shouldPassRouteTriage = await shouldPassProviderEventRouteTriage({
    db,
    profileId: input.profileId,
    eventType: input.eventType,
    routeId: route.id,
    sourceId: `${route.id}:${input.dedupeKey}`,
    title: parsedPayload.title,
    detail: parsedPayload.detail ?? null,
    instructions: route.config.instructions,
    payload: payloadWithoutSelectedGuidance,
  });
  if (!shouldPassRouteTriage) {
    return { workItem: null, routeFound: true, joinedExisting: false };
  }

  const baseGuidanceIds = mergeGuidanceIds(deterministicGuidanceIdsForEvent(input.eventType));
  const selectedGuidance = await selectAdditionalWorkItemGuidance({
    db,
    profileId: input.profileId,
    eventType: input.eventType,
    title: parsedPayload.title,
    detail: parsedPayload.detail ?? null,
    instructions: route.config.instructions,
    payload: payloadWithoutSelectedGuidance,
    baseGuidanceIds,
  });
  const guidanceIds = mergeGuidanceIds(baseGuidanceIds, selectedGuidance.guidanceIds);
  const payload = {
    ...payloadWithoutSelectedGuidance,
    guidanceIds,
    profileGuidanceDbIds: selectedGuidance.profileGuidanceDbIds,
  };
  const priority = route.config.priority ?? input.priority;

  const result = await enqueueAssistantWorkItem(db, {
    profileId: input.profileId,
    kind: input.kind,
    payload,
    dedupeKey: input.dedupeKey,
    ...(priority === undefined ? {} : { priority }),
    ...(input.origin === undefined ? {} : { origin: input.origin }),
    ...(input.availableAt === undefined ? {} : { availableAt: input.availableAt }),
  });
  return {
    workItem: result.workItem,
    routeFound: true,
    joinedExisting: result.joinedExistingWorkItem,
  };
}
