import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { toolDataForContract, type BackendToolResult } from "@ai-assistants/tool-contracts";
import { boldsignToolContracts } from "@ai-assistants/boldsign-contracts/contracts";
import { toolContractByName } from "@ai-assistants/tool-contracts";
import { z } from "zod";
import { boldsignApiDownloadDocument, boldsignApiListDocuments } from "./api-client";
import { requireBackendSecretProviderCapabilityAccount } from "../../integrations/provider-runtime";
import {
  boldsignFileDownloadInputSchema,
  boldsignSignatureRequestsListInputSchema,
} from "@ai-assistants/boldsign-contracts/schemas";
import { createHash, randomUUID } from "node:crypto";
import { PROVIDER_BINARY_ARTIFACT_MAX_BYTES } from "../../product/artifacts/provider-binary-limits";
import { uploadStorageObject } from "../../product/actions/execution/artifact-storage";
import { recordArtifact } from "../../product/artifacts/artifact-store";
import {
  boldSignAssistantLabels,
  listOwnedBoldSignDocuments,
  listOwnedBoldSignDocumentIds,
  requireOwnedBoldSignDocument,
} from "./document-ownership";

function asRecord(value: unknown): Record<string, unknown> {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  return parsed.success ? parsed.data : {};
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function pickDocuments(body: Record<string, unknown>): Record<string, unknown>[] {
  for (const key of ["result", "documents", "documentRecords", "data"]) {
    const docs = asRecordArray(body[key]);
    if (docs.length > 0) return docs;
  }
  return [];
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstStringOrInteger(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isInteger(value)) return String(value);
  }
  return null;
}

function normalizeProviderTimestamp(...values: unknown[]): string | null {
  const value = firstStringOrInteger(...values);
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isInteger(numeric) && Number.isFinite(numeric)) {
    const millis = numeric > 1_000_000_000_000 ? numeric : numeric * 1_000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function firstInteger(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isInteger(value)) return value;
  }
  return null;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

type BoldSignRequestSummary = {
  documentId: string | null;
  status: string;
  title: string | null;
  sentAt: string | null;
  sentAtProfileLocal: string | null;
  completedAt: string | null;
  completedAtProfileLocal: string | null;
};

