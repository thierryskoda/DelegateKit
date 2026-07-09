import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { microsoftSharepointToolContracts } from "@ai-assistants/microsoft-sharepoint-contracts/contracts";
import {
  microsoftSharepointAccountsListInputSchema,
  microsoftSharepointFileFetchInputSchema,
  microsoftSharepointFileOutputSchema,
  microsoftSharepointFileSaveInputSchema,
  microsoftSharepointSitesOutputSchema,
  microsoftSharepointSharedSitesListInputSchema,
} from "@ai-assistants/microsoft-sharepoint-contracts/schemas";
import {
  toolContractByName,
  toolData,
  toolDataForContract,
  type BackendToolResult,
} from "@ai-assistants/tool-contracts";
import { recordProviderBinaryArtifact } from "../../product/artifacts/provider-binary-artifact";
import { PROVIDER_BINARY_ARTIFACT_MAX_BYTES } from "../../product/artifacts/provider-binary-limits";
import { listProviderAccountChoices } from "../../product/connected-accounts/provider-account-choices";
import {
  executeMicrosoftSharepointDriveNangoProxyOperation,
  microsoftSharepointDriveNangoProxyGetBinary,
  microsoftSharepointDriveNangoProxyRecordSchema,
} from "../../integrations/microsoft-sharepoint/drive-proxy";
import { requireMicrosoftSharepointNango } from "./connection";
import {
  normalizeMicrosoftSharepointDriveItemDetail,
  normalizeMicrosoftSharepointSiteSummary,
} from "./normalization";

function sharepointContext(binding: { account: { account_email: string | null } }) {
  return {
    provider: "microsoft-sharepoint",
    accountEmail: binding.account.account_email,
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(recordValue) : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function listMicrosoftSharepointAccounts(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<BackendToolResult> {
  return toolDataForContract(
    toolContractByName(microsoftSharepointToolContracts, "microsoft_sharepoint_accounts_list"),
    {
      accounts: await listProviderAccountChoices(db, {
        profileId,
        capabilitySlug: "microsoft-sharepoint",
        provider: "microsoft-sharepoint",
        label: "List microsoft-sharepoint capability instances",
      }),
    },
  );
}

export async function executeMicrosoftSharepointReadAndArtifactTool(
  db: SupabaseServiceClient,
  profileId: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<BackendToolResult> {
  switch (toolName) {
    case "microsoft_sharepoint_accounts_list":
      microsoftSharepointAccountsListInputSchema.parse(params);
      return listMicrosoftSharepointAccounts(db, profileId);
    case "microsoft_sharepoint_shared_sites_list": {
      const p = microsoftSharepointSharedSitesListInputSchema.parse(params);
      const b = await requireMicrosoftSharepointNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeMicrosoftSharepointDriveNangoProxyOperation(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        "list-shared-sites",
        microsoftSharepointDriveNangoProxyRecordSchema,
        {},
        sandbox,
      );
      const record = recordValue(data);
      return toolData(
        microsoftSharepointSitesOutputSchema.parse({
          accountEmail: b.account.account_email,
          sites: arrayValue(record.sites ?? record.value ?? record.records).map(
            normalizeMicrosoftSharepointSiteSummary,
          ),
          nextCursor: stringValue(record.nextLink) ?? stringValue(record["@odata.nextLink"]),
        }),
      );
    }
    case "microsoft_sharepoint_file_fetch": {
      const p = microsoftSharepointFileFetchInputSchema.parse(params);
      const b = await requireMicrosoftSharepointNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeMicrosoftSharepointDriveNangoProxyOperation(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        "fetch-file",
        microsoftSharepointDriveNangoProxyRecordSchema,
        {
          siteId: p.siteId,
          itemId: p.itemId,
        },
        sandbox,
      );
      return toolData(
        microsoftSharepointFileOutputSchema.parse({
          ...sharepointContext(b),
          file: normalizeMicrosoftSharepointDriveItemDetail(data),
        }),
      );
    }
    case "microsoft_sharepoint_file_save": {
      const p = microsoftSharepointFileSaveInputSchema.parse(params);
      const b = await requireMicrosoftSharepointNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const { body, contentType } = await microsoftSharepointDriveNangoProxyGetBinary(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        {
          endpoint: `/v1.0/sites/${encodeURIComponent(p.siteId)}/drive/items/${encodeURIComponent(p.itemId)}/content`,
        },
        sandbox,
      );
      if (body.byteLength > PROVIDER_BINARY_ARTIFACT_MAX_BYTES) {
        throw new DomainError(
          domainCodes.BAD_REQUEST,
          `SharePoint file is ${body.byteLength} bytes; max allowed is ${PROVIDER_BINARY_ARTIFACT_MAX_BYTES} bytes.`,
        );
      }
      const artifact = await recordProviderBinaryArtifact(db, {
        profileId,
        body,
        contentType,
        filename: p.filename?.trim() || `sharepoint-${p.siteId}-${p.itemId}`,
        storagePrefix: "microsoft-sharepoint-files",
        artifactType: "microsoft.sharepoint.file",
        metadata: {
          source: "microsoft_sharepoint_file_save",
          siteId: p.siteId,
          itemId: p.itemId,
        },
        incompleteMetadataMessage: "SharePoint artifact metadata is incomplete after save.",
      });
      return toolDataForContract(
        toolContractByName(microsoftSharepointToolContracts, "microsoft_sharepoint_file_save"),
        {
          provider: "microsoft-sharepoint",
          accountEmail: b.account.account_email,
          profileFileId: artifact.artifactId,
          filename: artifact.filename,
          mimeType: artifact.mimeType,
          byteSize: artifact.byteSize,
          sha256: artifact.sha256,
        },
      );
    }
    default:
      throw new DomainError(
        domainCodes.INTERNAL,
        `Microsoft SharePoint read/artifact handler missing for ${toolName}.`,
      );
  }
}
