import type { Metadata } from "next";
import { IntelligenceWorkspace } from "@/components/intelligence/intelligence-workspace";

export const metadata: Metadata = {
  title: "Buying intelligence | MobileShop OS",
  description:
    "Review explainable reorder recommendations, budget impact, confidence, reasons and risks.",
};

export default function IntelligencePage() {
  return <IntelligenceWorkspace />;
}
