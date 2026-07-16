import type { Metadata } from "next";
import { Suspense, type JSX } from "react";
import {
  RepairsRouteFallback,
  RepairsWorkspace,
} from "@/components/repairs/repairs-workspace";

export const metadata: Metadata = {
  title: "Repairs | MobileShop OS",
  description:
    "Workshop intake, technician assignment, parts, repair, quality control, and customer pickup.",
};

export default function RepairsPage(): JSX.Element {
  return (
    <Suspense fallback={<RepairsRouteFallback />}>
      <RepairsWorkspace />
    </Suspense>
  );
}
