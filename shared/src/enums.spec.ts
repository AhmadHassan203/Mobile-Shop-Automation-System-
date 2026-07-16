import { describe, expect, it } from "vitest";
import {
  MOVEMENT_ON_HAND_SIGN,
  MOVEMENT_TYPES,
  ON_HAND_STOCK_STATES,
  PURCHASE_ORDER_STATUSES,
  PURCHASE_ORDER_STATUS_TRANSITIONS,
  SALEABLE_STOCK_STATES,
  SERIALIZED_STATE_TRANSITIONS,
  SERIALIZED_STOCK_STATES,
  type SerializedStockState,
  confidenceLabelFor,
  isPurchaseOrderTransitionAllowed,
  isTransitionAllowed,
} from "./enums";

describe("serialized stock states", () => {
  it("matches the approved vocabulary in 05_RULES.md §3", () => {
    expect([...SERIALIZED_STOCK_STATES]).toEqual([
      "pending_verification",
      "quarantined",
      "available",
      "reserved",
      "sold",
      "returned_inspection",
      "defective",
      "supplier_warranty",
      "customer_warranty",
      "repair",
      "written_off",
      "purchase_returned",
    ]);
  });

  it("defines transitions for every state", () => {
    for (const state of SERIALIZED_STOCK_STATES) {
      expect(SERIALIZED_STATE_TRANSITIONS[state]).toBeDefined();
    }
  });

  it("only ever transitions to known states", () => {
    for (const [from, targets] of Object.entries(
      SERIALIZED_STATE_TRANSITIONS,
    )) {
      for (const target of targets) {
        expect(SERIALIZED_STOCK_STATES, `${from} -> ${target}`).toContain(
          target,
        );
      }
    }
  });

  it("never allows a self-transition", () => {
    for (const state of SERIALIZED_STOCK_STATES) {
      expect(isTransitionAllowed(state, state)).toBe(false);
    }
  });
});

describe("state transition rules", () => {
  it("allows the documented happy path", () => {
    // 05_RULES.md §3: pending_verification -> quarantined -> available -> reserved
    //                 -> sold -> returned_inspection -> available
    const path: SerializedStockState[] = [
      "pending_verification",
      "quarantined",
      "available",
      "reserved",
      "sold",
      "returned_inspection",
      "available",
    ];
    for (let i = 0; i < path.length - 1; i += 1) {
      const from = path[i] as SerializedStockState;
      const to = path[i + 1] as SerializedStockState;
      expect(isTransitionAllowed(from, to), `${from} -> ${to}`).toBe(true);
    }
  });

  it("forbids a returned unit jumping straight to available (05_RULES §3)", () => {
    // The whole point of returned_inspection: a returned phone is not automatically saleable.
    expect(isTransitionAllowed("sold", "available")).toBe(false);
    expect(SERIALIZED_STATE_TRANSITIONS.sold).toEqual(["returned_inspection"]);
  });

  it("forbids selling a sold unit again (05_RULES §1.4)", () => {
    expect(isTransitionAllowed("sold", "sold")).toBe(false);
    expect(isTransitionAllowed("sold", "reserved")).toBe(false);
  });

  it("treats write_off and purchase_returned as terminal", () => {
    expect(SERIALIZED_STATE_TRANSITIONS.written_off).toEqual([]);
    expect(SERIALIZED_STATE_TRANSITIONS.purchase_returned).toEqual([]);
  });

  it("does not allow selling directly from a non-saleable state", () => {
    for (const state of [
      "pending_verification",
      "quarantined",
      "defective",
      "returned_inspection",
    ] as const) {
      expect(isTransitionAllowed(state, "sold"), `${state} -> sold`).toBe(
        false,
      );
    }
  });

  it("allows a reservation to be released back to available", () => {
    expect(isTransitionAllowed("reserved", "available")).toBe(true);
    expect(isTransitionAllowed("available", "reserved")).toBe(true);
  });
});

describe("saleable and on-hand state sets", () => {
  it("treats only available stock as saleable", () => {
    expect([...SALEABLE_STOCK_STATES]).toEqual(["available"]);
  });

  it("excludes sold, written-off and purchase-returned units from on-hand", () => {
    expect(ON_HAND_STOCK_STATES).not.toContain("sold");
    expect(ON_HAND_STOCK_STATES).not.toContain("written_off");
    expect(ON_HAND_STOCK_STATES).not.toContain("purchase_returned");
  });

  it("counts reserved stock as physically on hand", () => {
    // A reserved phone is still in the drawer and still owned; it must be valued.
    expect(ON_HAND_STOCK_STATES).toContain("reserved");
  });
});

describe("inventory movement types", () => {
  it("assigns an on-hand sign to every movement type", () => {
    for (const type of MOVEMENT_TYPES) {
      expect(MOVEMENT_ON_HAND_SIGN[type]).toBeDefined();
    }
  });

  it("treats reserve and release as on-hand neutral", () => {
    // Reserving moves stock available -> reserved; the shop still holds the same units.
    expect(MOVEMENT_ON_HAND_SIGN.reserve).toBe(0);
    expect(MOVEMENT_ON_HAND_SIGN.release).toBe(0);
  });

  it("decreases on-hand for outbound movements", () => {
    for (const type of [
      "sale",
      "purchase_return",
      "transfer_out",
      "adjustment_out",
      "damage",
      "write_off",
    ] as const) {
      expect(MOVEMENT_ON_HAND_SIGN[type], type).toBe(-1);
    }
  });

  it("increases on-hand for inbound movements", () => {
    for (const type of [
      "purchase_receive",
      "sale_return",
      "transfer_in",
      "adjustment_in",
    ] as const) {
      expect(MOVEMENT_ON_HAND_SIGN[type], type).toBe(1);
    }
  });
});

describe("purchase order lifecycle", () => {
  it("defines only known transitions for every status", () => {
    for (const status of PURCHASE_ORDER_STATUSES) {
      const targets = PURCHASE_ORDER_STATUS_TRANSITIONS[status];
      expect(targets).toBeDefined();
      for (const target of targets) {
        expect(PURCHASE_ORDER_STATUSES).toContain(target);
        expect(isPurchaseOrderTransitionAllowed(status, target)).toBe(true);
      }
    }
  });

  it("allows receiving only after approval", () => {
    expect(isPurchaseOrderTransitionAllowed("draft", "received")).toBe(false);
    expect(
      isPurchaseOrderTransitionAllowed("approved", "partially_received"),
    ).toBe(true);
    expect(isPurchaseOrderTransitionAllowed("ordered", "received")).toBe(true);
  });

  it("does not cancel or reopen an order after stock arrived", () => {
    expect(
      isPurchaseOrderTransitionAllowed("partially_received", "cancelled"),
    ).toBe(false);
    expect(isPurchaseOrderTransitionAllowed("received", "ordered")).toBe(false);
    expect(PURCHASE_ORDER_STATUS_TRANSITIONS.closed).toEqual([]);
    expect(PURCHASE_ORDER_STATUS_TRANSITIONS.cancelled).toEqual([]);
  });
});

describe("confidence labels (09_ANALYTICS §6)", () => {
  it("maps scores to the documented bands", () => {
    expect(confidenceLabelFor(100)).toBe("high");
    expect(confidenceLabelFor(75)).toBe("high");
    expect(confidenceLabelFor(74)).toBe("medium");
    expect(confidenceLabelFor(50)).toBe("medium");
    expect(confidenceLabelFor(49)).toBe("low");
    expect(confidenceLabelFor(0)).toBe("low");
  });
});
