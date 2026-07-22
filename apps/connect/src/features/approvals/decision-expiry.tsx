import { Clock3 } from "lucide-react";
import { isDecisionExpiringSoon } from "./decision-urgency";

export function DecisionExpiry({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return null;
  const expiresOn = new Date(expiresAt);
  if (Number.isNaN(expiresOn.getTime())) return null;
  const expiringSoon = isDecisionExpiringSoon(expiresAt);

  return (
    <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-secondary">
      {expiringSoon ? (
        <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 font-semibold text-default">
          Expiring soon
        </span>
      ) : null}
      <span className="flex items-center gap-1.5">
        <Clock3 className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
        Expires{" "}
        <time dateTime={expiresAt}>
          {expiresOn.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </time>
      </span>
    </p>
  );
}
