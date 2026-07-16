"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";

function formatOrganizationDateTime(now: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(now);
  } catch {
    return now.toISOString();
  }
}

export function BusinessClock() {
  const auth = useQuery(currentAuthQueryOptions);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (auth.data === undefined) {
    return (
      <div className="hidden h-9 w-40 animate-pulse rounded-control bg-line-subtle sm:block">
        <span className="sr-only">Loading organization time</span>
      </div>
    );
  }

  const { currency, timezone } = auth.data.organization;

  return (
    <div className="min-w-0">
      <time
        className="block truncate text-sm font-semibold text-ink"
        dateTime={now.toISOString()}
        suppressHydrationWarning
      >
        {formatOrganizationDateTime(now, timezone)}
      </time>
      <span className="block text-[0.6875rem] text-ink-muted">
        {auth.data.branch.name} · {currency}
      </span>
    </div>
  );
}
