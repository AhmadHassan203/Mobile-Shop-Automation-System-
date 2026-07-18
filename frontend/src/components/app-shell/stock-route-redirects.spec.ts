import { describe, expect, it, vi } from "vitest";

// The legacy standalone stock-in routes are now server redirects into the
// consolidated locations. `redirect` throws internally, so the mock mirrors that.
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const quickStockInRedirect = (
  await import("../../app/(workspace)/stock/quick-stock-in/page")
).default;
const barcodeStockInRedirect = (
  await import("../../app/(workspace)/stock/barcode-stock-in/page")
).default;
const bulkStockInRedirect = (
  await import("../../app/(workspace)/stock/bulk-stock-in/page")
).default;

function redirectTarget(page: () => never): string | undefined {
  redirectMock.mockClear();
  try {
    page();
  } catch {
    // redirect() throws by design; the recorded call carries the destination.
  }
  return redirectMock.mock.calls[0]?.[0];
}

describe("legacy stock-in route redirects", () => {
  it("redirects the old Quick Stock In route into Purchasing (Add Stock default)", () => {
    expect(redirectTarget(quickStockInRedirect)).toBe("/purchases");
  });

  it("redirects the old Barcode Stock In route into Product Catalog", () => {
    expect(redirectTarget(barcodeStockInRedirect)).toBe("/inventory");
  });

  it("redirects the old Bulk Stock In route into Product Catalog", () => {
    expect(redirectTarget(bulkStockInRedirect)).toBe("/inventory");
  });
});
