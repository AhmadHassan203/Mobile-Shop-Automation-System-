import Link from "next/link";
import { AlertTriangleIcon } from "@/components/ui/icons";

interface SaleDetailPageProps {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function SaleDetailPage({
  params,
}: SaleDetailPageProps) {
  const { id } = await params;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="text-xs font-semibold text-accent" href="/">
            &larr; Dashboard
          </Link>
          <h1 className="mt-2 text-xl font-bold text-ink sm:text-2xl">
            Sale record
          </h1>
          <p className="mt-1 font-mono text-xs text-ink-muted">{id}</p>
        </div>
        <Link
          className="rounded-control bg-accent px-4 py-2.5 text-sm font-bold text-white no-underline hover:bg-accent-strong"
          href="/sell"
        >
          New sale
        </Link>
      </header>

      <section className="rounded-card border border-line bg-surface p-6 shadow-card">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
            <AlertTriangleIcon className="size-5" />
          </span>
          <div>
            <h2 className="font-bold text-ink">Sale detail unavailable</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">
              The immutable Sales ledger is the next backend module. This route
              is reserved for the exact invoice selected on the Dashboard; it
              will never substitute prototype rows or a different sale.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
