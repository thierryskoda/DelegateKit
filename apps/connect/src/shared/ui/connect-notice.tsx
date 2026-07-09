import { X } from "lucide-react";
import { cx } from "../lib/cx";
import { Button } from "./button";
import { useConnectUiStore } from "./connect.store";

const noticeClassName = {
  success: "border-success/25 bg-success/10 text-success",
  error: "border-danger/25 bg-danger/10 text-danger",
  info: "border-info/25 bg-info/10 text-info",
} as const;

export function ConnectNotice() {
  const notice = useConnectUiStore((state) => state.notice);
  const clearNotice = useConnectUiStore((state) => state.clearNotice);
  if (!notice) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-4">
      <div
        role={notice.tone === "error" ? "alert" : "status"}
        aria-live={notice.tone === "error" ? "assertive" : "polite"}
        className={cx(
          "pointer-events-auto flex w-full max-w-xl items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-lg",
          noticeClassName[notice.tone],
        )}
      >
        <p className="text-sm font-semibold">{notice.message}</p>
        <Button
          aria-label="Dismiss notice"
          size="icon"
          title="Dismiss notice"
          variant="ghost"
          onClick={clearNotice}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
