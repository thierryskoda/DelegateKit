import { randomBytes } from "node:crypto";
import { z } from "zod";
import { nangoProxyRequestJson, nangoProxyRequestVoid } from "../nango/nango-proxy-client";

const stringField = z.string().trim().min(1);

const microsoftGraphDriveSchema = z
  .object({
    id: stringField,
    name: z.string().nullable().optional(),
    webUrl: z.string().nullable().optional(),
    driveType: z.string().nullable().optional(),
  })
  .passthrough();

export type MicrosoftGraphDrive = z.infer<typeof microsoftGraphDriveSchema>;

const microsoftGraphSiteSchema = z
  .object({
    id: stringField,
    name: z.string().nullable().optional(),
    displayName: z.string().nullable().optional(),
    webUrl: z.string().nullable().optional(),
  })
  .passthrough();

export type MicrosoftGraphSite = z.infer<typeof microsoftGraphSiteSchema>;

const microsoftGraphDriveItemSchema = z
  .object({
    id: stringField,
    name: z.string().nullable().optional(),
    webUrl: z.string().nullable().optional(),
    eTag: z.string().nullable().optional(),
    cTag: z.string().nullable().optional(),
    lastModifiedDateTime: z.string().nullable().optional(),
    deleted: z.record(z.string(), z.unknown()).optional(),
    file: z.record(z.string(), z.unknown()).optional(),
    folder: z.record(z.string(), z.unknown()).optional(),
    parentReference: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type MicrosoftGraphDriveItem = z.infer<typeof microsoftGraphDriveItemSchema>;

const collectionResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z
    .object({
      value: z.array(itemSchema).default([]),
      "@odata.nextLink": z.string().optional(),
      "@odata.deltaLink": z.string().optional(),
    })
    .passthrough();

const graphSubscriptionResponseSchema = z
  .object({
    id: stringField,
    resource: stringField,
    changeType: stringField,
    expirationDateTime: stringField,
    clientState: stringField.optional(),
  })
  .passthrough();

export type MicrosoftGraphSubscriptionResponse = z.infer<
  typeof graphSubscriptionResponseSchema
>;

const subscriptionBodySchema = z
  .object({
    changeType: stringField,
    notificationUrl: stringField.url(),
    resource: stringField,
    expirationDateTime: stringField,
    clientState: stringField,
    lifecycleNotificationUrl: stringField.url().optional(),
  })
  .strict();

const renewSubscriptionBodySchema = z
  .object({
    expirationDateTime: stringField,
  })
  .strict();

function graphPathFromLink(link: string): { endpoint: string; params?: string } {
  const parsed = new URL(link);
  return {
    endpoint: parsed.pathname.replace(/^\/v1\.0/, "/v1.0"),
    ...(parsed.search ? { params: parsed.search } : {}),
  };
}

async function fetchMicrosoftGraphCollection<T extends z.ZodTypeAny>(input: {
  operation: string;
  publicSummary: string;
  providerConfigKey: string;
  connectionId: string;
  endpoint: string;
  params?: Record<string, string | number | boolean | undefined> | string;
  itemSchema: T;
}): Promise<z.infer<T>[]> {
  const items: z.infer<T>[] = [];
  let request: {
    endpoint: string;
    params?: Record<string, string | number | boolean | undefined> | string;
  } | null =
    {
      endpoint: input.endpoint,
      ...(input.params === undefined ? {} : { params: input.params }),
    };
  do {
    const responseSchema = collectionResponseSchema(input.itemSchema) as z.ZodType<{
      value: z.infer<T>[];
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    }>;
    const page: {
      value: z.infer<T>[];
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    } = await nangoProxyRequestJson({
      operation: input.operation,
      publicSummary: input.publicSummary,
      providerConfigKey: input.providerConfigKey,
      connectionId: input.connectionId,
      method: "get",
      endpoint: request.endpoint,
      ...(request.params === undefined ? {} : { params: request.params }),
      responseSchema,
      retries: 3,
    });
    items.push(...page.value);
    request = page["@odata.nextLink"] ? graphPathFromLink(page["@odata.nextLink"]) : null;
  } while (request);
  return items;
}

export function newMicrosoftGraphClientState(): string {
  return randomBytes(24).toString("hex");
}

export function microsoftGraphSubscriptionExpiration(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

export function microsoftGraphSubscriptionRenewAfter(expiresAt: string | null): Date {
  if (!expiresAt) return new Date(Date.now() + 45 * 60 * 1000);
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) return new Date(Date.now() + 45 * 60 * 1000);
  return new Date(Math.max(Date.now(), expiresMs - 15 * 60 * 1000));
}

export async function listMicrosoftGraphUserDrives(input: {
  providerConfigKey: string;
  connectionId: string;
}): Promise<MicrosoftGraphDrive[]> {
  return fetchMicrosoftGraphCollection({
    operation: "microsoft_graph.drives.list_user_drives",
    publicSummary: "Microsoft Graph list user drives failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    endpoint: "/v1.0/me/drives",
    itemSchema: microsoftGraphDriveSchema,
  });
}

export async function listMicrosoftGraphSites(input: {
  providerConfigKey: string;
  connectionId: string;
}): Promise<MicrosoftGraphSite[]> {
  return fetchMicrosoftGraphCollection({
    operation: "microsoft_graph.sites.search",
    publicSummary: "Microsoft Graph SharePoint site discovery failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    endpoint: "/v1.0/sites",
    params: { search: "*" },
    itemSchema: microsoftGraphSiteSchema,
  });
}

export async function listMicrosoftGraphSiteDrives(input: {
  providerConfigKey: string;
  connectionId: string;
  siteId: string;
}): Promise<MicrosoftGraphDrive[]> {
  return fetchMicrosoftGraphCollection({
    operation: "microsoft_graph.sites.drives.list",
    publicSummary: "Microsoft Graph SharePoint site drives discovery failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    endpoint: `/v1.0/sites/${encodeURIComponent(input.siteId)}/drives`,
    itemSchema: microsoftGraphDriveSchema,
  });
}

export async function createMicrosoftGraphDriveRootSubscription(input: {
  providerConfigKey: string;
  connectionId: string;
  notificationUrl: string;
  resource: string;
  clientState: string;
  expirationDateTime: string;
}): Promise<MicrosoftGraphSubscriptionResponse> {
  return nangoProxyRequestJson({
    operation: "microsoft_graph.subscriptions.create_drive_root",
    publicSummary: "Microsoft Graph drive subscription creation failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    method: "post",
    endpoint: "/v1.0/subscriptions",
    data: {
      changeType: "updated",
      notificationUrl: input.notificationUrl,
      lifecycleNotificationUrl: input.notificationUrl,
      resource: input.resource,
      expirationDateTime: input.expirationDateTime,
      clientState: input.clientState,
    },
    bodySchema: subscriptionBodySchema,
    responseSchema: graphSubscriptionResponseSchema,
    retries: 3,
  });
}

export async function renewMicrosoftGraphSubscription(input: {
  providerConfigKey: string;
  connectionId: string;
  externalSubscriptionId: string;
  expirationDateTime: string;
}): Promise<MicrosoftGraphSubscriptionResponse> {
  return nangoProxyRequestJson({
    operation: "microsoft_graph.subscriptions.renew",
    publicSummary: "Microsoft Graph subscription renewal failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    method: "patch",
    endpoint: `/v1.0/subscriptions/${encodeURIComponent(input.externalSubscriptionId)}`,
    data: { expirationDateTime: input.expirationDateTime },
    bodySchema: renewSubscriptionBodySchema,
    responseSchema: graphSubscriptionResponseSchema,
    retries: 3,
  });
}

export async function deleteMicrosoftGraphSubscription(input: {
  providerConfigKey: string;
  connectionId: string;
  externalSubscriptionId: string;
}): Promise<void> {
  await nangoProxyRequestVoid({
    operation: "microsoft_graph.subscriptions.delete",
    publicSummary: "Microsoft Graph subscription deletion failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    method: "delete",
    endpoint: `/v1.0/subscriptions/${encodeURIComponent(input.externalSubscriptionId)}`,
    retries: 3,
  });
}

export async function fetchMicrosoftGraphDriveDelta(input: {
  providerConfigKey: string;
  connectionId: string;
  driveId: string;
  deltaLink?: string | null;
}): Promise<{
  items: MicrosoftGraphDriveItem[];
  deltaLink: string | null;
  nextLink: string | null;
}> {
  const request = input.deltaLink
    ? graphPathFromLink(input.deltaLink)
    : {
        endpoint: `/v1.0/drives/${encodeURIComponent(input.driveId)}/root/delta`,
      };
  const page = await nangoProxyRequestJson({
    operation: "microsoft_graph.drive.root.delta",
    publicSummary: "Microsoft Graph drive delta failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    method: "get",
    endpoint: request.endpoint,
    ...(request.params ? { params: request.params } : {}),
    responseSchema: collectionResponseSchema(microsoftGraphDriveItemSchema),
    retries: 3,
  });
  return {
    items: page.value,
    deltaLink: page["@odata.deltaLink"] ?? null,
    nextLink: page["@odata.nextLink"] ?? null,
  };
}
