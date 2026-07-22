import { Clock3 } from "lucide-react";

export function DecisionExpiry({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return null;
  const expiresOn = new Date(expiresAt);
  if (Number.isNaN(expiresOn.getTime())) return null;

  return (
    <p className="flex items-center gap-1.5 text-xs font-medium text-secondary">
      <Clock3 className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
      <span>
        Expires{" "}
        <time dateTime={expiresAt}>
          {expiresOn.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </time>
      </span>
    </p>
  );
}
