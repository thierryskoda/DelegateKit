import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { microsoftOnedriveToolContracts } from "@ai-assistants/microsoft-onedrive-contracts/contracts";
import { toolContractByName, toolData, toolDataForContract, type BackendToolResult } from "@ai-assistants/tool-contracts";
import {
  microsoftOnedriveAccountsListInputSchema,
  microsoftOnedriveDriveGetInputSchema,
  microsoftOnedriveDrivesOutputSchema,
  microsoftOnedriveDrivesListInputSchema,
  microsoftOnedriveFileSaveInputSchema,
  microsoftOnedriveFilesSearchInputSchema,
  microsoftOnedriveFolderChildrenListInputSchema,
  microsoftOnedriveGetItemInputSchema,
  microsoftOnedriveItemOutputSchema,
  microsoftOnedriveItemsOutputSchema,
  microsoftOnedrivePermissionGetInputSchema,
  microsoftOnedrivePermissionOutputSchema,
  microsoftOnedrivePermissionsOutputSchema,
  microsoftOnedrivePermissionsListInputSchema,
  microsoftOnedriveRecentItemsListInputSchema,
  microsoftOnedriveSharedItemsListInputSchema,
  microsoftOnedriveVersionsListInputSchema,
} from "@ai-assistants/microsoft-onedrive-contracts/schemas";
import { recordProviderBinaryArtifact } from "../../product/artifacts/provider-binary-artifact";
import { PROVIDER_BINARY_ARTIFACT_MAX_BYTES } from "../../product/artifacts/provider-binary-limits";
import { listProviderAccountChoices } from "../../product/connected-accounts/provider-account-choices";
import { requireMicrosoftOnedriveNango } from "./connection";
import {
  executeMicrosoftOnedriveDriveNangoProxyOperation,
  microsoftOnedriveDriveNangoProxyGetBinary,
  microsoftOnedriveDriveNangoProxyRecordSchema,
} from "../../integrations/microsoft-onedrive/drive-proxy";
import {
  normalizeMicrosoftOnedriveDriveItemDetail,
  normalizeMicrosoftOnedriveDriveItemSummary,
  normalizeMicrosoftOnedrivePermission,
} from "./normalization";

