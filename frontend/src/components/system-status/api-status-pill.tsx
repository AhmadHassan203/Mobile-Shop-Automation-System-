"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ActivityIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
} from "@/components/ui/icons";
import { healthQueryOptions } from "@/lib/query/health-query";

export function ApiStatusPill() {
  const health = useQuery(healthQueryOptions);

  if (health.isPending) {
    return (
      <span
        aria-live="polite"
        className="inline-flex items-center gap-1.5 rounded-full bg-line-subtle px-2.5 py-1 text-xs font-semibold text-ink-muted"
      >
        <ActivityIcon className="size-3.5 animate-pulse" />
        Checking API
      </span>
    );
  }

  if (health.isError) {
    return (
      <span
        aria-live="polite"
        className="inline-flex items-center gap-1.5 rounded-full bg-negative-soft px-2.5 py-1 text-xs font-semibold text-negative"
      >
        <AlertTriangleIcon className="size-3.5" />
        API unavailable
      </span>
    );
  }

  return (
    <span
      aria-live="polite"
      className="inline-flex items-center gap-1.5 rounded-full bg-positive-soft px-2.5 py-1 text-xs font-semibold text-positive"
    >
      <CheckCircleIcon className="size-3.5" />
      API online
    </span>
  );
}
