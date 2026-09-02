import { describe, expect, it } from "vitest";
import type { ExpenseRecord } from "../db/expenses";
import { anomalySignature, detectExpenseAnomalies } from "./expenseAnomalies";

let nextId = 1;
function mk(over: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return {
    id: nextId++,
    date: "2025-10-15",
    category: null,
    description: null,
    provider: null,
    amount: 100,
    ivaAmount: null,
    deductiblePct: 100,
    ivaDeductiblePct: null,
    irpfRate: null,
    irpfAmount: null,
    receiptFilePath: null,
    declaredPeriod: null,
    paidDate: null,
    declared: false,
    ...over,
  };
}

describe("detectExpenseAnomalies — iva-spike", () => {
  it("flags a quarter whose deducible IVA is >=3x the trailing 4-quarter average", () => {
    const expenses = [
      mk({ date: "2025-02-10", ivaAmount: 21 }),
      mk({ date: "2025-05-10", ivaAmount: 21 }),
      mk({ date: "2025-08-10", ivaAmount: 21 }),
      mk({ date: "2025-11-10", ivaAmount: 100 }),
    ];
    const [anomaly] = detectExpenseAnomalies(expenses);
    expect(anomaly.kind).toBe("iva-spike");
    expect(anomaly.severity).toBe("warning");
    expect(anomaly.params.quarter).toBe("2025-Q4");
    expect(anomaly.params.multiple).toBeCloseTo(4.8, 1);
    expect(anomaly.expenseIds).toEqual([expenses[3].id]);
  });

  it("stays silent with fewer than 2 trailing quarters of data", () => {
    const expenses = [
      mk({ date: "2025-08-10", ivaAmount: 21 }),
      mk({ date: "2025-11-10", ivaAmount: 100 }),
    ];
    expect(detectExpenseAnomalies(expenses).filter((a) => a.kind === "iva-spike")).toHaveLength(0);
  });

  it("stays silent below the multiple", () => {
    const expenses = [
      mk({ date: "2025-02-10", ivaAmount: 40 }),
      mk({ date: "2025-05-10", ivaAmount: 40 }),
      mk({ date: "2025-08-10", ivaAmount: 40 }),
      mk({ date: "2025-11-10", ivaAmount: 60 }),
    ];
    expect(detectExpenseAnomalies(expenses).filter((a) => a.kind === "iva-spike")).toHaveLength(0);
  });

  it("honours declaredPeriod overrides when bucketing", () => {
    const expenses = [
      mk({ date: "2025-02-10", ivaAmount: 21 }),
      mk({ date: "2025-05-10", ivaAmount: 21 }),
      mk({ date: "2025-08-10", ivaAmount: 21 }),
      // dated in Q3 but declared into Q4 — should count toward the Q4 spike
      mk({ date: "2025-09-30", declaredPeriod: "2025-Q4", ivaAmount: 100 }),
    ];
    const spike = detectExpenseAnomalies(expenses).find((a) => a.kind === "iva-spike");
    expect(spike?.params.quarter).toBe("2025-Q4");
  });
});

describe("detectExpenseAnomalies — duplicate", () => {
  it("flags same-provider same-amount expenses within the window", () => {
    const expenses = [
      mk({ provider: "Acme S.L.", amount: 121, date: "2025-11-03" }),
      mk({ provider: "acme s.l.", amount: 121, date: "2025-11-05" }),
      mk({ provider: "ACME S.L.", amount: 121, date: "2025-11-28" }),
    ];
    const dups = detectExpenseAnomalies(expenses).filter((a) => a.kind === "duplicate");
    expect(dups).toHaveLength(1);
    expect(dups[0].severity).toBe("warning");
    expect(dups[0].expenseIds).toEqual([expenses[0].id, expenses[1].id]);
    expect(dups[0].params.count).toBe(2);
  });

  it("does not flag the same amount from different providers", () => {
    const expenses = [
      mk({ provider: "Acme", amount: 121, date: "2025-11-03" }),
      mk({ provider: "Globex", amount: 121, date: "2025-11-04" }),
    ];
    expect(detectExpenseAnomalies(expenses).filter((a) => a.kind === "duplicate")).toHaveLength(0);
  });

  it("does not flag same provider/amount far apart in time", () => {
    const expenses = [
      mk({ provider: "Acme", amount: 121, date: "2025-01-03" }),
      mk({ provider: "Acme", amount: 121, date: "2025-11-04" }),
    ];
    expect(detectExpenseAnomalies(expenses).filter((a) => a.kind === "duplicate")).toHaveLength(0);
  });

  it("ignores expenses with no provider", () => {
    const expenses = [
      mk({ provider: null, amount: 121, date: "2025-11-03" }),
      mk({ provider: "   ", amount: 121, date: "2025-11-04" }),
    ];
    expect(detectExpenseAnomalies(expenses).filter((a) => a.kind === "duplicate")).toHaveLength(0);
  });
});

