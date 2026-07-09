import { AlertTriangle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { userFacingErrorMessage } from "./error-message";

export function LoadingState({ label = "Loading portal data" }: { label?: string }) {
  return (
    <div className="motion-state grid min-h-56 place-items-center rounded-2xl border border-subtle bg-surface p-8 text-secondary">
      <div className="flex items-center gap-3 text-sm font-medium">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function ErrorState({
  title = "Something needs attention",
  error,
}: {
  title?: string;
  error: unknown;
}) {
  const message = userFacingErrorMessage(error);
  return (
    <div className="motion-state rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-danger">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6">{message}</p>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="motion-state rounded-2xl border border-dashed border-default bg-surface p-8 text-center">
      <div className="mx-auto grid size-9 place-items-center rounded-full bg-surface-secondary text-secondary">
        <AlertTriangle className="size-4" />
      </div>
      <h2 className="mt-3 text-sm font-semibold text-default">{title}</h2>
      {children ? <div className="mt-1 text-sm leading-6 text-secondary">{children}</div> : null}
    </div>
  );
}
