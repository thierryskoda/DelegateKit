import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { profileProposalKindSchema } from "@ai-assistants/control-plane-contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { ConnectActionDetailDto } from "@ai-assistants/connect-api-contracts";
import type { z } from "zod";
import {
  gmailEmailFollowUpProposalKind,
  outlookMailEmailFollowUpProposalKind,
} from "./email-follow-up-proposal";

export type ProposalKind = z.infer<typeof profileProposalKindSchema>;

type ProposalRevalidationResult =
  | {
      ok: true;
      actionPayload: object;
      requestHash: string;
      reviewPayload: Record<string, unknown>;
    }
  | { ok: false; blockerCode: string; blockerSummary: string };

type ProposalActionIntent = {
  toolName: string;
  actionType: string;
  targetId?: string | null;
  toolCallId?: string | null;
  requestHash: string;
  equivalentActionKey?: string | null;
  executionPayload: object;
  title: string;
  reviewPayload: Record<string, unknown>;
};

export type ProposalKindContract<TPayload> = {
  kind: ProposalKind;
  payloadSchema: z.ZodType<TPayload>;
  evidenceSchema: z.ZodType<Record<string, unknown>>;
  buildEquivalenceKey: (payload: TPayload) => string;
  buildReviewDetail: (
    proposal: TableRow<"profile_proposals">,
    payload: TPayload,
  ) => ConnectActionDetailDto;
  revalidate: (
    db: SupabaseServiceClient,
    proposal: TableRow<"profile_proposals">,
    payload: TPayload,
  ) => Promise<ProposalRevalidationResult>;
  convertToProfileAction: (input: {
    proposal: TableRow<"profile_proposals">;
    payload: TPayload;
    validation: Extract<ProposalRevalidationResult, { ok: true }>;
  }) => ProposalActionIntent;
};

type ProposalKindRegistryShape = {
  [K in ProposalKind]: { kind: K };
};

type ValidateProposalKindContracts<TRegistry extends ProposalKindRegistryShape> = {
  [K in keyof TRegistry]: TRegistry[K] extends ProposalKindContract<infer _TPayload> & {
    kind: K;
  }
    ? TRegistry[K]
    : never;
};

function defineProposalKindRegistry<const TRegistry extends ProposalKindRegistryShape>(
  registry: TRegistry & ValidateProposalKindContracts<TRegistry>,
): TRegistry & ValidateProposalKindContracts<TRegistry> {
  return registry;
}

const proposalKindRegistry = defineProposalKindRegistry({
  "gmail.email.follow_up": gmailEmailFollowUpProposalKind,
  "outlook_mail.email.follow_up": outlookMailEmailFollowUpProposalKind,
});

export function requireProposalKindContract(kind: string): ProposalKindContract<unknown> {
  const parsedKind = profileProposalKindSchema.parse(kind);
  const contract = proposalKindRegistry[parsedKind] as ProposalKindContract<unknown> | undefined;
  if (!contract) {
    throw new DomainError(domainCodes.BAD_REQUEST, `Unsupported proposal kind ${kind}.`);
  }
  return contract;
}
