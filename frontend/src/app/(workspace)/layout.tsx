import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedWorkspace } from "@/components/auth/protected-workspace";

export interface WorkspaceLayoutProps {
  readonly children: ReactNode;
}

export default function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  return (
    <ProtectedWorkspace>
      <AppShell>{children}</AppShell>
    </ProtectedWorkspace>
  );
}
