import { DomainError, domainCodes } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { z } from "zod";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { backendApiEnv } from "../../shared/env";
import { nangoProxyRequestJson } from "./nango-proxy-client";

export type ProviderAccountIdentity = {
  accountEmail: string | null;
  displayLabel: string | null;
};

const gmailProfileSchema = z
  .object({
    emailAddress: z.string().trim().min(1).optional(),
  })
  .passthrough();

const googleCalendarListSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).optional(),
            primary: z.boolean().optional(),
            summary: z.string().trim().min(1).optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const googleDriveAboutSchema = z
  .object({
    user: z
      .object({
        emailAddress: z.string().trim().min(1).optional(),
        displayName: z.string().trim().min(1).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const microsoftMeSchema = z
  .object({
    mail: z.string().trim().min(1).nullable().optional(),
    userPrincipalName: z.string().trim().min(1).nullable().optional(),
    displayName: z.string().trim().min(1).nullable().optional(),
  })
  .passthrough();

const mondayGraphqlEnvelopeSchema = z
  .object({
    data: z
      .object({
        me: z
          .object({
            name: z.string().trim().min(1).optional(),
            email: z.string().trim().min(1).optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    errors: z.array(z.object({ message: z.string().optional() }).passthrough()).optional(),
  })
  .passthrough();

function clean(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function identity(accountEmail: string | null, displayLabel: string | null): ProviderAccountIdentity {
  return {
    accountEmail: clean(accountEmail),
    displayLabel: clean(displayLabel) ?? clean(accountEmail),
  };
}

async function fetchGmailIdentity(input: {
  providerConfigKey: string;
  connectionId: string;
}): Promise<ProviderAccountIdentity> {
  const profile = await nangoProxyRequestJson({
    operation: "nango.gmail.identity.profile",
    publicSummary: "Gmail account identity fetch failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    method: "get",
    endpoint: "/gmail/v1/users/me/profile",
    responseSchema: gmailProfileSchema,
    retries: 1,
  });
  return identity(profile.emailAddress ?? null, null);
}

async function fetchGoogleCalendarIdentity(input: {
  providerConfigKey: string;
  connectionId: string;
}): Promise<ProviderAccountIdentity> {
  const calendarList = await nangoProxyRequestJson({
    operation: "nango.google_calendar.identity.calendar_list",
    publicSummary: "Google Calendar account identity fetch failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    method: "get",
    endpoint: "/calendar/v3/users/me/calendarList",
    responseSchema: googleCalendarListSchema,
    retries: 1,
  });
  const primary = calendarList.items?.find((item) => item.primary) ?? null;
  return identity(primary?.id ?? null, primary?.summary ?? null);
}

async function fetchGoogleDriveIdentity(input: {
  providerConfigKey: string;
  connectionId: string;
}): Promise<ProviderAccountIdentity> {
  const about = await nangoProxyRequestJson({
    operation: "nango.google_drive.identity.about",
    publicSummary: "Google Drive account identity fetch failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    method: "get",
    endpoint: "/drive/v3/about",
    params: { fields: "user(emailAddress,displayName)" },
    responseSchema: googleDriveAboutSchema,
    retries: 1,
  });
  return identity(about.user?.emailAddress ?? null, about.user?.displayName ?? null);
}

async function fetchGoogleIdentity(input: {
  providerConfigKey: string;
  connectionId: string;
}): Promise<ProviderAccountIdentity> {
  try {
    return await fetchGmailIdentity(input);
  } catch (gmailError: unknown) {
    try {
      return await fetchGoogleDriveIdentity(input);
    } catch (driveError: unknown) {
      try {
        return await fetchGoogleCalendarIdentity(input);
      } catch (calendarError: unknown) {
        throw new DomainError(domainCodes.CONFLICT, "Google account identity lookup failed.", {
          cause: calendarError instanceof Error ? calendarError : undefined,
          details: {
            gmail_error: gmailError instanceof Error ? gmailError.message : "unknown",
            drive_error: driveError instanceof Error ? driveError.message : "unknown",
            calendar_error: calendarError instanceof Error ? calendarError.message : "unknown",
          },
        });
      }
    }
  }
}

async function fetchMicrosoftIdentity(input: {
  providerConfigKey: string;
  connectionId: string;
}): Promise<ProviderAccountIdentity> {
  const me = await nangoProxyRequestJson({
    operation: "nango.microsoft.identity.me",
    publicSummary: "Microsoft account identity fetch failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    method: "get",
    endpoint: "/v1.0/me",
    responseSchema: microsoftMeSchema,
    retries: 1,
  });
  return identity(me.mail ?? me.userPrincipalName ?? null, me.displayName ?? null);
}

async function fetchMondayIdentity(input: {
  providerConfigKey: string;
  connectionId: string;
}): Promise<ProviderAccountIdentity> {
  const envelope = await nangoProxyRequestJson({
    operation: "nango.monday.identity.me",
    publicSummary: "Monday account identity fetch failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    method: "post",
    endpoint: "/v2",
    headers: { "API-Version": backendApiEnv().mondayGraphqlApiVersion },
    data: { query: "query AiAssistantsConnectedAccountIdentity { me { id name email } }" },
    responseSchema: mondayGraphqlEnvelopeSchema,
    retries: 1,
  });
  if (envelope.errors?.length) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Monday account identity lookup failed: ${envelope.errors.map((error) => error.message ?? "Unknown error").join("; ")}`,
    );
  }
  return identity(envelope.data?.me?.email ?? null, envelope.data?.me?.name ?? null);
}

async function fetchProviderAccountIdentityStrict(input: {
  providerConfigKey: string;
  connectionId: string;
}): Promise<ProviderAccountIdentity | null> {
  switch (input.providerConfigKey) {
    case "ai-assistants-google":
      return fetchGoogleIdentity(input);
    case "ai-assistants-outlook":
    case "ai-assistants-microsoft-onedrive":
    case "ai-assistants-microsoft-sharepoint":
      return fetchMicrosoftIdentity(input);
    case "ai-assistants-monday":
      return fetchMondayIdentity(input);
    default:
      return null;
  }
}

export async function fetchProviderAccountIdentity(input: {
  profileId: string;
  providerConfigKey: string;
  connectionId: string;
}): Promise<ProviderAccountIdentity | null> {
  try {
    return await fetchProviderAccountIdentityStrict(input);
  } catch (err: unknown) {
    emitDiagnostic(backendDiagnosticLogger(), "provider_account.identity_fetch_failed", {
      ok: false,
      level: "warn",
      err: err instanceof Error ? err : undefined,
      profile_id: input.profileId,
      attrs: {
        profile_id: input.profileId,
        provider_config_key: input.providerConfigKey,
        connection_id: input.connectionId,
        recoverable: true,
        error_kind: err instanceof DomainError ? err.code : "unknown",
      },
    });
    return null;
  }
}
