import type { ReactNode } from "react";
import { cx } from "../lib/cx";

type InlineNoticeTone = "info" | "success" | "warning" | "error";

const toneClassName = {
  info: "border-info/25 bg-info/10 text-info",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  error: "border-danger/25 bg-danger/10 text-danger",
} as const satisfies Record<InlineNoticeTone, string>;

export function InlineNotice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: InlineNoticeTone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("rounded-2xl border px-4 py-3", toneClassName[tone], className)}>
      {title ? <p className="text-sm font-semibold">{title}</p> : null}
      <div className={cx("text-sm leading-6", title ? "mt-1" : undefined)}>{children}</div>
    </div>
  );
}
