import { Check, MailPlus, Settings2, X } from "lucide-react";
import { useMemo } from "react";
import { useApprovalsUiStore } from "./approvals.store";
import type { ConnectActionDetailDto } from "@ai-assistants/connect-api-contracts";
import { Button, TextLink } from "../../shared/ui/button";
import { ModalShell } from "../../shared/ui/modal-shell";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/page-state";
import { PageHeader } from "../../shared/ui/panel";
import {
  useApprovalDecisionMutation,
  useApprovalsQuery,
  useLearningRecommendationDecisionMutation,
  useLearningRecommendationsQuery,
  useProposalDecisionMutation,
  useProposalsQuery,
} from "./approvals.queries";
import type {
  ApprovalRequest,
  LearningRecommendationRequest,
  ProposalRequest,
} from "./approvals.api";
import { DecisionExpiry } from "./decision-expiry";

type DetailPreview = NonNullable<ConnectActionDetailDto["preview"]>;
type PendingDecisionItem =
  | {
      kind: "action";
      id: string;
      priority: 0;
      label: "Needs approval";
      title: string;
      detail: ConnectActionDetailDto;
      action: ApprovalRequest;
    }
  | {
      kind: "proposal";
      id: string;
      priority: 1;
      label: "Follow-up email";
      title: string;
      summary: string;
      detail: ConnectActionDetailDto;
      proposal: ProposalRequest;
    }
  | {
      kind: "learningRecommendation";
      id: string;
      priority: 2;
      label: "Improve next time";
      title: string;
      summary: string;
      rationale: string;
      createdAt: string;
      detail: ConnectActionDetailDto;
      recommendation: LearningRecommendationRequest;
    };

function tryFormatValue(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) && !isNaN(Date.parse(value))) {
    try {
      const date = new Date(value);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return value;
    }
  }
  return value;
}

function DetailModal({ detail, onClose }: { detail: ConnectActionDetailDto; onClose: () => void }) {
  const preview = detail.preview;
  if (!preview) return null;
  return (
    <ModalShell title={preview.label} maxWidth="xl" onClose={onClose}>
      <DetailPreview preview={preview} />
    </ModalShell>
  );
}

