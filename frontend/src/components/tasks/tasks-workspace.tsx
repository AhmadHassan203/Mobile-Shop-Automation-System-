"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type JSX, type ReactNode } from "react";
import { CatalogForbiddenState } from "@/components/catalog/catalog-states";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  CloseIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  TASK_FILTERS,
  TASK_PERMISSION_DISCLOSURE,
  taskFilterFrom,
  taskFilterQuery,
  validateFollowUpDraft,
  type FollowUpDraft,
} from "./tasks-state";

const controlClass =
  "mt-1.5 min-h-10 w-full rounded-control border border-line bg-surface-subtle px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface disabled:opacity-60";
const EMPTY_DRAFT: FollowUpDraft = {
  title: "",
  workspace: "",
  priority: "medium",
  due: "",
  context: "",
};

function TasksIcon({
  className = "size-5",
}: {
  readonly className?: string;
}): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      viewBox="0 0 24 24"
    >
      <path d="m9 11 3 3 8-8" />
      <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

function TasksLoading(): JSX.Element {
  return (
    <div
      aria-label="Loading tasks workspace"
      className="space-y-4"
      role="status"
    >
      <span className="sr-only">Loading tasks workspace</span>
      <div className="h-28 animate-pulse rounded-card bg-line-subtle" />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="h-96 animate-pulse rounded-card bg-line-subtle xl:col-span-2" />
        <div className="h-72 animate-pulse rounded-card bg-line-subtle" />
      </div>
    </div>
  );
}

function TaskKpi({
  label,
  meta,
  tone = "ink",
}: {
  readonly label: string;
  readonly meta: string;
  readonly tone?: "ink" | "accent" | "positive";
}): JSX.Element {
  const color =
    tone === "accent"
      ? "text-accent"
      : tone === "positive"
        ? "text-positive"
        : "text-ink";
  return (
    <article
      className={`rounded-card border bg-surface p-4 shadow-card ${tone === "accent" ? "border-accent/35" : "border-line"}`}
    >
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>—</p>
      <p className="mt-1 text-xs text-ink-muted">{meta}</p>
    </article>
  );
}

function Field({
  children,
  error,
  label,
}: {
  readonly children: ReactNode;
  readonly error?: string | undefined;
  readonly label: string;
}): JSX.Element {
  return (
    <label className="block text-xs font-semibold text-ink-subtle">
      {label}
      {children}
      {error === undefined ? null : (
        <span className="mt-1 block text-xs font-medium text-negative">
          {error}
        </span>
      )}
    </label>
  );
}

function AddFollowUpDrawer({
  onClose,
}: {
  readonly onClose: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState<FollowUpDraft>(EMPTY_DRAFT);
  const errors = validateFollowUpDraft(draft);
  const update = <Key extends keyof FollowUpDraft>(
    key: Key,
    value: FollowUpDraft[Key],
  ): void => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#111827]/45"
      role="presentation"
    >
      <button
        aria-label="Close add follow-up drawer"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby="add-follow-up-title"
        aria-modal="true"
        className="relative flex h-full w-full max-w-xl flex-col bg-surface shadow-overlay"
        role="dialog"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
            <TasksIcon />
          </span>
          <div>
            <h2 className="font-bold text-ink" id="add-follow-up-title">
              Add follow-up
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Prepare a callback or operational reminder.
            </p>
          </div>
          <button
            aria-label="Close drawer"
            className="ml-auto grid size-9 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle hover:text-ink"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
            Task creation stays disabled because neither a Tasks API nor
            explicit task.manage permission exists.
          </div>
          <Field
            error={draft.title.length > 0 ? errors.title : undefined}
            label="Follow-up title"
          >
            <input
              className={controlClass}
              onChange={(event) => update("title", event.target.value)}
              placeholder="e.g. Call customer when stock arrives"
              value={draft.title}
            />
          </Field>
          <Field
            error={draft.workspace.length > 0 ? errors.workspace : undefined}
            label="Source workspace"
          >
            <select
              className={controlClass}
              onChange={(event) => update("workspace", event.target.value)}
              value={draft.workspace}
            >
              <option value="">Choose workspace</option>
              <option value="intelligence">Buying plan</option>
              <option value="demand">Demand board</option>
              <option value="used-intake">Used intake</option>
              <option value="inventory">Inventory</option>
              <option value="finance">Finance</option>
              <option value="purchases">Purchases</option>
            </select>
          </Field>
          <fieldset>
            <legend className="text-xs font-semibold text-ink-subtle">
              Priority
            </legend>
            <div className="mt-1.5 inline-flex rounded-control border border-line bg-surface-subtle p-1">
              {(["high", "medium"] as const).map((priority) => (
                <button
                  aria-pressed={draft.priority === priority}
                  className={`min-h-8 rounded-[0.4rem] px-4 text-xs font-semibold ${draft.priority === priority ? "bg-surface text-accent shadow-sm" : "text-ink-muted"}`}
                  key={priority}
                  onClick={() => update("priority", priority)}
                  type="button"
                >
                  {priority === "high" ? "High" : "Medium"}
                </button>
              ))}
            </div>
          </fieldset>
          <Field
            error={draft.due.length > 0 ? errors.due : undefined}
            label="Due date"
          >
            <input
              className={controlClass}
              onChange={(event) => update("due", event.target.value)}
              type="date"
              value={draft.due}
            />
          </Field>
          <Field
            error={draft.context.length > 0 ? errors.context : undefined}
            label="Context"
          >
            <textarea
              className={`${controlClass} min-h-28 resize-y`}
              onChange={(event) => update("context", event.target.value)}
              placeholder="What needs to happen and why…"
              value={draft.context}
            />
          </Field>
          <div className="flex items-start gap-2.5 rounded-control border border-info/20 bg-info-soft p-3 text-xs leading-5 text-info">
            <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />A persisted
            follow-up will retain its source link, due date, actor and audit
            history.
          </div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          <button
            className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white opacity-50"
            disabled
            title="Tasks API and task.manage permission pending"
            type="button"
          >
            <PlusIcon className="size-4" /> Save follow-up · pending
          </button>
        </footer>
      </section>
    </div>
  );
}

