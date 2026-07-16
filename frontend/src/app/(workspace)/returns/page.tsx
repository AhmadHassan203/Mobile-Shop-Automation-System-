import type { Metadata } from "next";
import { Suspense, type JSX } from "react";
import {
  ReturnsRouteFallback,
  ReturnsWorkspace,
} from "@/components/returns/returns-workspace";

export const metadata: Metadata = {
  title: "Returns & Warranty | MobileShop OS",
  description:
    "Verify original sales, inspect returned items, and control warranty and stock outcomes.",
};

export default function ReturnsPage(): JSX.Element {
  return (
    <Suspense fallback={<ReturnsRouteFallback />}>
      <ReturnsWorkspace />
    </Suspense>
  );
}
