import type { ReactNode } from "react";
import { cx } from "../lib/cx";

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cx(
        "motion-reveal rounded-2xl border border-default bg-surface p-4 shadow-sm md:p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "motion-state flex flex-col justify-between gap-3 md:flex-row md:items-end",
        className,
      )}
    >
      <div>
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-normal text-tertiary">{eyebrow}</p>
        ) : null}
        <h1 id={`${title.toLowerCase()}-title`} className="mt-1 heading-lg text-default">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}
