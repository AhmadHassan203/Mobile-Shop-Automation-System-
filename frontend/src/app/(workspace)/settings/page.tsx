import type { Metadata } from "next";
import { Suspense, type JSX } from "react";
import {
  SettingsRouteFallback,
  SettingsWorkspace,
} from "@/components/settings/settings-workspace";

export const metadata: Metadata = {
  title: "Settings | MobileShop OS",
  description:
    "Shop, branches, roles, price bands, reorder policy, warranty, backup and audit configuration.",
};

export default function SettingsPage(): JSX.Element {
  return (
    <Suspense fallback={<SettingsRouteFallback />}>
      <SettingsWorkspace />
    </Suspense>
  );
}
