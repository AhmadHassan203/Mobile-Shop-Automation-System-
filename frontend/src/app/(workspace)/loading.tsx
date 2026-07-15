export default function WorkspaceLoading() {
  return (
    <div aria-live="polite" role="status">
      <div className="mb-5 space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-line-subtle" />
        <div className="h-7 w-52 animate-pulse rounded bg-line-subtle" />
        <div className="h-4 w-full max-w-lg animate-pulse rounded bg-line-subtle" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
        <div className="h-80 animate-pulse rounded-card border border-line bg-surface shadow-card" />
        <div className="h-72 animate-pulse rounded-card border border-line bg-surface shadow-card" />
      </div>
      <span className="sr-only">Loading the system readiness screen.</span>
    </div>
  );
}