function DetailPreview({ preview }: { preview: DetailPreview }) {
  return (
    <div className="grid gap-6">
      {preview.sections.map((section) => (
        <section key={section.title} className="grid gap-3.5">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted">
            {section.title}
          </h3>
          {section.fields.length ? (
            <dl className="grid gap-3 rounded-2xl border border-default bg-surface-secondary/40 px-4 py-3.5">
              {section.fields.map((field) => (
                <div
                  key={`${field.label}-${field.value}`}
                  className="flex flex-col py-0 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-muted sm:w-28 shrink-0">
                    {field.label}
                  </dt>
                  <dd className="mt-0.5 break-words text-sm font-medium text-default sm:mt-0 flex-1">
                    {tryFormatValue(field.value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {section.body ? (
            <div className="grid gap-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                {section.body.label}
              </p>
              <div className="whitespace-pre-wrap break-words rounded-2xl border border-default bg-surface p-5 text-sm leading-relaxed text-default shadow-xs font-sans">
                {section.body.value}
              </div>
            </div>
          ) : null}
          {section.changes.length ? (
            <dl className="grid gap-3 rounded-2xl border border-default bg-surface-secondary/40 px-4 py-3.5">
              {section.changes.map((change) => (
                <div
                  key={change.label}
                  className="flex flex-col py-0 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-muted sm:w-28 shrink-0">
                    {change.label}
                  </dt>
                  <dd className="mt-0.5 break-words text-sm font-medium text-default sm:mt-0 flex-1">
                    {change.before ? (
                      <span className="line-through text-muted mr-2">
                        {tryFormatValue(change.before)}
                      </span>
                    ) : null}
                    {change.before ? <span className="text-muted mr-2">→</span> : null}
                    <span className="font-semibold text-default">
                      {tryFormatValue(change.after ?? "")}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function sortPendingDecisions(items: PendingDecisionItem[]): PendingDecisionItem[] {
  return [...items].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if ("createdAt" in a && "createdAt" in b) {
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    }
    return a.title.localeCompare(b.title);
  });
}

function decisionItemsFromPendingRows({
  actions,
  proposals,
  learningRecommendations,
}: {
  actions: ApprovalRequest[];
  proposals: ProposalRequest[];
  learningRecommendations: LearningRecommendationRequest[];
}): PendingDecisionItem[] {
  return sortPendingDecisions([
    ...actions.map(
      (action): PendingDecisionItem => ({
        kind: "action",
        id: action.id,
        priority: 0,
        label: "Needs approval",
        title: action.detail.headline,
        detail: action.detail,
        action,
      }),
    ),
    ...proposals.map(
      (proposal): PendingDecisionItem => ({
        kind: "proposal",
        id: proposal.id,
        priority: 1,
        label: "Follow-up email",
        title: proposal.title,
        summary: proposal.summary,
        detail: proposal.detail,
        proposal,
      }),
    ),
    ...learningRecommendations.map(
      (recommendation): PendingDecisionItem => ({
        kind: "learningRecommendation",
        id: recommendation.id,
        priority: 2,
        label: "Improve next time",
        title: recommendation.title,
        summary: recommendation.summary,
        rationale: recommendation.rationale,
        createdAt: recommendation.createdAt,
        detail: recommendation.detail,
        recommendation,
      }),
    ),
  ]);
}

function ApprovalCard({
  item,
  busy,
  onDecide,
}: {
  item: Extract<PendingDecisionItem, { kind: "action" }>;
  busy: boolean;
  onDecide: (decision: "approve" | "reject") => void;
}) {
  const setOpenDetailActionId = useApprovalsUiStore((state) => state.setOpenDetailActionId);
  return (
    <article className="motion-reveal rounded-2xl border border-default bg-surface p-4 shadow-sm sm:p-5">
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-tertiary">
            {item.label}
          </p>
          <h3 className="break-words text-sm font-semibold leading-snug text-default sm:text-base">
            {item.title}
          </h3>
          <DecisionExpiry expiresAt={item.action.expiresAt} />
        </div>

        {item.detail.preview ? (
          <div>
            <TextLink className="min-h-0 text-sm" onClick={() => setOpenDetailActionId(item.id)}>
              {item.detail.preview.label}
            </TextLink>
          </div>
        ) : null}

        <div className="motion-state flex flex-col-reverse items-center justify-end gap-2 border-t border-subtle pt-3 sm:flex-row">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => onDecide("reject")}
            aria-label="Reject"
            className="w-full shrink-0 sm:w-auto"
          >
            <X className="size-3.5" />
            Reject
          </Button>
          <Button
            disabled={busy}
            size="sm"
            onClick={() => onDecide("approve")}
            aria-label="Approve"
            className="w-full shrink-0 sm:w-auto"
          >
            <Check className="size-3.5" />
            Approve
          </Button>
        </div>
      </div>
    </article>
  );
}

function ProposalCard({
  item,
  busy,
  onDecide,
}: {
  item: Extract<PendingDecisionItem, { kind: "proposal" }>;
  busy: boolean;
  onDecide: (decision: "approve" | "reject") => void;
}) {
  const setOpenDetailProposalId = useApprovalsUiStore((state) => state.setOpenDetailProposalId);
  return (
    <article className="motion-reveal rounded-2xl border border-default bg-surface p-4 shadow-sm sm:p-5">
      <div className="grid gap-3">
        <div className="grid gap-2">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-tertiary">
            <MailPlus className="size-3.5" />
            {item.label}
          </p>

          <div className="grid gap-1">
            <h3 className="break-words text-sm font-semibold leading-snug text-default sm:text-base">
              {item.title}
            </h3>
            <p className="break-words text-sm leading-relaxed text-secondary">{item.summary}</p>
            <DecisionExpiry expiresAt={item.proposal.expiresAt} />
          </div>

          {item.proposal.blockerSummary ? (
            <p className="break-words text-sm leading-relaxed text-secondary">
              <span className="font-medium text-default">Why:</span> {item.proposal.blockerSummary}
            </p>
          ) : null}
        </div>

        {item.detail.preview ? (
          <div>
            <TextLink className="min-h-0 text-sm" onClick={() => setOpenDetailProposalId(item.id)}>
              {item.detail.preview.label}
            </TextLink>
          </div>
        ) : null}

        <div className="motion-state flex flex-col-reverse items-center justify-end gap-2 border-t border-subtle pt-3 sm:flex-row">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => onDecide("reject")}
            aria-label="Reject"
            className="w-full shrink-0 sm:w-auto"
          >
            <X className="size-3.5" />
            Reject
          </Button>
          <Button
            disabled={busy}
            size="sm"
            onClick={() => onDecide("approve")}
            aria-label="Approve and send"
            className="w-full shrink-0 sm:w-auto"
          >
            <Check className="size-3.5" />
            Approve and send
          </Button>
        </div>
      </div>
    </article>
  );
}

function LearningRecommendationCard({
  item,
  busy,
  onDecide,
}: {
  item: Extract<PendingDecisionItem, { kind: "learningRecommendation" }>;
  busy: boolean;
  onDecide: (decision: "approve" | "reject") => void;
}) {
  const setOpenDetailLearningRecommendationId = useApprovalsUiStore(
    (state) => state.setOpenDetailLearningRecommendationId,
  );
  return (
    <article className="motion-reveal rounded-2xl border border-default bg-surface p-4 shadow-sm sm:p-5">
      <div className="grid gap-3">
        <div className="grid gap-2">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-tertiary">
            <Settings2 className="size-3.5" />
            {item.label}
          </p>

          <div className="grid gap-1">
            <h3 className="break-words text-sm font-semibold leading-snug text-default sm:text-base">
              {item.title}
            </h3>
            <p className="break-words text-sm leading-relaxed text-secondary">{item.summary}</p>
          </div>

          <p className="break-words text-sm leading-relaxed text-secondary">
            <span className="font-medium text-default">Why:</span> {item.rationale}
          </p>
        </div>

        {item.detail.preview ? (
          <div>
            <TextLink
              className="min-h-0 text-sm"
              onClick={() => setOpenDetailLearningRecommendationId(item.id)}
            >
              {item.detail.preview.label}
            </TextLink>
          </div>
        ) : null}

        <div className="motion-state flex flex-col-reverse items-center justify-end gap-2 border-t border-subtle pt-3 sm:flex-row">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => onDecide("reject")}
            aria-label="Skip improvement"
            className="w-full shrink-0 sm:w-auto"
          >
            <X className="size-3.5" />
            Skip
          </Button>
          <Button
            disabled={busy}
            size="sm"
            onClick={() => onDecide("approve")}
            aria-label="Save improvement"
            className="w-full shrink-0 sm:w-auto"
          >
            <Check className="size-3.5" />
            Save improvement
          </Button>
        </div>
      </div>
    </article>
  );
}

export function ApprovalsPage({ profileId }: { profileId: string }) {
  const approvalsQuery = useApprovalsQuery(profileId);
  const proposalsQuery = useProposalsQuery(profileId);
  const learningRecommendationsQuery = useLearningRecommendationsQuery(profileId);
  const decision = useApprovalDecisionMutation(profileId);
  const proposalDecision = useProposalDecisionMutation(profileId);
  const learningRecommendationDecision = useLearningRecommendationDecisionMutation(profileId);
  const openDetailActionId = useApprovalsUiStore((state) => state.openDetailActionId);
  const openDetailProposalId = useApprovalsUiStore((state) => state.openDetailProposalId);
  const openDetailLearningRecommendationId = useApprovalsUiStore(
    (state) => state.openDetailLearningRecommendationId,
  );
  const setOpenDetailActionId = useApprovalsUiStore((state) => state.setOpenDetailActionId);
  const setOpenDetailProposalId = useApprovalsUiStore((state) => state.setOpenDetailProposalId);
  const setOpenDetailLearningRecommendationId = useApprovalsUiStore(
    (state) => state.setOpenDetailLearningRecommendationId,
  );
  const approvals = approvalsQuery.data ?? [];
  const proposals = proposalsQuery.data ?? [];
  const learningRecommendations = learningRecommendationsQuery.data ?? [];
  const pendingApprovals = useMemo(
    () => approvals.filter((action) => action.status === "pending_approval"),
    [approvals],
  );
  const pendingProposals = useMemo(
    () => proposals.filter((proposal) => proposal.status === "proposed"),
    [proposals],
  );
  const pendingLearningRecommendations = useMemo(
    () => learningRecommendations.filter((recommendation) => recommendation.status === "proposed"),
    [learningRecommendations],
  );
  const pendingItems = useMemo(
    () =>
      decisionItemsFromPendingRows({
        actions: pendingApprovals,
        proposals: pendingProposals,
        learningRecommendations: pendingLearningRecommendations,
      }),
    [pendingApprovals, pendingProposals, pendingLearningRecommendations],
  );
  const openDetailAction = useMemo(
    () => approvals.find((action) => action.id === openDetailActionId) ?? null,
    [approvals, openDetailActionId],
  );
  const openDetailProposal = useMemo(
    () => proposals.find((proposal) => proposal.id === openDetailProposalId) ?? null,
    [proposals, openDetailProposalId],
  );
  const openDetailLearningRecommendation = useMemo(
    () =>
      learningRecommendations.find(
        (recommendation) => recommendation.id === openDetailLearningRecommendationId,
      ) ?? null,
    [learningRecommendations, openDetailLearningRecommendationId],
  );

  function decide(action: ApprovalRequest, nextDecision: "approve" | "reject"): void {
    decision.mutate({
      actionId: action.id,
      decision: nextDecision,
    });
  }

  function decideProposalCard(proposal: ProposalRequest, nextDecision: "approve" | "reject"): void {
    proposalDecision.mutate({
      proposalId: proposal.id,
      decision: nextDecision,
      expectedRevision: proposal.revision,
    });
  }

  function decideLearningRecommendationCard(
    recommendation: LearningRecommendationRequest,
    nextDecision: "approve" | "reject",
  ): void {
    learningRecommendationDecision.mutate({
      recommendationId: recommendation.id,
      decision: nextDecision,
    });
  }

  const awaitingData =
    approvalsQuery.isPending || proposalsQuery.isPending || learningRecommendationsQuery.isPending;
  const error = approvalsQuery.error ?? proposalsQuery.error ?? learningRecommendationsQuery.error;

  return (
    <section className="grid gap-4">
      <PageHeader
        description="Review anything that needs your decision before your assistant acts."
        title="Approvals"
      />
      {error ? <ErrorState error={error} /> : null}
      {awaitingData && !error ? <LoadingState label="Loading approvals" /> : null}
      {!awaitingData && !error && pendingItems.length === 0 ? (
        <EmptyState title="No approvals needed.">
          Anything that needs your decision will appear here.
        </EmptyState>
      ) : null}
      {pendingItems.length ? (
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold text-default">Pending decisions</h2>
          {pendingItems.map((item) => {
            if (item.kind === "action") {
              return (
                <ApprovalCard
                  key={`${item.kind}-${item.id}`}
                  item={item}
                  busy={decision.isPending && decision.variables?.actionId === item.id}
                  onDecide={(nextDecision) => decide(item.action, nextDecision)}
                />
              );
            }
            if (item.kind === "proposal") {
              return (
                <ProposalCard
                  key={`${item.kind}-${item.id}`}
                  item={item}
                  busy={
                    proposalDecision.isPending && proposalDecision.variables?.proposalId === item.id
                  }
                  onDecide={(nextDecision) => decideProposalCard(item.proposal, nextDecision)}
                />
              );
            }
            return (
              <LearningRecommendationCard
                key={`${item.kind}-${item.id}`}
                item={item}
                busy={
                  learningRecommendationDecision.isPending &&
                  learningRecommendationDecision.variables?.recommendationId === item.id
                }
                onDecide={(nextDecision) =>
                  decideLearningRecommendationCard(item.recommendation, nextDecision)
                }
              />
            );
          })}
        </section>
      ) : null}
      {openDetailAction ? (
        <DetailModal detail={openDetailAction.detail} onClose={() => setOpenDetailActionId(null)} />
      ) : null}
      {openDetailProposal ? (
        <DetailModal
          detail={openDetailProposal.detail}
          onClose={() => setOpenDetailProposalId(null)}
        />
      ) : null}
      {openDetailLearningRecommendation ? (
        <DetailModal
          detail={openDetailLearningRecommendation.detail}
          onClose={() => setOpenDetailLearningRecommendationId(null)}
        />
      ) : null}
    </section>
  );
}