async function loadProfileTimezone(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<string> {
  const result = await db.from("profiles").select("timezone").eq("id", profileId).maybeSingle();
  if (result.error) throw result.error;
  const timezone = result.data?.timezone?.trim();
  if (!timezone) {
    throw new DomainError(domainCodes.NOT_FOUND, `Profile ${profileId} has no timezone.`);
  }
  return timezone;
}

function formatProfileLocalTimestamp(timestamp: string | null, timezone: string): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function timestampMillis(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const millis = new Date(value).getTime();
  return Number.isNaN(millis) ? Number.NEGATIVE_INFINITY : millis;
}

function latestBy(
  requests: readonly BoldSignRequestSummary[],
  timestamp: (request: BoldSignRequestSummary) => string | null,
): BoldSignRequestSummary | null {
  let latest: BoldSignRequestSummary | null = null;
  for (const request of requests) {
    if (!latest || timestampMillis(timestamp(request)) > timestampMillis(timestamp(latest))) {
      latest = request;
    }
  }
  return latest;
}

function clientSafeRequestSummary(request: BoldSignRequestSummary | null) {
  if (!request) return null;
  return {
    status: request.status,
    title: request.title,
    sentAt: request.sentAt,
    sentAtProfileLocal: request.sentAtProfileLocal,
    completedAt: request.completedAt,
    completedAtProfileLocal: request.completedAtProfileLocal,
  };
}

function dbOwnedRowMatchesFilters(input: {
  row: Awaited<ReturnType<typeof listOwnedBoldSignDocuments>>[number];
  query?: string | undefined;
  recipients?: readonly string[] | undefined;
  statuses?: readonly string[] | undefined;
  labels?: readonly string[] | undefined;
  sentBy?: readonly string[] | undefined;
  transmitType?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
}): boolean {
  if (input.labels && input.labels.length > 0) return false;
  if (input.sentBy && input.sentBy.length > 0) return false;
  if (input.transmitType) return false;
  const query = input.query?.trim().toLowerCase();
  if (query) {
    const haystack = [
      input.row.title,
      input.row.signer_email,
      input.row.provider_status,
      input.row.document_id,
    ]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  if (input.recipients && input.recipients.length > 0) {
    const signer = input.row.signer_email?.trim().toLowerCase();
    const recipients = new Set(input.recipients.map((recipient) => recipient.trim().toLowerCase()));
    if (!signer || !recipients.has(signer)) return false;
  }
  if (input.statuses && input.statuses.length > 0) {
    const status = input.row.provider_status?.trim().toLowerCase();
    const statuses = new Set(input.statuses.map((item) => item.trim().toLowerCase()));
    if (!status || !statuses.has(status)) return false;
  }
  const sentAtMillis = timestampMillis(input.row.sent_at);
  if (input.startDate && sentAtMillis < timestampMillis(input.startDate)) return false;
  if (input.endDate && sentAtMillis > timestampMillis(input.endDate)) return false;
  return true;
}

function summarizeBoldSignRequests(requests: readonly BoldSignRequestSummary[]) {
  const counts = new Map<string, number>();
  for (const request of requests) {
    counts.set(request.status, (counts.get(request.status) ?? 0) + 1);
  }
  const completedRequests = requests.filter(
    (request) => request.status.trim().toLowerCase() === "completed",
  );
  const latestRequest = latestBy(requests, (request) => request.sentAt);
  const latestCompletedRequest = latestBy(completedRequests, (request) => request.completedAt);
  return {
    statusCounts: [...counts.entries()].map(([status, count]) => ({ status, count })),
    latestRequest: clientSafeRequestSummary(latestRequest),
    latestCompletedRequest: clientSafeRequestSummary(latestCompletedRequest),
    viewedStatusAvailable: false as const,
  };
}

export async function executeBoldSignReadTool(
  db: SupabaseServiceClient,
  profileId: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<BackendToolResult> {
  switch (toolName) {
    case "boldsign_signature_requests_list": {
      const parsed = boldsignSignatureRequestsListInputSchema.parse(params);
      const statuses =
        parsed.statuses ??
        (parsed.status === undefined
          ? undefined
          : Array.isArray(parsed.status)
            ? parsed.status
            : [parsed.status]);
      const binding = await requireBackendSecretProviderCapabilityAccount(db, {
        profileId,
        providers: ["boldsign"],
        ...(parsed.connectedAccountId === undefined
          ? {}
          : { connectedAccountId: parsed.connectedAccountId }),
      });
      let requiredOwnership: Awaited<ReturnType<typeof requireOwnedBoldSignDocument>> | null = null;
      if (parsed.documentId) {
        requiredOwnership = await requireOwnedBoldSignDocument(db, {
          profileId,
          binding,
          documentId: parsed.documentId,
        });
      }
      const labels = uniqueStrings([
        ...(parsed.documentId ? [] : boldSignAssistantLabels(profileId)),
        ...(parsed.labels ?? []),
      ]);
      const providerData = await boldsignApiListDocuments({
        page: parsed.page,
        pageSize: parsed.limit,
        ...(parsed.query === undefined ? {} : { searchKey: parsed.query }),
        ...(parsed.sentBy === undefined ? {} : { sentBy: parsed.sentBy }),
        ...(parsed.recipients === undefined ? {} : { recipients: parsed.recipients }),
        ...(statuses === undefined ? {} : { status: statuses }),
        labels,
        ...(parsed.transmitType === undefined ? {} : { transmitType: parsed.transmitType }),
        ...(parsed.dateFilterType === undefined ? {} : { dateFilterType: parsed.dateFilterType }),
        ...(parsed.startDate === undefined ? {} : { startDate: parsed.startDate }),
        ...(parsed.endDate === undefined ? {} : { endDate: parsed.endDate }),
        ...(parsed.nextCursor === undefined ? {} : { nextCursor: parsed.nextCursor }),
        sandbox: { db, binding },
      });

      const documents = pickDocuments(providerData);
      const returnedDocumentIds = uniqueStrings(
        documents
          .map((document) => firstString(document.documentId, document.document_id, document.id))
          .filter((documentId): documentId is string => documentId !== null),
      );
      const ownedDocumentIds = await listOwnedBoldSignDocumentIds(db, {
        profileId,
        binding,
        documentIds: parsed.documentId ? [parsed.documentId] : returnedDocumentIds,
      });
      const timezone = await loadProfileTimezone(db, profileId);
      const filtered = parsed.documentId
        ? documents.filter(
            (document) =>
              firstString(document.documentId, document.document_id, document.id) ===
                parsed.documentId &&
              ownedDocumentIds.has(parsed.documentId),
          )
        : documents.filter((document) => {
            const documentId = firstString(document.documentId, document.document_id, document.id);
            return documentId !== null && ownedDocumentIds.has(documentId);
          });

      const requestsByDocumentId = new Map<string, BoldSignRequestSummary>();
      for (const document of filtered) {
        const sentAt = normalizeProviderTimestamp(
          document.sentDate,
          document.createdDate,
          document.createdOn,
        );
        const completedAt = normalizeProviderTimestamp(
          document.completedDate,
          document.activityDate,
        );
        const documentId = firstString(document.documentId, document.document_id, document.id);
        if (!documentId) continue;
        requestsByDocumentId.set(documentId, {
          documentId,
          status: firstString(document.status, document.documentStatus) ?? "unknown",
          title: firstString(
            document.title,
            document.documentTitle,
            document.messageTitle,
            document.fileName,
          ),
          sentAt,
          sentAtProfileLocal: formatProfileLocalTimestamp(sentAt, timezone),
          completedAt,
          completedAtProfileLocal: formatProfileLocalTimestamp(completedAt, timezone),
        });
      }

      const dbOwnedRows = requiredOwnership
        ? [requiredOwnership]
        : await listOwnedBoldSignDocuments(db, {
            profileId,
            binding,
            limit: parsed.limit,
          });
      for (const row of dbOwnedRows) {
        if (requestsByDocumentId.has(row.document_id)) continue;
        if (
          !dbOwnedRowMatchesFilters({
            row,
            query: parsed.query,
            recipients: parsed.recipients,
            statuses,
            labels: parsed.labels,
            sentBy: parsed.sentBy,
            transmitType: parsed.transmitType,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
          })
        ) {
          continue;
        }
        requestsByDocumentId.set(row.document_id, {
          documentId: row.document_id,
          status: row.provider_status ?? "unknown",
          title: row.title,
          sentAt: row.sent_at,
          sentAtProfileLocal: formatProfileLocalTimestamp(row.sent_at, timezone),
          completedAt: row.completed_at,
          completedAtProfileLocal: formatProfileLocalTimestamp(row.completed_at, timezone),
        });
      }

      const requests = [...requestsByDocumentId.values()]
        .sort((left, right) => timestampMillis(right.sentAt) - timestampMillis(left.sentAt))
        .slice(0, parsed.limit);

      return toolDataForContract(
        toolContractByName(boldsignToolContracts, "boldsign_signature_requests_list"),
        {
          provider: "boldsign",
          connectedAccountId: binding.account.id,
          accountEmail: binding.account.account_email,
          requests,
          summary: summarizeBoldSignRequests(requests),
          nextCursor: firstInteger(
            ...filtered.map((document) => document.nextCursor),
            asRecord(providerData.pageDetails).nextCursor,
            providerData.nextCursor,
          ),
        },
      );
    }
    case "boldsign_file_download": {
      const parsed = boldsignFileDownloadInputSchema.parse(params);
      const binding = await requireBackendSecretProviderCapabilityAccount(db, {
        profileId,
        providers: ["boldsign"],
        ...(parsed.connectedAccountId === undefined
          ? {}
          : { connectedAccountId: parsed.connectedAccountId }),
      });
      await requireOwnedBoldSignDocument(db, {
        profileId,
        binding,
        documentId: parsed.documentId,
      });
      const { body, contentType } = await boldsignApiDownloadDocument({
        documentId: parsed.documentId,
        ...(parsed.onBehalfOf === undefined ? {} : { onBehalfOf: parsed.onBehalfOf }),
        sandbox: { db, binding },
      });
      if (body.byteLength > PROVIDER_BINARY_ARTIFACT_MAX_BYTES) {
        throw new DomainError(
          domainCodes.BAD_REQUEST,
          `BoldSign document is ${body.byteLength} bytes; max allowed is ${PROVIDER_BINARY_ARTIFACT_MAX_BYTES} bytes.`,
        );
      }
      if (body.byteLength === 0) {
        throw new DomainError(
          domainCodes.CONFLICT,
          "BoldSign download returned 0 bytes; refusing to store an empty artifact.",
        );
      }
      const digest = createHash("sha256").update(body).digest("hex");
      const baseName = parsed.filename?.trim() || `boldsign-${parsed.documentId}.pdf`;
      const safeName = baseName.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 200);
      const mimeType = contentType?.split(";")[0]?.trim() || "application/pdf";
      const storageKey = `${profileId}/boldsign-files/${randomUUID()}/${safeName}`;
      await uploadStorageObject(db, { key: storageKey, body, contentType: mimeType });
      const artifact = await recordArtifact(db, {
        profileId,
        storageKey,
        filename: safeName,
        artifactType: "boldsign.file",
        mimeType,
        byteSize: body.byteLength,
        sha256: digest,
        metadata: {
          source: "boldsign_file_download",
          documentId: parsed.documentId,
          onBehalfOf: parsed.onBehalfOf ?? null,
        },
      });
      if (
        artifact.filename === null ||
        artifact.mime_type === null ||
        artifact.byte_size === null ||
        artifact.sha256 === null
      ) {
        throw new DomainError(
          domainCodes.CONFLICT,
          "BoldSign artifact metadata is incomplete after save.",
        );
      }
      return toolDataForContract(
        toolContractByName(boldsignToolContracts, "boldsign_file_download"),
        {
          provider: "boldsign",
          accountEmail: binding.account.account_email,
          profileFileId: artifact.id,
          filename: artifact.filename,
          mimeType: artifact.mime_type,
          byteSize: artifact.byte_size,
          sha256: artifact.sha256,
        },
      );
    }
    default:
      throw new DomainError(domainCodes.INTERNAL, `BoldSign read handler missing for ${toolName}.`);
  }
}
