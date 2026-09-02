import { describe, expect, it } from "vitest";
import { quarterlyTrendData, recentQuarterKeys } from "./quarterlyTrends";
import type { InvoiceListItem } from "../db/invoices";
import type { ExpenseRecord } from "../db/expenses";

function invoice(o: Partial<InvoiceListItem>): InvoiceListItem {
  return {
    id: 1,
    clientId: 1,
    clientName: "Acme",
    seriesPrefix: "AAA",
    invoiceNumber: 1,
    issueDate: "2026-02-10",
    dueDate: "2026-03-12",
    status: "issued",
    isRectification: false,
    rectifiesInvoiceId: null,
    rectifiedByInvoiceId: null,
    subtotal: 100,
    ivaRate: 21,
    ivaAmount: 21,
    irpfRate: 0,
    irpfAmount: 0,
    total: 121,
    pdfPath: null,
    clientCountry: null,
    vatTreatment: null,
    clientVatNumber: null,
    clientNif: null,
    amountPaid: 0,
    paidDate: null,
    ...o,
  };
}

function expense(o: Partial<ExpenseRecord>): ExpenseRecord {
  return {
    id: 1,
    date: "2026-02-10",
    category: "Software",
    description: null,
    provider: null,
    amount: 100,
    ivaAmount: 21,
    deductiblePct: 100,
    ivaDeductiblePct: null,
    irpfRate: null,
    irpfAmount: null,
    receiptFilePath: null,
    declaredPeriod: null,
    declared: false,
    paidDate: null,
    ...o,
  };
}

describe("recentQuarterKeys", () => {
  it("returns `count` keys ending at the current one, oldest first", () => {
    expect(recentQuarterKeys("2026-Q2", 4)).toEqual(["2025-Q3", "2025-Q4", "2026-Q1", "2026-Q2"]);
  });
});

describe("quarterlyTrendData", () => {
  const invoices = [
    invoice({ id: 1, issueDate: "2026-02-10", ivaAmount: 21, total: 121, status: "issued" }),
    invoice({ id: 2, issueDate: "2026-05-10", ivaAmount: 42, total: 242, status: "paid", amountPaid: 242 }),
  ];
  const expenses = [
    expense({ id: 1, date: "2026-02-10", category: "Software", amount: 100, ivaAmount: 21 }),
    expense({ id: 2, date: "2026-05-10", category: "Viajes", amount: 50, ivaAmount: 0 }),
  ];
  const trends = quarterlyTrendData(invoices, expenses, "2026-Q2", 2);

  it("nets IVA invoiced against deductible IVA per quarter", () => {
    expect(trends.ivaTrendData.map((d) => [d.key, d.value])).toEqual([
      ["2026-Q1", 0], // 21 invoiced - 21 deductible
      ["2026-Q2", 42], // 42 invoiced - 0
    ]);
    expect(trends.ivaTrendData.every((d) => d.label.length > 0)).toBe(true);
  });

  it("splits gross invoiced into paid vs outstanding per quarter", () => {
    expect(trends.paidPendingData.map((d) => [d.key, d.a, d.b])).toEqual([
      ["2026-Q1", 0, 121],
      ["2026-Q2", 242, 0],
    ]);
  });

  it("tracks the largest category's deductible spend per quarter", () => {
    expect(trends.topExpenseCategory).toBe("Software");
    expect(trends.categoryTrendData.map((d) => [d.key, d.value])).toEqual([
      ["2026-Q1", 100],
      ["2026-Q2", 0],
    ]);
  });

  it("leaves topExpenseCategory undefined with no expenses", () => {
    expect(quarterlyTrendData(invoices, [], "2026-Q2", 2).topExpenseCategory).toBeUndefined();
  });
});