function TaskDetailDrawer({
  onClose,
}: {
  readonly onClose: () => void;
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#111827]/45"
      role="presentation"
    >
      <button
        aria-label="Close task detail drawer"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby="task-detail-title"
        aria-modal="true"
        className="relative flex h-full w-full max-w-xl flex-col bg-surface shadow-overlay"
        role="dialog"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
            <TasksIcon />
          </span>
          <div>
            <h2 className="font-bold text-ink" id="task-detail-title">
              Task detail · API pending
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              No verified task selected
            </p>
          </div>
          <button
            aria-label="Close drawer"
            className="ml-auto grid size-9 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle hover:text-ink"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-semibold text-ink-muted">
              Type pending
            </span>
            <span className="rounded-full bg-negative-soft px-2.5 py-1 text-xs font-semibold text-negative">
              Priority pending
            </span>
            <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">
              Due date pending
            </span>
          </div>
          <p className="text-sm leading-6 text-ink-muted">
            Source-module context and the exact decision or callback required
            will appear here.
          </p>
          <dl className="divide-y divide-line-subtle rounded-card border border-line px-4 py-1 text-sm">
            {["Task", "Type", "Priority", "Due", "Opens"].map((label) => (
              <div className="flex justify-between gap-4 py-3" key={label}>
                <dt className="text-ink-muted">{label}</dt>
                <dd className="font-semibold text-ink-subtle">API pending</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-control border border-accent/25 bg-accent-soft p-4 text-sm text-accent-ink">
            <strong>Marking this complete will</strong>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
              <li>Remove it from today&apos;s task queue.</li>
              <li>Log who cleared it and when to the audit trail.</li>
            </ul>
          </div>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          <button
            className="min-h-10 rounded-control bg-accent px-4 text-sm font-semibold text-white opacity-50"
            disabled
            title="A verified source link is required"
            type="button"
          >
            Open
          </button>
          <button
            className="min-h-10 rounded-control bg-positive px-4 text-sm font-semibold text-white opacity-50"
            disabled
            title="Tasks API and task.manage permission pending"
            type="button"
          >
            Mark complete
          </button>
          <button
            className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle opacity-50"
            disabled
            title="Tasks API and task.manage permission pending"
            type="button"
          >
            Snooze to tomorrow
          </button>
        </footer>
      </section>
    </div>
  );
}

function PriorityBreakdown(): JSX.Element {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center gap-3 border-b border-line px-4 py-4">
        <h2 className="font-bold text-ink">By priority</h2>
        <span className="ml-auto text-xs text-ink-muted">
          today&apos;s load
        </span>
      </div>
      <div className="space-y-5 p-4">
        {[
          { label: "High priority", tone: "negative" },
          { label: "Medium priority", tone: "warning" },
        ].map((item) => (
          <div key={item.label}>
            <div className="mb-2 flex justify-between gap-3">
              <span className="text-sm font-semibold text-ink">
                {item.label}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.tone === "negative" ? "bg-negative-soft text-negative" : "bg-warning-soft text-warning"}`}
              >
                — tasks
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line-subtle">
              <span
                className={`block h-full w-0 rounded-full ${item.tone === "negative" ? "bg-negative" : "bg-warning"}`}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const JUMP_LINKS = [
  { label: "Review buying plan", href: "/intelligence" },
  { label: "Demand board", href: "/demand" },
  { label: "Used intake", href: "/used-intake" },
  { label: "Finance & payables", href: "/finance" },
] as const;

export function TasksWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(true);

  if (auth.data === undefined && auth.isPending) return <TasksLoading />;
  if (auth.isError || auth.data === undefined) {
    return (
      <CatalogForbiddenState
        description="The current session could not be checked, so no task or source-module context was requested."
        title="Task workspace access could not be verified"
      />
    );
  }
  const filter = taskFilterFrom(new URLSearchParams(searchParams.toString()));
  const setFilter = (nextFilter: typeof filter): void => {
    const query = taskFilterQuery(
      new URLSearchParams(searchParams.toString()),
      nextFilter,
    );
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };

  return (
    <div className="space-y-4">
      <header className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-soft text-accent">
              <TasksIcon />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.09em] text-accent">
                Tasks · Daily command center
              </p>
              <h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">
                Tasks &amp; Follow-ups
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">
                Everything that needs a decision or callback today, linked back
                to its source workspace.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-control border border-line px-3.5 text-sm font-semibold text-ink-subtle"
              onClick={() => setAddOpen(true)}
              type="button"
            >
              <PlusIcon className="size-4" /> Add follow-up
            </button>
            <button
              aria-expanded={summaryExpanded}
              className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white"
              onClick={() => setSummaryExpanded((current) => !current)}
              type="button"
            >
              <TasksIcon className="size-4" /> Daily owner summary
            </button>
          </div>
        </div>
      </header>

      <div className="flex items-start gap-2.5 rounded-card border border-warning/25 bg-warning-soft px-4 py-3 text-xs leading-5 text-warning">
        <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-bold">Task authorization contract is missing</p>
          <p>{TASK_PERMISSION_DISCLOSURE}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TaskKpi
          label="Open tasks"
          meta="In your queue today · API pending"
          tone="accent"
        />
        <TaskKpi label="High priority" meta="Work these first · API pending" />
        <TaskKpi label="Due today" meta="Before closing · API pending" />
        <TaskKpi
          label="Cleared today"
          meta="Checked off so far · API pending"
          tone="positive"
        />
      </div>

      {summaryExpanded ? (
        <div className="flex items-start gap-2.5 rounded-card border border-positive/20 bg-positive-soft px-4 py-3 text-sm leading-6 text-positive">
          <ShieldCheckIcon className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-bold">Daily owner summary</p>
            <p className="text-ink-subtle">
              Sales, margin, waiting customers, restock orders, blocked
              used-device checks and supplier decisions will be summarized only
              after each source API supplies verified facts.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Link className="font-semibold text-accent" href="/demand">
                Demand board →
              </Link>
              <Link className="font-semibold text-accent" href="/purchases">
                Purchases →
              </Link>
              <Link className="font-semibold text-accent" href="/used-intake">
                Used intake →
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card xl:col-span-2">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-4 sm:px-5">
            <h2 className="font-bold text-ink">Open tasks</h2>
            <div
              className="flex min-w-max gap-1 sm:ml-auto"
              role="group"
              aria-label="Task filters"
            >
              {TASK_FILTERS.map((item) => (
                <button
                  aria-pressed={filter === item.id}
                  className={`min-h-8 rounded-control px-3 text-xs font-semibold ${filter === item.id ? "bg-accent text-white" : "text-ink-muted hover:bg-surface-subtle"}`}
                  key={item.id}
                  onClick={() => setFilter(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <div className="mb-2 flex items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
              <span>High priority</span>
              <span className="ml-auto rounded-full bg-negative-soft px-2 py-0.5 text-negative">
                —
              </span>
            </div>
            <div className="rounded-control border border-dashed border-line p-8 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
                <TasksIcon className="size-6" />
              </span>
              <h3 className="mt-3 font-bold text-ink">
                No verified tasks available
              </h3>
              <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-ink-muted">
                {filter === "all"
                  ? "Task rows, completion state, due dates and source links require the Tasks API and authorization contract."
                  : `The ${TASK_FILTERS.find((item) => item.id === filter)?.label.toLowerCase()} filter is ready; verified rows require the Tasks API.`}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  className="min-h-9 rounded-control border border-line px-3.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle"
                  onClick={() => setDetailOpen(true)}
                  type="button"
                >
                  Review task detail
                </button>
                <button
                  className="min-h-9 rounded-control border border-line px-3.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle"
                  onClick={() => setAddOpen(true)}
                  type="button"
                >
                  Review follow-up capture
                </button>
              </div>
            </div>
            <div className="mb-2 mt-5 flex items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
              <span>Medium priority</span>
              <span className="ml-auto rounded-full bg-warning-soft px-2 py-0.5 text-warning">
                —
              </span>
            </div>
            <div className="rounded-control border border-dashed border-line px-4 py-5 text-center text-xs text-ink-muted">
              Medium-priority task rows will appear here.
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <PriorityBreakdown />
          <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="border-b border-line px-4 py-4">
              <h2 className="font-bold text-ink">Jump to</h2>
            </div>
            <nav className="space-y-2 p-4" aria-label="Task workspaces">
              {JUMP_LINKS.map((item) => (
                <Link
                  className="flex min-h-10 items-center justify-between rounded-control border border-transparent px-3 text-sm font-semibold text-ink-subtle no-underline hover:border-line hover:bg-surface-subtle"
                  href={item.href}
                  key={item.href}
                >
                  <span>{item.label}</span>
                  <span className="text-accent">→</span>
                </Link>
              ))}
            </nav>
          </section>
        </aside>
      </div>

      {addOpen ? <AddFollowUpDrawer onClose={() => setAddOpen(false)} /> : null}
      {detailOpen ? (
        <TaskDetailDrawer onClose={() => setDetailOpen(false)} />
      ) : null}
    </div>
  );
}
