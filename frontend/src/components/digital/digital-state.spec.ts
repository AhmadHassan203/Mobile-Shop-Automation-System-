import { describe, expect, it } from "vitest";
import {
  BALANCE_ACCOUNTS,
  DIGITAL_SERVICE_AVAILABILITY,
  digitalCapabilities,
  filterDigitalTransactions,
  reconciliationReadiness,
  serviceFieldKind,
  transactionReviewBlockers,
  type DigitalTransactionSummary,
} from "./digital-state";

describe("Digital Services permission boundaries", () => {
  it("maps view, record, reversal and fee-rule actions exactly", () => {
    expect(
      digitalCapabilities([
        "external_services.view",
        "external_services.record",
        "external_fee_rules.view",
      ]),
    ).toEqual({
      canView: true,
      canRecord: true,
      canReverse: false,
      canViewFeeRules: true,
      canManageFeeRules: false,
    });
  });

  it("does not treat record permission as reversal permission", () => {
    const capabilities = digitalCapabilities(["external_services.record"]);
    expect(capabilities.canRecord).toBe(true);
    expect(capabilities.canReverse).toBe(false);
    expect(capabilities.canView).toBe(false);
  });
});

describe("new transaction state", () => {
  it("selects the complete service-specific field family", () => {
    expect(serviceFieldKind("JazzCash")).toBe("wallet");
    expect(serviceFieldKind("Bank Transfer")).toBe("bank");
    expect(serviceFieldKind("Utility Bill")).toBe("bill");
    expect(serviceFieldKind("Jazz Load")).toBe("load");
    expect(serviceFieldKind("Other")).toBe("other");
  });

  it("requires a positive principal, successful provider reference and cashier", () => {
    const blockers = transactionReviewBlockers(
      {
        service: "JazzCash",
        status: "SUCCESSFUL",
        direction: "SENT_FROM_SHOP",
        principalAmount: "0",
        feeCollectionMethod: "Deduct from Customer Payout",
        providerTransactionId: "",
        cashierName: "",
      },
      digitalCapabilities([]),
      DIGITAL_SERVICE_AVAILABILITY,
    );
    expect(blockers).toContain("Enter a principal amount greater than zero.");
    expect(blockers).toContain(
      "Successful transactions require a Provider Transaction ID.",
    );
    expect(blockers).toContain("Cashier is required.");
  });

  it("keeps final save blocked for an authorized valid draft without APIs", () => {
    const blockers = transactionReviewBlockers(
      {
        service: "Easypaisa",
        status: "SUCCESSFUL",
        direction: "RECEIVED_INTO_SHOP",
        principalAmount: "5000",
        feeCollectionMethod: "Collect Separately",
        providerTransactionId: "EP-USER-ENTERED",
        cashierName: "Authorized cashier",
      },
      digitalCapabilities([
        "external_services.record",
        "external_fee_rules.view",
      ]),
      DIGITAL_SERVICE_AVAILABILITY,
    );
    expect(blockers).toEqual([
      "The external fee-rule API has not been implemented yet.",
      "The external-service transaction persistence API has not been implemented yet.",
    ]);
  });
});

describe("history filters", () => {
  const rows: readonly DigitalTransactionSummary[] = [
    {
      id: "TX-ONE",
      createdAt: "2026-07-16T08:00:00.000Z",
      service: "JazzCash",
      direction: "SENT_FROM_SHOP",
      status: "SUCCESSFUL",
      cashierName: "Ayesha Khan",
    },
    {
      id: "TX-TWO",
      createdAt: "2026-07-15T08:00:00.000Z",
      service: "Utility Bill",
      direction: "RECEIVED_INTO_SHOP",
      status: "PENDING",
      cashierName: "Bilal Ahmed",
    },
  ];

  it("combines date, service, direction, status and cashier filters", () => {
    expect(
      filterDigitalTransactions(rows, {
        date: "2026-07-16",
        service: "JazzCash",
        direction: "SENT_FROM_SHOP",
        status: "SUCCESSFUL",
        cashier: "ayesha",
      }),
    ).toEqual([rows[0]]);
  });
});

describe("reconciliation readiness", () => {
  it("cannot calculate a variance without authoritative expected balances", () => {
    const counts = BALANCE_ACCOUNTS.map((account) => ({
      account,
      counted: "100",
    }));
    expect(
      reconciliationReadiness(
        false,
        counts,
        digitalCapabilities(["external_services.record"]),
        DIGITAL_SERVICE_AVAILABILITY,
      ),
    ).toEqual({
      expectedBalancesLoaded: false,
      everyCountEntered: true,
      canCalculateVariance: false,
      canPersist: false,
    });
  });
});
