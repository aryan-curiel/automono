import { describe, expect, it } from "vitest";
import { buildDeclarationSnapshot, invoicesInPeriod, paidInvoicesInPeriod } from "./quarterlyDeclaration";
import { quarterRange } from "./dateRange";
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
    irpfRate: null,
    irpfAmount: null,
    receiptFilePath: null,
    declaredPeriod: null,
    declared: false,
    ...overrides,
  };
}

describe("invoicesInPeriod", () => {
  it("includes issued and paid invoices, excludes drafts, filters by issue date", () => {
    const period = quarterRange(2026, 1);
    const result = invoicesInPeriod(
      [
        invoice({ id: 1, status: "issued", issueDate: "2026-02-01" }),
        invoice({ id: 2, status: "paid", issueDate: "2026-03-01" }),
        invoice({ id: 3, status: "draft", issueDate: "2026-02-01" }),
        invoice({ id: 4, status: "issued", issueDate: "2026-04-01" }),
      ],
      period,
    );
    expect(result.map((i) => i.id)).toEqual([1, 2]);
  });
});

describe("paidInvoicesInPeriod", () => {
  it("only includes paid invoices in the period, excluding issued/draft", () => {
    const period = quarterRange(2026, 1);
    const result = paidInvoicesInPeriod(
      [
        invoice({ id: 1, status: "issued", issueDate: "2026-02-01" }),
        invoice({ id: 2, status: "paid", issueDate: "2026-03-01" }),
        invoice({ id: 3, status: "paid", issueDate: "2026-04-01" }),
      ],
      period,
    );
    expect(result.map((i) => i.id)).toEqual([2]);
  });
});

describe("buildDeclarationSnapshot", () => {
  it("aggregates IVA by rate across multiple rates", () => {
    const snapshot = buildDeclarationSnapshot(
      [
        invoice({ id: 1, subtotal: 100, ivaRate: 21, ivaAmount: 21 }),
        invoice({ id: 2, subtotal: 200, ivaRate: 21, ivaAmount: 42 }),
        invoice({ id: 3, subtotal: 50, ivaRate: 0, ivaAmount: 0 }),
      ],
      [],
    );
    expect(snapshot.totals.ivaByRate).toEqual(
      expect.arrayContaining([
        { rate: 21, base: 300, iva: 63 },
        { rate: 0, base: 50, iva: 0 },
      ]),
    );
    expect(snapshot.totals.invoicedBase).toBe(350);
  });

  it("computes IRPF, deductible expenses, and net/margin totals", () => {
    const snapshot = buildDeclarationSnapshot(
      [invoice({ subtotal: 1000, irpfAmount: 150 })],
      [
        expense({ amount: 100, deductiblePct: 50, ivaAmount: 21, irpfAmount: 10 }),
        expense({ amount: 200, deductiblePct: 100, ivaAmount: 42, irpfAmount: 0 }),
      ],
    );
    // deductible base: 100*0.5 + 200*1 = 250; deductible IVA: 21*0.5 + 42*1 = 52.5
    expect(snapshot.totals.expensesDeductibleBase).toBe(250);
    expect(snapshot.totals.expensesIvaDeductible).toBe(52.5);
    expect(snapshot.totals.expensesIrpfWithheld).toBe(10);
    expect(snapshot.totals.irpfWithheld).toBe(150);
    expect(snapshot.totals.netIrpfIncome).toBe(750); // 1000 - 250
    expect(snapshot.totals.margin).toBe(600); // 750 - 150
  });

  it("respects a declaredPeriod override already applied by the caller's filtering", () => {
    // buildDeclarationSnapshot itself does no date filtering — it trusts the caller (e.g.
    // listExpenses({ quarterKeys }) already applied the declaredPeriod override.
    const juneExpenseDeclaredInQ3 = expense({
      date: "2026-06-15",
      declaredPeriod: "2026-Q3",
      amount: 80,
      deductiblePct: 100,
    });
    const snapshot = buildDeclarationSnapshot([], [juneExpenseDeclaredInQ3]);
    expect(snapshot.expenses).toHaveLength(1);
    expect(snapshot.totals.expensesDeductibleBase).toBe(80);
  });

  it("maps invoice and expense line items into snapshot shape", () => {
    const snapshot = buildDeclarationSnapshot(
      [invoice({ id: 5, seriesPrefix: "AAA", invoiceNumber: 12, clientName: "Beta" })],
      [expense({ id: 9, description: "Rent" })],
    );
    expect(snapshot.invoices[0]).toMatchObject({ id: 5, number: "AAA-12", clientName: "Beta" });
    expect(snapshot.expenses[0]).toMatchObject({ id: 9, description: "Rent" });
  });
});
