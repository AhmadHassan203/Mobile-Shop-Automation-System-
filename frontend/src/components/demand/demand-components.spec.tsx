import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemandAvailabilityPanel } from "./demand-components";

const identity = {
  productVariantId: "11111111-1111-4111-8111-111111111111",
  sku: "PH-SAMSUNG-A55-256",
  displayName: "Samsung Galaxy A55 · 256 GB Navy",
  trackingType: "serialized" as const,
};

describe("Demand prototype components", () => {
  it("keeps unmatched free text usable without claiming stock", () => {
    const html = renderToStaticMarkup(
      <DemandAvailabilityPanel
        product={null}
        requestText="iPhone 16 Pro any colour"
      />,
    );
    expect(html).toContain("Not matched to the catalog");
    expect(html).toContain("stock cannot be verified");
  });

  it("distinguishes unpriced and priced out-of-stock products", () => {
    const unpriced = renderToStaticMarkup(
      <DemandAvailabilityPanel
        product={{ ...identity, availability: "price_not_configured" }}
        requestText=""
      />,
    );
    expect(unpriced).toContain("Price not configured");
    expect(unpriced).toContain("Open catalog / pricing");
    expect(unpriced).not.toContain("OUT OF STOCK");

    const out = renderToStaticMarkup(
      <DemandAvailabilityPanel
        product={{
          ...identity,
          availability: "out_of_stock",
          currency: "PKR",
          unitPriceMinor: 12_500_000,
        }}
        requestText=""
      />,
    );
    expect(out).toContain("OUT OF STOCK");
    expect(out).toContain("qualified demand");
  });

  it("shows real available quantity and its scoped location", () => {
    const available = renderToStaticMarkup(
      <DemandAvailabilityPanel
        product={{
          ...identity,
          availability: "saleable",
          currency: "PKR",
          unitPriceMinor: 12_500_000,
          availableQuantity: 2,
          locationNames: ["Main counter"],
        }}
        requestText=""
      />,
    );
    expect(available).toContain("2 available");
    expect(available).toContain("Main counter");

  });
});
