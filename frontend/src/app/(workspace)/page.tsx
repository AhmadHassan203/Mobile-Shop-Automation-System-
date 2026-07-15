import { ShieldCheckIcon } from "@/components/ui/icons";
import { ServiceStatus } from "@/components/system-status/service-status";
import { CurrentAuthPanel } from "@/components/auth/current-auth-panel";
import { getApiBaseUrl } from "@/lib/env";

export default function SystemStatusPage() {
  const apiBaseUrl = getApiBaseUrl();

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-start gap-4">
        <div>
          <p className="mb-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.09em] text-accent">
            Slice 0 · Foundation
          </p>
          <h1 className="text-[1.375rem] font-semibold tracking-[-0.01em] text-ink">
            System readiness
          </h1>
          <p className="mt-1 max-w-2xl text-[0.84375rem] text-ink-muted">
            Review the real authenticated context and frontend-to-API boundary
            before operational workflows are enabled.
          </p>
        </div>
      </header>

      <CurrentAuthPanel />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
        <section
          className="overflow-hidden rounded-card border border-line bg-surface shadow-card"
          aria-labelledby="api-health-heading"
        >
          <div className="flex items-center gap-2 border-b border-line-subtle px-[1.125rem] py-3.5">
            <h2
              className="text-[0.90625rem] font-semibold text-ink"
              id="api-health-heading"
            >
              Live API connection
            </h2>
            <span className="ml-auto text-xs text-ink-muted">GET /health</span>
          </div>
          <ServiceStatus />
        </section>

        <aside
          className="overflow-hidden rounded-card border border-line bg-surface shadow-card"
          aria-labelledby="runtime-heading"
        >
          <div className="flex items-center gap-2 border-b border-line-subtle px-[1.125rem] py-3.5">
            <ShieldCheckIcon className="size-[1.125rem] text-accent" />
            <h2
              className="text-[0.90625rem] font-semibold text-ink"
              id="runtime-heading"
            >
              Runtime contract
            </h2>
          </div>
          <dl className="px-[1.125rem] py-2">
            <div className="border-b border-line-subtle py-3">
              <dt className="text-xs text-ink-muted">API base URL</dt>
              <dd className="mt-1 break-all font-mono text-xs font-semibold text-ink">
                {apiBaseUrl}
              </dd>
            </div>
            <div className="border-b border-line-subtle py-3">
              <dt className="text-xs text-ink-muted">Session transport</dt>
              <dd className="mt-1 text-[0.8125rem] font-semibold text-ink">
                Secure HTTP-only cookie
              </dd>
            </div>
            <div className="py-3">
              <dt className="text-xs text-ink-muted">Response validation</dt>
              <dd className="mt-1 text-[0.8125rem] font-semibold text-ink">
                Shared runtime contract
              </dd>
            </div>
          </dl>
        </aside>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-card border border-info/20 bg-info-soft px-4 py-3 text-[0.8125rem] text-info">
        <ShieldCheckIcon className="mt-0.5 size-[1.125rem] shrink-0" />
        <p>
          Business navigation remains intentionally unavailable in this slice. A
          route is added only with its real API, authorization, validation,
          audit behavior, and tested loading, empty, error, and success states.
        </p>
      </div>
    </div>
  );
}
