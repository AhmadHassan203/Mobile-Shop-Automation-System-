"use client";

import { AlertTriangleIcon, RefreshIcon } from "@/components/ui/icons";

export interface ErrorPageProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <main className="grid min-h-screen place-items-center bg-app p-4">
      <section
        className="w-full max-w-2xl overflow-hidden rounded-card border border-negative/25 bg-surface shadow-card"
        role="alert"
      >
        <div className="flex items-start gap-3 p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-negative-soft text-negative">
            <AlertTriangleIcon className="size-5" />
          </span>
          <div>
            <h1 className="text-base font-semibold text-ink">
              This screen could not be rendered
            </h1>
            <p className="mt-1 text-[0.8125rem] text-ink-subtle">
              The failure was contained. Retry the screen; if it repeats, use
              the reference below to find the corresponding server log.
            </p>
            {error.digest === undefined ? null : (
              <p className="mt-3 text-xs text-ink-muted">
                Error reference:{" "}
                <code className="font-mono">{error.digest}</code>
              </p>
            )}
            <button
              className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-control bg-accent px-3.5 py-2 text-[0.8125rem] font-semibold text-white hover:bg-accent-strong"
              onClick={reset}
              type="button"
            >
              <RefreshIcon className="size-4" /> Retry screen
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
