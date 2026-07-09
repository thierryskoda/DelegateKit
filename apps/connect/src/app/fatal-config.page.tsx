import { AlertTriangle } from "lucide-react";

export function FatalConfigPage({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <main className="connect-canvas grid min-h-svh place-items-center p-4 text-default">
      <section className="w-full max-w-xl rounded-2xl border border-default bg-surface p-6 shadow-lg">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 size-6 shrink-0 text-danger" />
          <div className="grid gap-2">
            <p className="text-xs font-semibold uppercase text-danger">Configuration required</p>
            <h1 className="heading-lg">Connect cannot start</h1>
            <p className="text-sm leading-6 text-secondary">{message}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
