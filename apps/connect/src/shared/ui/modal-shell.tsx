import { X } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "../lib/cx";
import { Button } from "./button";

export function ModalShell({
  title,
  description,
  labelledBy,
  maxWidth = "md",
  children,
  onClose,
}: {
  title: string;
  description?: ReactNode;
  labelledBy?: string;
  maxWidth?: "md" | "xl";
  children: ReactNode;
  onClose: () => void;
}) {
  const titleId = labelledBy ?? "connect-modal-title";
  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-end bg-[oklch(0.22_0.02_255/0.38)] p-3 sm:place-items-center sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          "motion-reveal max-h-[min(720px,calc(100svh-2rem))] w-full overflow-y-auto rounded-3xl border border-default bg-surface p-5 shadow-2xl md:p-6",
          maxWidth === "xl" ? "max-w-xl" : "max-w-md",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-1">
              <h2 id={titleId} className="text-xl font-semibold leading-tight text-default">
                {title}
              </h2>
              {description ? <div className="text-sm text-secondary">{description}</div> : null}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
