import { describe, expect, it } from "vitest";
import { annualPnl, annualTotals, multiYearSummary } from "./annualSummary";
import type { InvoiceListItem } from "../db/invoices";
import type { ExpenseRecord } from "../db/expenses";

function invoice(overrides: Partial<InvoiceListItem>): InvoiceListItem {
  return {
    id: 1,
    clientId: 1,
    clientName: "Acme",
    seriesPrefix: "A",
    invoiceNumber: 1,
    issueDate: "2025-03-10",
    dueDate: "2025-04-09",
    status: "issued",
    isRectification: false,
    rectifiesInvoiceId: null,
    rectifiedByInvoiceId: null,
    subtotal: 1000,
    ivaRate: 21,
    ivaAmount: 210,
    irpfRate: 15,
    irpfAmount: 150,
    total: 1060,
    pdfPath: null,
    clientCountry: null,
    vatTreatment: null,
    clientVatNumber: null,
    clientNif: null,
    ...overrides,
  };
}

function expense(overrides: Partial<ExpenseRecord>): ExpenseRecord {
  return {
    id: 1,
    date: "2025-05-10",
    category: "Software",
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
    declared: false,
    paidDate: null,
    ...overrides,
  };
}

describe("annualTotals", () => {
  const invoices = [
    invoice({ id: 1, issueDate: "2025-02-01", subtotal: 1000 }),
    invoice({ id: 2, issueDate: "2025-11-01", subtotal: 500 }),
    invoice({ id: 3, issueDate: "2024-06-01", subtotal: 9999 }),
    invoice({ id: 4, issueDate: "2025-01-01", subtotal: 300, status: "draft" }),
  ];
  const expenses = [
    expense({ id: 1, date: "2025-03-01", amount: 200, deductiblePct: 100 }),
    expense({ id: 2, date: "2025-09-01", amount: 100, deductiblePct: 50 }),
    expense({ id: 3, date: "2024-09-01", amount: 4444 }),
  ];

  it("sums non-draft invoices and deductible expense base for the year", () => {
    const t = annualTotals(invoices, expenses, 2025);
    expect(t.revenue).toBe(1500);
    expect(t.expenses).toBe(250); // 200 + 100*50%
    expect(t.net).toBe(1250);
  });

  it("isolates the requested year", () => {
    expect(annualTotals(invoices, expenses, 2024).revenue).toBe(9999);
  });
});

describe("multiYearSummary", () => {
  it("orders years ascending and computes YoY against the prior row", () => {
    const invoices = [
      invoice({ id: 1, issueDate: "2024-05-01", subtotal: 1000 }),
      invoice({ id: 2, issueDate: "2025-05-01", subtotal: 1500 }),
    ];
    const rows = multiYearSummary(invoices, [], [2025, 2024]);
    expect(rows.map((r) => r.year)).toEqual([2024, 2025]);
    expect(rows[0].revenueYoY).toBeNull();
    expect(rows[1].revenueYoY).toBeCloseTo(50);
  });
});

describe("annualPnl", () => {
  it("breaks revenue out by client and expenses by category", () => {
    const invoices = [
      invoice({ id: 1, clientName: "Acme", issueDate: "2025-02-01", subtotal: 1000 }),
      invoice({ id: 2, clientName: "Acme", issueDate: "2025-06-01", subtotal: 400 }),
      invoice({ id: 3, clientName: "Globex", issueDate: "2025-06-01", subtotal: 700 }),
    ];
    const expenses = [
      expense({ id: 1, category: "Software", date: "2025-03-01", amount: 300 }),
      expense({ id: 2, category: "Viajes", date: "2025-04-01", amount: 100 }),
    ];
    const pnl = annualPnl(invoices, expenses, 2025);
    expect(pnl.byClient).toEqual([
      { clientName: "Acme", base: 1400 },
      { clientName: "Globex", base: 700 },
    ]);
    expect(pnl.byCategory[0]).toEqual({ category: "Software", total: 300 });
    expect(pnl.totalRevenue).toBe(2100);
    expect(pnl.totalExpenses).toBe(400);
    expect(pnl.net).toBe(1700);
  });
});
