import type { TableRow } from "@ai-assistants/control-db";
import { toConnectProfileActionDto } from "@ai-assistants/connect-api-contracts";
import type { ConnectActionDto } from "@ai-assistants/connect-api-contracts";
import { connectActionDetailForProfileAction } from "./external-write-contracts/registry";

export function toConnectPortalActionDto(action: TableRow<"profile_actions">): ConnectActionDto {
  return toConnectProfileActionDto(action, connectActionDetailForProfileAction(action));
}

