import type { Metadata } from "next";
import { Suspense, type JSX } from "react";
import {
  UsedIntakeRouteFallback,
  UsedIntakeWorkspace,
} from "@/components/used-intake/used-intake-workspace";

export const metadata: Metadata = {
  title: "Used Device Intake | MobileShop OS",
  description:
    "Quarantine-first second-hand device intake and verification gates.",
};

export default function UsedIntakePage(): JSX.Element {
  return (
    <Suspense fallback={<UsedIntakeRouteFallback />}>
      <UsedIntakeWorkspace />
    </Suspense>
  );
}