describe("detectExpenseAnomalies — irpf-mismatch", () => {
  it("flags an expense carrying IRPF in a category that usually has none", () => {
    const expenses = [
      mk({ category: "Suministros", amount: 50, irpfRate: null }),
      mk({ category: "Suministros", amount: 50, irpfRate: null }),
      mk({ category: "Suministros", amount: 50, irpfRate: null }),
      mk({ category: "Suministros", amount: 50, irpfRate: null }),
      mk({ category: "Suministros", amount: 50, irpfRate: 15 }),
    ];
    const hits = detectExpenseAnomalies(expenses).filter((a) => a.kind === "irpf-mismatch");
    expect(hits).toHaveLength(1);
    expect(hits[0].params.variant).toBe("carries");
    expect(hits[0].expenseIds).toEqual([expenses[4].id]);
  });

  it("flags a missing retention in a category that usually withholds", () => {
    const expenses = [
      mk({ category: "Servicios profesionales", amount: 200, irpfRate: 15 }),
      mk({ category: "Servicios profesionales", amount: 200, irpfRate: 15 }),
      mk({ category: "Servicios profesionales", amount: 200, irpfRate: 15 }),
      mk({ category: "Servicios profesionales", amount: 200, irpfRate: 15 }),
      mk({ category: "Servicios profesionales", amount: 200, irpfRate: null }),
    ];
    const hits = detectExpenseAnomalies(expenses).filter((a) => a.kind === "irpf-mismatch");
    expect(hits).toHaveLength(1);
    expect(hits[0].params.variant).toBe("missing");
    expect(hits[0].params.expected).toBe(15);
  });

  it("flags a retention rate well off the category norm", () => {
    const expenses = [
      mk({ category: "Servicios profesionales", amount: 200, irpfRate: 15 }),
      mk({ category: "Servicios profesionales", amount: 200, irpfRate: 15 }),
      mk({ category: "Servicios profesionales", amount: 200, irpfRate: 15 }),
      mk({ category: "Servicios profesionales", amount: 200, irpfRate: 15 }),
      mk({ category: "Servicios profesionales", amount: 200, irpfRate: 7 }),
    ];
    const hits = detectExpenseAnomalies(expenses).filter((a) => a.kind === "irpf-mismatch");
    expect(hits).toHaveLength(1);
    expect(hits[0].params.variant).toBe("rateOff");
  });

  it("stays silent on a genuinely mixed category", () => {
    const expenses = [
      mk({ category: "Mixto", amount: 50, irpfRate: 15 }),
      mk({ category: "Mixto", amount: 50, irpfRate: 15 }),
      mk({ category: "Mixto", amount: 50, irpfRate: null }),
      mk({ category: "Mixto", amount: 50, irpfRate: null }),
    ];
    expect(detectExpenseAnomalies(expenses).filter((a) => a.kind === "irpf-mismatch")).toHaveLength(
      0,
    );
  });

  it("needs at least 3 expenses in the category", () => {
    const expenses = [
      mk({ category: "Rara", amount: 50, irpfRate: null }),
      mk({ category: "Rara", amount: 50, irpfRate: 15 }),
    ];
    expect(detectExpenseAnomalies(expenses).filter((a) => a.kind === "irpf-mismatch")).toHaveLength(
      0,
    );
  });
});

describe("detectExpenseAnomalies — category-outlier", () => {
  it("flags a single expense far above the category median", () => {
    const expenses = [
      mk({ category: "Material", amount: 40 }),
      mk({ category: "Material", amount: 50 }),
      mk({ category: "Material", amount: 60 }),
      mk({ category: "Material", amount: 50 }),
      mk({ category: "Material", amount: 500 }),
    ];
    const hits = detectExpenseAnomalies(expenses).filter((a) => a.kind === "category-outlier");
    expect(hits).toHaveLength(1);
    expect(hits[0].expenseIds).toEqual([expenses[4].id]);
    expect(hits[0].params.multiple).toBe(10);
  });

  it("needs at least 4 expenses in the category", () => {
    const expenses = [
      mk({ category: "Poco", amount: 10 }),
      mk({ category: "Poco", amount: 10 }),
      mk({ category: "Poco", amount: 900 }),
    ];
    expect(
      detectExpenseAnomalies(expenses).filter((a) => a.kind === "category-outlier"),
    ).toHaveLength(0);
  });
});

describe("detectExpenseAnomalies — misc", () => {
  it("returns nothing for an empty list", () => {
    expect(detectExpenseAnomalies([])).toEqual([]);
  });

  it("orders warnings before info", () => {
    const expenses = [
      mk({ provider: "Acme", amount: 121, date: "2025-11-03" }),
      mk({ provider: "Acme", amount: 121, date: "2025-11-05" }),
      mk({ category: "Material", amount: 40 }),
      mk({ category: "Material", amount: 50 }),
      mk({ category: "Material", amount: 60 }),
      mk({ category: "Material", amount: 50 }),
      mk({ category: "Material", amount: 500 }),
    ];
    const kinds = detectExpenseAnomalies(expenses).map((a) => a.severity);
    expect(kinds.indexOf("warning")).toBeLessThan(kinds.indexOf("info"));
  });

  it("gives an anomaly a stable, order-independent signature", () => {
    const expenses = [
      mk({ id: 7, provider: "Acme", amount: 121, date: "2025-11-05" }),
      mk({ id: 3, provider: "Acme", amount: 121, date: "2025-11-03" }),
    ];
    const [dup] = detectExpenseAnomalies(expenses);
    expect(anomalySignature(dup)).toBe("duplicate:3,7");
  });

  it("respects a custom duplicate window", () => {
    const expenses = [
      mk({ provider: "Acme", amount: 121, date: "2025-11-03" }),
      mk({ provider: "Acme", amount: 121, date: "2025-11-10" }),
    ];
    expect(detectExpenseAnomalies(expenses, { duplicateWindowDays: 3 })).toHaveLength(0);
    expect(
      detectExpenseAnomalies(expenses, { duplicateWindowDays: 10 }).filter(
        (a) => a.kind === "duplicate",
      ),
    ).toHaveLength(1);
  });
});
