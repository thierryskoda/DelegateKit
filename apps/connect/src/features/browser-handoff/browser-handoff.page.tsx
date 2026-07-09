import { CheckCircle2, ExternalLink, LockKeyhole, XCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "../../shared/ui/button";
import { InlineNotice } from "../../shared/ui/inline-notice";
import { ErrorState, LoadingState } from "../../shared/ui/page-state";
import { PageHeader, Panel } from "../../shared/ui/panel";
import {
  useBrowserHandoffQuery,
  useCancelBrowserHandoffMutation,
  useCompleteBrowserHandoffMutation,
} from "./browser-handoff.queries";

function reasonLabel(
  reason: "login_required" | "mfa_required" | "captcha_required" | "user_control_requested",
): string {
  if (reason === "mfa_required") return "Finish the security check.";
  if (reason === "captcha_required") return "Complete the website check.";
  if (reason === "user_control_requested") return "Use the secure browser.";
  return "Sign in to the website.";
}

function doneMessage(status: "completed" | "cancelled" | "expired"): string {
  if (status === "completed") return "Done. You can return to the chat.";
  if (status === "cancelled") return "Cancelled. You can return to the chat.";
  return "This link expired. Ask your assistant to send a new one.";
}

export function BrowserHandoffPage({
  profileId,
  handoffId,
}: {
  profileId: string;
  handoffId: string;
}) {
  const handoffQuery = useBrowserHandoffQuery(profileId, handoffId);
  const complete = useCompleteBrowserHandoffMutation(profileId, handoffId);
  const cancel = useCancelBrowserHandoffMutation(profileId, handoffId);
  const handoff = handoffQuery.data;
  const busy = complete.isPending || cancel.isPending;
  const [opened, setOpened] = useState(false);

  function openSecureBrowser(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
    setOpened(true);
  }

  return (
    <section className="mx-auto grid min-h-[calc(100svh-8rem)] w-full max-w-2xl content-center gap-4 py-4">
      <PageHeader
        title="Secure Sign-In"
        description="Open the secure browser, finish the step, then return here."
      />
      {handoffQuery.error ? <ErrorState error={handoffQuery.error} /> : null}
      {handoffQuery.isPending && !handoffQuery.error ? (
        <LoadingState label="Loading secure sign-in" />
      ) : null}
      {handoff ? (
        <Panel className="grid gap-5 p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-secondary text-secondary">
              <LockKeyhole className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-default">{reasonLabel(handoff.reason)}</h2>
              <p className="mt-1 text-sm text-secondary">
                Do not share passwords, codes, or card details in chat.
              </p>
            </div>
          </div>
          {handoff.status === "waiting" && handoff.liveViewUrl ? (
            <div className="grid gap-4 rounded-xl border border-default bg-surface-secondary p-4">
              <div className="grid gap-1">
                <h3 className="text-sm font-semibold text-default">Secure browser</h3>
                <p className="text-sm text-secondary">
                  This opens the live website session in a separate tab. Return here when you are
                  done.
                </p>
              </div>
              <Button
                className="w-full justify-center gap-2"
                onClick={() => {
                  if (handoff.liveViewUrl) openSecureBrowser(handoff.liveViewUrl);
                }}
                type="button"
              >
                <ExternalLink className="size-4" />
                {opened ? "Open secure browser again" : "Open secure browser"}
              </Button>
              {opened ? (
                <InlineNotice tone="info">
                  Finish the website step in the browser tab, then come back and tap I&apos;m done.
                </InlineNotice>
              ) : null}
            </div>
          ) : handoff.status === "waiting" ? (
            <InlineNotice tone="warning">
              The secure view is not available. Ask your assistant to send a new link.
            </InlineNotice>
          ) : (
            <InlineNotice tone={handoff.status === "completed" ? "success" : "info"}>
              {doneMessage(handoff.status)}
            </InlineNotice>
          )}
          {handoff.status === "waiting" ? (
            <div className="sticky bottom-0 z-10 grid gap-2 border-t border-subtle bg-surface pt-4 sm:grid-cols-2">
              <Button
                className="justify-center gap-2"
                disabled={busy}
                onClick={() => complete.mutate()}
                type="button"
              >
                <CheckCircle2 className="size-4" />
                I&apos;m done
              </Button>
              <Button
                className="justify-center gap-2"
                disabled={busy}
                onClick={() => cancel.mutate()}
                type="button"
                variant="secondary"
              >
                <XCircle className="size-4" />
                Cancel
              </Button>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </section>
  );
}
