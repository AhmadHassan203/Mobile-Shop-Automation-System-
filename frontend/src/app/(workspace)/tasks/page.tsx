import type { Metadata } from "next";
import { Suspense } from "react";
import { TasksWorkspace } from "@/components/tasks/tasks-workspace";

export const metadata: Metadata = {
  title: "Tasks & follow-ups | MobileShop OS",
  description:
    "Review permission-scoped operational tasks, callbacks, priorities and source-workspace actions.",
};

function TasksFallback() {
  return (
    <div
      aria-label="Loading tasks workspace"
      className="h-96 animate-pulse rounded-card bg-line-subtle"
      role="status"
    />
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<TasksFallback />}>
      <TasksWorkspace />
    </Suspense>
  );
}
