import {
  toConnectProfileActionDto,
  toConnectProfileProposalDto,
} from "@ai-assistants/connect-api-contracts";
import type { ConnectActionDto, ConnectProposalDto } from "@ai-assistants/connect-api-contracts";
import type { TableRow } from "@ai-assistants/control-db";
import { connectActionDetailForProfileAction } from "../actions/external-write-contracts/registry";
import { proposalConnectDetail } from "./proposals";

export function toConnectProposalDto(proposal: TableRow<"profile_proposals">): ConnectProposalDto {
  return toConnectProfileProposalDto(proposal, proposalConnectDetail(proposal));
}

export function toConnectProposalActionDto(action: TableRow<"profile_actions">): ConnectActionDto {
  return toConnectProfileActionDto(action, connectActionDetailForProfileAction(action));
}
