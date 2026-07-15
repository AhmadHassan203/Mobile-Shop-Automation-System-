"use client";

import { formatBusinessDateTime } from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  RefreshIcon,
  ServerIcon,
} from "@/components/ui/icons";
import { toApiError } from "@/lib/api/client";
import { getApiBaseUrl } from "@/lib/env";
import { healthQueryOptions } from "@/lib/query/health-query";

function formatUptime(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} seconds`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${hours} hr`
    : `${hours} hr ${remainingMinutes} min`;
}

function LoadingState() {
  return (
    <div aria-live="polite" className="p-[1.125rem]" role="status">
      <div className="flex items-center gap-3">
        <div className="size-10 animate-pulse rounded-full bg-line-subtle" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-40 animate-pulse rounded bg-line-subtle" />
          <div className="h-3 w-64 max-w-full animate-pulse rounded bg-line-subtle" />
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="rounded-control border border-line-subtle p-3"
            key={index}
          >
            <div className="h-3 w-20 animate-pulse rounded bg-line-subtle" />
            <div className="mt-2 h-4 w-32 animate-pulse rounded bg-line-subtle" />
          </div>
        ))}
      </div>
      <span className="sr-only">Checking the backend health endpoint.</span>
    </div>
  );
}

export function ServiceStatus() {
  const health = useQuery(healthQueryOptions);

  if (health.isPending) return <LoadingState />;

  if (health.isError) {
    const error = toApiError(health.error);
    const isConnectionFailure =
      error.code === "NETWORK_ERROR" || error.code === "REQUEST_TIMEOUT";

    return (
      <div className="p-[1.125rem]" data-testid="health-status">
        <div className="flex items-start gap-3" role="alert">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-negative-soft text-negative">
            <AlertTriangleIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[0.9375rem] font-semibold text-ink">
              Backend is not ready
            </h3>
            <p className="mt-1 text-[0.8125rem] text-ink-subtle">
              {isConnectionFailure
                ? "The browser could not reach the configured NestJS API. Start the backend and confirm its CORS origin, then retry."
                : error.message}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-control border border-negative/20 bg-negative-soft p-3 text-[0.75rem] text-negative">
          <p className="font-semibold">Endpoint checked</p>
          <code className="mt-1 block break-all font-mono">
            {getApiBaseUrl()}/health
          </code>
          {error.requestId === undefined ? null : (
            <p className="mt-2">
              Request reference:{" "}
              <code className="font-mono">{error.requestId}</code>
            </p>
          )}
        </div>

        <button
          className="mt-4 inline-flex min-h-9 items-center justify-center gap-2 rounded-control bg-accent px-3.5 py-2 text-[0.8125rem] font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60"
          disabled={health.isFetching}
          onClick={() => {
            void health.refetch();
          }}
          type="button"
        >
          <RefreshIcon
            className={`size-4 ${health.isFetching ? "animate-spin" : ""}`}
          />
          {health.isFetching ? "Checking…" : "Retry connection"}
        </button>
      </div>
    );
  }

  return (
    <div className="p-[1.125rem]" data-testid="health-status">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-positive-soft text-positive">
          <CheckCircleIcon className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[0.9375rem] font-semibold text-ink">
            Backend API is online
          </h3>
          <p className="mt-1 text-[0.8125rem] text-ink-subtle">
            This status is runtime-validated from the real health endpoint; it
            is not a simulated success.
          </p>
        </div>
        <button
          aria-label="Refresh backend status"
          className="ml-auto grid size-9 shrink-0 place-items-center rounded-control border border-line bg-surface text-ink-subtle transition-colors hover:bg-surface-subtle disabled:cursor-wait disabled:opacity-60"
          disabled={health.isFetching}
          onClick={() => {
            void health.refetch();
          }}
          title="Refresh backend status"
          type="button"
        >
          <RefreshIcon
            className={`size-4 ${health.isFetching ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-control border border-line-subtle bg-surface-subtle p-3">
          <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
            <ServerIcon className="size-3.5" /> Service
          </dt>
          <dd className="mt-1.5 text-[0.8125rem] font-semibold text-ink">
            {health.data.name}
          </dd>
        </div>
        <div className="rounded-control border border-line-subtle bg-surface-subtle p-3">
          <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
            API contract
          </dt>
          <dd className="mt-1.5 font-mono text-[0.8125rem] font-semibold text-ink">
            {health.data.apiVersion}
          </dd>
        </div>
        <div className="rounded-control border border-line-subtle bg-surface-subtle p-3">
          <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
            <ClockIcon className="size-3.5" /> Process uptime
          </dt>
          <dd className="mt-1.5 text-[0.8125rem] font-semibold text-ink">
            {formatUptime(health.data.uptimeSeconds)}
          </dd>
        </div>
        <div className="rounded-control border border-line-subtle bg-surface-subtle p-3">
          <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
            API timestamp
          </dt>
          <dd className="mt-1.5 text-[0.8125rem] font-semibold text-ink">
            {formatBusinessDateTime(new Date(health.data.timestamp), {
              withSeconds: true,
            })}
          </dd>
        </div>
      </dl>
    </div>
  );
}
