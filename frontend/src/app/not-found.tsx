import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-app p-4">
      <section className="w-full max-w-xl rounded-card border border-line bg-surface p-6 text-center shadow-card">
        <p className="text-xs font-bold uppercase tracking-wide text-accent">
          404
        </p>
        <h1 className="mt-2 text-lg font-semibold text-ink">
          Route not available
        </h1>
        <p className="mt-2 text-[0.8125rem] text-ink-muted">
          This production route does not exist or has not been implemented yet.
        </p>
        <Link
          className="mt-5 inline-flex min-h-9 items-center rounded-control bg-accent px-3.5 py-2 text-[0.8125rem] font-semibold text-white no-underline hover:bg-accent-strong"
          href="/"
        >
          Return to system status
        </Link>
      </section>
    </main>
  );
}
