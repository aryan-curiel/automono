import { describe, expect, it } from "vitest";
import {
  agingReport,
  clientBalance,
  expenseByCategory,
  revenueByClient,
  yoyDelta,
} from "./analytics";
import type { InvoiceListItem } from "../db/invoices";
import type { ExpenseRecord } from "../db/expenses";

function invoice(overrides: Partial<InvoiceListItem>): InvoiceListItem {
  return {
    id: 1,
    clientId: 1,
    clientName: "Acme",
    seriesPrefix: "AAA",
    invoiceNumber: 1,
    issueDate: "2026-01-10",
    dueDate: "2026-02-09",
    status: "issued",
    isRectification: false,
    rectifiesInvoiceId: null,
    rectifiedByInvoiceId: null,
    subtotal: 100,
    ivaRate: 21,
    ivaAmount: 21,
    irpfRate: 15,
    irpfAmount: 15,
    total: 106,
    pdfPath: null,
    clientCountry: null,
    ...overrides,
  };
}

function expense(overrides: Partial<ExpenseRecord>): ExpenseRecord {
  return {
    id: 1,
    date: "2026-01-10",
    category: "Software",
    description: null,
    amount: 50,
    ivaAmount: null,
    deductiblePct: 100,
    receiptFilePath: null,
    ...overrides,
  };
}

describe("revenueByClient", () => {
  it("sums totals per client, descending, excluding drafts", () => {
    const result = revenueByClient([
      invoice({ clientId: 1, clientName: "Acme", total: 100 }),
      invoice({ clientId: 1, clientName: "Acme", total: 50 }),
      invoice({ clientId: 2, clientName: "Beta", total: 200 }),
      invoice({ clientId: 3, clientName: "Draft co", total: 999, status: "draft" }),
    ]);
    expect(result).toEqual([
      { clientId: 2, clientName: "Beta", total: 200 },
      { clientId: 1, clientName: "Acme", total: 150 },
    ]);
  });
});

describe("expenseByCategory", () => {
  it("sums amounts per category, descending", () => {
    const result = expenseByCategory([
      expense({ category: "Software", amount: 30 }),
      expense({ category: "Software", amount: 20 }),
      expense({ category: "Viajes", amount: 100 }),
    ]);
    expect(result).toEqual([
      { category: "Viajes", total: 100 },
      { category: "Software", total: 50 },
    ]);
  });

  it("buckets missing/blank category as Sin categoría", () => {
    const result = expenseByCategory([
      expense({ category: null, amount: 10 }),
      expense({ category: "  ", amount: 5 }),
    ]);
    expect(result).toEqual([{ category: "Sin categoría", total: 15 }]);
  });
});

describe("agingReport", () => {
  it("buckets issued invoices by days overdue relative to today", () => {
    const groups = agingReport(
      [
        invoice({ id: 1, status: "issued", dueDate: "2026-08-10", total: 10 }), // not due yet
        invoice({ id: 2, status: "issued", dueDate: "2026-07-20", total: 20 }), // 13 days overdue
        invoice({ id: 3, status: "issued", dueDate: "2026-06-20", total: 30 }), // 43 days overdue
        invoice({ id: 4, status: "issued", dueDate: "2026-04-01", total: 40 }), // 123 days overdue
        invoice({ id: 5, status: "paid", dueDate: "2026-04-01", total: 999 }), // excluded, not issued
      ],
      "2026-08-02",
    );
    expect(groups).toEqual([
      { bucket: "current", total: 10, invoices: [expect.objectContaining({ id: 1 })] },
      { bucket: "0-30", total: 20, invoices: [expect.objectContaining({ id: 2 })] },
      { bucket: "30-60", total: 30, invoices: [expect.objectContaining({ id: 3 })] },
      { bucket: "60+", total: 40, invoices: [expect.objectContaining({ id: 4 })] },
    ]);
  });

  it("ignores invoices without a due date", () => {
    const groups = agingReport([invoice({ status: "issued", dueDate: null })], "2026-08-02");
    expect(groups.every((g) => g.invoices.length === 0)).toBe(true);
  });
});

describe("clientBalance", () => {
  it("sums invoiced (excl. drafts) and paid separately, per client", () => {
    const result = clientBalance(
      [
        invoice({ clientId: 1, status: "paid", total: 100 }),
        invoice({ clientId: 1, status: "issued", total: 50 }),
        invoice({ clientId: 1, status: "draft", total: 999 }),
        invoice({ clientId: 2, status: "paid", total: 200 }),
      ],
      1,
    );
    expect(result).toEqual({ invoiced: 150, paid: 100, outstanding: 50 });
  });

  it("is all zero for a client with no non-draft invoices", () => {
    expect(clientBalance([invoice({ clientId: 1, status: "draft" })], 1)).toEqual({
      invoiced: 0,
      paid: 0,
      outstanding: 0,
    });
  });
});

describe("yoyDelta", () => {
  it("computes percentage change vs a prior value", () => {
    expect(yoyDelta(150, 100)).toBe(50);
    expect(yoyDelta(50, 100)).toBe(-50);
  });

  it("returns null when the prior value is zero (undefined growth)", () => {
    expect(yoyDelta(100, 0)).toBeNull();
  });
});
