import { describe, expect, it } from "vitest";
import { CreateExpenseInputSchema, EXPENSE_CATEGORIES } from "./expenses";

describe("CreateExpenseInputSchema", () => {
  it("accepts a valid expense and normalises the note", () => {
    const parsed = CreateExpenseInputSchema.parse({
      category: "rent",
      amountMinor: 5_000_000,
      paymentMethod: "cash",
      note: "  Monthly   shop   rent ",
    });
    expect(parsed.category).toBe("rent");
    expect(parsed.amountMinor).toBe(5_000_000);
    expect(parsed.note).toBe("Monthly shop rent");
    expect(parsed.spentAt).toBeUndefined();
  });

  it("requires a positive integer amount", () => {
    expect(
      CreateExpenseInputSchema.safeParse({
        category: "utilities",
        amountMinor: 0,
        paymentMethod: "cash",
        note: "Electricity",
      }).success,
    ).toBe(false);
    expect(
      CreateExpenseInputSchema.safeParse({
        category: "utilities",
        amountMinor: 12.5,
        paymentMethod: "cash",
        note: "Electricity",
      }).success,
    ).toBe(false);
  });

  it("requires a non-empty note and a known category", () => {
    expect(
      CreateExpenseInputSchema.safeParse({
        category: "utilities",
        amountMinor: 1_000,
        paymentMethod: "cash",
        note: "   ",
      }).success,
    ).toBe(false);
    expect(
      CreateExpenseInputSchema.safeParse({
        category: "not_a_category",
        amountMinor: 1_000,
        paymentMethod: "cash",
        note: "Anything",
      }).success,
    ).toBe(false);
  });

  it("covers the approved expense categories", () => {
    expect(EXPENSE_CATEGORIES).toContain("salaries");
    expect(EXPENSE_CATEGORIES).toContain("maintenance");
    expect(new Set(EXPENSE_CATEGORIES).size).toBe(EXPENSE_CATEGORIES.length);
  });
});