function onedriveContext(binding: { account: { account_email: string | null } }) {
  return {
    provider: "microsoft-onedrive",
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

function onedriveItemsResult(
  binding: { account: { account_email: string | null } },
  data: unknown,
) {
  const record = recordValue(data);
  return microsoftOnedriveItemsOutputSchema.parse({
    ...onedriveContext(binding),
    items: arrayValue(record.items ?? record.value ?? record.records ?? record.versions).map(
      normalizeMicrosoftOnedriveDriveItemSummary,
    ),
    nextCursor: stringValue(record.nextLink) ?? stringValue(record["@odata.nextLink"]),
  });
}

function requireOnedriveFileName(fileName: string | null, itemId: string): string {
  if (fileName) return fileName;
  throw new DomainError(
    domainCodes.INTERNAL,
    `OneDrive metadata for item ${itemId} did not include a file name.`,
  );
}

async function listMicrosoftOnedriveAccounts(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<BackendToolResult> {
  return toolDataForContract(
    toolContractByName(microsoftOnedriveToolContracts, "microsoft_onedrive_accounts_list"),
    {
      accounts: await listProviderAccountChoices(db, {
        profileId,
        capabilitySlug: "microsoft-onedrive",
        provider: "microsoft-onedrive",
        label: "List microsoft-onedrive capability instances",
      }),
    },
  );
}

export async function executeMicrosoftOnedriveReadAndArtifactTool(
  db: SupabaseServiceClient,
  profileId: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<BackendToolResult> {
  switch (toolName) {
    case "microsoft_onedrive_accounts_list":
      microsoftOnedriveAccountsListInputSchema.parse(params);
      return listMicrosoftOnedriveAccounts(db, profileId);
    case "microsoft_onedrive_drives_list": {
      const p = microsoftOnedriveDrivesListInputSchema.parse(params);
      const b = await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeMicrosoftOnedriveDriveNangoProxyOperation(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        "list-drives",
        microsoftOnedriveDriveNangoProxyRecordSchema,
        {},
        sandbox,
      );
      const record = recordValue(data);
      return toolData(
        microsoftOnedriveDrivesOutputSchema.parse({
          ...onedriveContext(b),
          drives: arrayValue(record.drives ?? record.value).map(
            normalizeMicrosoftOnedriveDriveItemSummary,
          ),
          nextCursor: stringValue(record.nextLink) ?? stringValue(record["@odata.nextLink"]),
        }),
      );
    }
    case "microsoft_onedrive_drive_get": {
      const p = microsoftOnedriveDriveGetInputSchema.parse(params);
      const b = await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeMicrosoftOnedriveDriveNangoProxyOperation(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        "get-drive",
        microsoftOnedriveDriveNangoProxyRecordSchema,
        {},
        sandbox,
      );
      return toolData(
        microsoftOnedriveItemOutputSchema.parse({
          ...onedriveContext(b),
          item: normalizeMicrosoftOnedriveDriveItemDetail(data),
        }),
      );
    }
    case "microsoft_onedrive_folder_children_list": {
      const p = microsoftOnedriveFolderChildrenListInputSchema.parse(params);
      const b = await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const itemId = p.itemId?.trim() || "root";
      const data = await executeMicrosoftOnedriveDriveNangoProxyOperation(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        "list-children",
        microsoftOnedriveDriveNangoProxyRecordSchema,
        {
          itemId,
        },
        sandbox,
      );
      return toolData(onedriveItemsResult(b, data));
    }
    case "microsoft_onedrive_recent_items_list": {
      const p = microsoftOnedriveRecentItemsListInputSchema.parse(params);
      const b = await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeMicrosoftOnedriveDriveNangoProxyOperation(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        "list-recent-items",
        microsoftOnedriveDriveNangoProxyRecordSchema,
        {},
        sandbox,
      );
      return toolData(onedriveItemsResult(b, data));
    }
    case "microsoft_onedrive_files_search": {
      const p = microsoftOnedriveFilesSearchInputSchema.parse(params);
      const b = await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeMicrosoftOnedriveDriveNangoProxyOperation(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        "search-items",
        microsoftOnedriveDriveNangoProxyRecordSchema,
        {
          query: p.query,
        },
        sandbox,
      );
      return toolData(onedriveItemsResult(b, data));
    }
    case "microsoft_onedrive_shared_items_list": {
      const p = microsoftOnedriveSharedItemsListInputSchema.parse(params);
      const b = await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeMicrosoftOnedriveDriveNangoProxyOperation(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        "list-shared-items",
        microsoftOnedriveDriveNangoProxyRecordSchema,
        {},
        sandbox,
      );
      return toolData(onedriveItemsResult(b, data));
    }
    case "microsoft_onedrive_item_get": {
      const p = microsoftOnedriveGetItemInputSchema.parse(params);
      const b = await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const payload: Record<string, unknown> = {};
      if (p.itemId?.trim()) payload.itemId = p.itemId.trim();
      if (p.itemPath?.trim()) payload.path = p.itemPath.trim();
      const data = await executeMicrosoftOnedriveDriveNangoProxyOperation(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        "get-item",
        microsoftOnedriveDriveNangoProxyRecordSchema,
        payload,
        sandbox,
      );
      return toolData(
        microsoftOnedriveItemOutputSchema.parse({
          ...onedriveContext(b),
          item: normalizeMicrosoftOnedriveDriveItemDetail(data),
        }),
      );
    }
    case "microsoft_onedrive_versions_list": {
      const p = microsoftOnedriveVersionsListInputSchema.parse(params);
      const b = await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeMicrosoftOnedriveDriveNangoProxyOperation(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        "list-versions",
        microsoftOnedriveDriveNangoProxyRecordSchema,
        {
          itemId: p.itemId,
        },
        sandbox,
      );
      return toolData(onedriveItemsResult(b, data));
    }
    case "microsoft_onedrive_permissions_list": {
      const p = microsoftOnedrivePermissionsListInputSchema.parse(params);
      const b = await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeMicrosoftOnedriveDriveNangoProxyOperation(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        "list-permissions",
        microsoftOnedriveDriveNangoProxyRecordSchema,
        {
          itemId: p.itemId,
        },
        sandbox,
      );
      const record = recordValue(data);
      return toolData(
        microsoftOnedrivePermissionsOutputSchema.parse({
          ...onedriveContext(b),
          permissions: arrayValue(record.permissions ?? record.value).map(
            normalizeMicrosoftOnedrivePermission,
          ),
          nextCursor: stringValue(record.nextLink) ?? stringValue(record["@odata.nextLink"]),
        }),
      );
    }
    case "microsoft_onedrive_permission_get": {
      const p = microsoftOnedrivePermissionGetInputSchema.parse(params);
      const b = await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeMicrosoftOnedriveDriveNangoProxyOperation(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        "get-permission",
        microsoftOnedriveDriveNangoProxyRecordSchema,
        {
          itemId: p.itemId,
          permissionId: p.permissionId,
        },
        sandbox,
      );
      return toolData(
        microsoftOnedrivePermissionOutputSchema.parse({
          ...onedriveContext(b),
          permission: normalizeMicrosoftOnedrivePermission(data),
        }),
      );
    }
    case "microsoft_onedrive_file_save": {
      const p = microsoftOnedriveFileSaveInputSchema.parse(params);
      const b = await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const key = b.nangoProviderConfigKey;
      const cid = b.nangoConnectionId;
      const itemMetadata = await executeMicrosoftOnedriveDriveNangoProxyOperation(
        key,
        cid,
        "get-item",
        microsoftOnedriveDriveNangoProxyRecordSchema,
        {
          itemId: p.itemId,
        },
        sandbox,
      );
      const item = normalizeMicrosoftOnedriveDriveItemDetail(itemMetadata);
      if (item.type !== "file") {
        throw new DomainError(
          domainCodes.BAD_REQUEST,
          `OneDrive item "${item.name ?? p.itemId}" is ${item.type}; only files can be saved as artifacts.`,
        );
      }
      const itemName = requireOnedriveFileName(item.name, p.itemId);
      const { body, contentType } = await microsoftOnedriveDriveNangoProxyGetBinary(key, cid, {
        endpoint: `/v1.0/me/drive/items/${encodeURIComponent(p.itemId)}/content`,
      }, sandbox);
      if (body.byteLength > PROVIDER_BINARY_ARTIFACT_MAX_BYTES) {
        throw new DomainError(
          domainCodes.BAD_REQUEST,
          `OneDrive file is ${body.byteLength} bytes; max allowed is ${PROVIDER_BINARY_ARTIFACT_MAX_BYTES} bytes.`,
        );
      }
      const baseName = p.filename?.trim() || itemName;
      const artifact = await recordProviderBinaryArtifact(db, {
        profileId,
        body,
        contentType: contentType ?? item.mimeType,
        filename: baseName,
        storagePrefix: "microsoft-onedrive-files",
        artifactType: "microsoft.onedrive.file",
        metadata: {
          source: "microsoft_onedrive_file_save",
          itemId: p.itemId,
          sourceName: itemName,
          sourceMimeType: item.mimeType,
        },
        incompleteMetadataMessage: "OneDrive artifact metadata is incomplete after save.",
      });
      return toolDataForContract(
        toolContractByName(microsoftOnedriveToolContracts, "microsoft_onedrive_file_save"),
        {
          provider: "microsoft-onedrive",
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
        `Microsoft Graph drive read/artifact handler missing for ${toolName}.`,
      );
  }
}
