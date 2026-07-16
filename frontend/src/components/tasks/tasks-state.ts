export const TASK_FILTERS = [
  { id: "all", label: "All" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "today", label: "Due today" },
] as const;

export type TaskFilter = (typeof TASK_FILTERS)[number]["id"];

export interface FollowUpDraft {
  readonly title: string;
  readonly workspace: string;
  readonly priority: "high" | "medium";
  readonly due: string;
  readonly context: string;
}

export type FollowUpDraftErrors = Readonly<
  Partial<Record<keyof FollowUpDraft, string>>
>;

export const TASK_PERMISSION_DISCLOSURE =
  "Dedicated task permissions are not defined in the shared authorization model. Task actions stay disabled until explicit task.view and task.manage contracts exist.";

export function taskFilterFrom(searchParams: URLSearchParams): TaskFilter {
  const value = searchParams.get("filter");
  return TASK_FILTERS.some((filter) => filter.id === value)
    ? (value as TaskFilter)
    : "all";
}

export function taskFilterQuery(
  searchParams: URLSearchParams,
  filter: TaskFilter,
): string {
  const next = new URLSearchParams(searchParams.toString());
  if (filter === "all") next.delete("filter");
  else next.set("filter", filter);
  return next.toString();
}

export function validateFollowUpDraft(
  draft: FollowUpDraft,
): FollowUpDraftErrors {
  const errors: Partial<Record<keyof FollowUpDraft, string>> = {};
  const title = draft.title.trim();
  if (title.length < 3) errors.title = "Describe the follow-up.";
  if (title.length > 160)
    errors.title = "Title must be 160 characters or less.";
  if (draft.workspace.length === 0)
    errors.workspace = "Choose the source workspace.";
  if (draft.due.length > 0 && !/^\d{4}-\d{2}-\d{2}$/u.test(draft.due)) {
    errors.due = "Choose a valid due date.";
  }
  if (draft.context.trim().length > 500) {
    errors.context = "Context must be 500 characters or less.";
  }
  return errors;
}
