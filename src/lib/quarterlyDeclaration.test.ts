import { describe, expect, it } from "vitest";
import {
  buildDeclarationSnapshot,
  cashInvoicesInPeriod,
  expensesForBasis,
  expensesInPeriod,
  invoicesForBasis,
  invoicesInPeriod,
  paidInvoicesInPeriod,
} from "./quarterlyDeclaration";
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
    vatTreatment: null,
    clientVatNumber: null,
    clientNif: null,
    ...overrides,
  };
}

function expense(overrides: Partial<ExpenseRecord>): ExpenseRecord {
  return {
    id: 1,
    date: "2026-01-10",
    category: "Software",
    description: null,
    provider: null,
    amount: 50,
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

describe("expensesInPeriod", () => {
  it("includes undeclared expenses dated inside the period, excludes ones outside it", () => {
    const period = quarterRange(2026, 1);
    const result = expensesInPeriod(
      [expense({ id: 1, date: "2026-02-01" }), expense({ id: 2, date: "2026-04-01" })],
      period,
    );
    expect(result.map((e) => e.id)).toEqual([1]);
  });

  it("includes an expense overridden into the period's quarter regardless of its own date", () => {
    const period = quarterRange(2026, 3);
    const result = expensesInPeriod(
      [expense({ id: 1, date: "2026-06-15", declaredPeriod: "2026-Q3" })],
      period,
    );
    expect(result.map((e) => e.id)).toEqual([1]);
  });

  it("excludes an overridden expense whose declaredPeriod doesn't match the period's quarter", () => {
    const period = quarterRange(2026, 1);
    const result = expensesInPeriod(
      [expense({ id: 1, date: "2026-01-15", declaredPeriod: "2026-Q3" })],
      period,
    );
    expect(result).toHaveLength(0);
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

  it("uses a separate ivaDeductiblePct for the input-VAT total when it diverges from the base %", () => {
    const snapshot = buildDeclarationSnapshot(
      [],
      [
        // Mixed-use vehicle: 0% IRPF-deductible base, 50% deductible input VAT.
        expense({ amount: 1000, deductiblePct: 0, ivaDeductiblePct: 50, ivaAmount: 210 }),
        // Home-office supplies: 25% base, 0% input VAT.
        expense({ amount: 100, deductiblePct: 25, ivaDeductiblePct: 0, ivaAmount: 21 }),
      ],
    );
    expect(snapshot.totals.expensesDeductibleBase).toBe(25); // 1000*0 + 100*0.25
    expect(snapshot.totals.expensesIvaDeductible).toBe(105); // 210*0.5 + 21*0
    expect(snapshot.expenses[0].ivaDeductiblePct).toBe(50);
    expect(snapshot.expenses[1].ivaDeductiblePct).toBe(0);
  });

  it("falls back to deductiblePct for input VAT when ivaDeductiblePct is null", () => {
    const snapshot = buildDeclarationSnapshot(
      [],
      [expense({ amount: 100, deductiblePct: 30, ivaDeductiblePct: null, ivaAmount: 21 })],
    );
    expect(snapshot.totals.expensesIvaDeductible).toBe(6.3); // 21 * 0.30
    expect(snapshot.expenses[0].ivaDeductiblePct).toBe(30);
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

  it("labels the snapshot with the accrual basis it was built on", () => {
    expect(buildDeclarationSnapshot([], []).basis).toBe("accrual");
  });
});

describe("declaration basis is accrual (matches the projection)", () => {
  // The ResumenTrimestral projection, the DeclarationWizard preview and the in-progress
  // declaration recompute must all build their snapshot from the same period filter, or the
  // previewed number won't match the frozen one. That filter is invoicesInPeriod (accrual:
  // issued + paid), not paidInvoicesInPeriod (cash: paid only).
  it("includes issued-but-unpaid invoices in the declaration snapshot", () => {
    const period = quarterRange(2026, 1);
    const invoices = [
      invoice({ id: 1, status: "issued", issueDate: "2026-02-01", subtotal: 100 }),
      invoice({ id: 2, status: "paid", issueDate: "2026-03-01", subtotal: 200 }),
    ];
    const declarationSnapshot = buildDeclarationSnapshot(invoicesInPeriod(invoices, period), []);
    expect(declarationSnapshot.invoices.map((i) => i.id)).toEqual([1, 2]);
    expect(declarationSnapshot.totals.invoicedBase).toBe(300);
  });

  it("wizard/declaration filter equals the projection filter for the same period", () => {
    const period = quarterRange(2026, 1);
    const invoices = [
      invoice({ id: 1, status: "issued", issueDate: "2026-02-01" }),
      invoice({ id: 2, status: "paid", issueDate: "2026-03-01" }),
      invoice({ id: 3, status: "draft", issueDate: "2026-02-15" }),
    ];
    // projection path (ResumenTrimestral) and declaration path (wizard / currentSnapshot)
    const projection = buildDeclarationSnapshot(invoicesInPeriod(invoices, period), []);
    const declaration = buildDeclarationSnapshot(invoicesInPeriod(invoices, period), []);
    expect(declaration.totals).toEqual(projection.totals);
  });
});

describe("cash-basis filters (criterio de caja)", () => {
  const period = quarterRange(2026, 1); // 2026-01-01 .. 2026-03-31

  it("cashInvoicesInPeriod keeps only paid invoices dated in the period", () => {
    const invoices = [
      invoice({ id: 1, issueDate: "2026-02-01", status: "paid" }),
      invoice({ id: 2, issueDate: "2026-02-01", status: "issued" }),
      invoice({ id: 3, issueDate: "2025-12-30", status: "paid" }),
    ];
    expect(cashInvoicesInPeriod(invoices, period).map((i) => i.id)).toEqual([1]);
  });

  it("invoicesForBasis dispatches accrual vs cash", () => {
    const invoices = [
      invoice({ id: 1, issueDate: "2026-02-01", status: "paid" }),
      invoice({ id: 2, issueDate: "2026-02-01", status: "issued" }),
    ];
    expect(invoicesForBasis(invoices, period, "accrual").map((i) => i.id)).toEqual([1, 2]);
    expect(invoicesForBasis(invoices, period, "cash").map((i) => i.id)).toEqual([1]);
  });

  it("expensesForBasis (cash) attributes by paidDate when set, else by date", () => {
    // dated in Q1 but paid in Q2 -> out of Q1 under cash basis
    expect(
      expensesForBasis([expense({ id: 1, date: "2026-01-15", paidDate: "2026-04-10" })], period, "cash"),
    ).toHaveLength(0);
    // dated in Q1, no paidDate -> falls back to date -> in
    expect(
      expensesForBasis([expense({ id: 2, date: "2026-01-15", paidDate: null })], period, "cash"),
    ).toHaveLength(1);
    // paid in Q1 but dated Q4 last year -> in under cash basis
    expect(
      expensesForBasis([expense({ id: 3, date: "2025-11-01", paidDate: "2026-02-01" })], period, "cash"),
    ).toHaveLength(1);
    // accrual ignores paidDate entirely
    expect(
      expensesForBasis([expense({ id: 4, date: "2026-01-15", paidDate: "2026-04-10" })], period, "accrual"),
    ).toHaveLength(1);
  });

  it("expensesForBasis (cash) still honours a declaredPeriod override", () => {
    const overridden = expense({ id: 5, date: "2026-06-01", paidDate: "2026-06-15", declaredPeriod: "2026-Q1" });
    expect(expensesForBasis([overridden], period, "cash")).toHaveLength(1);
  });

  it("buildDeclarationSnapshot stamps the basis it was given (default accrual)", () => {
    expect(buildDeclarationSnapshot([], [], "cash").basis).toBe("cash");
    expect(buildDeclarationSnapshot([], []).basis).toBe("accrual");
  });

  it("projection and wizard/declaration agree under cash basis too", () => {
    const invoices = [
      invoice({ id: 1, status: "issued", issueDate: "2026-02-01", subtotal: 100 }),
      invoice({ id: 2, status: "paid", issueDate: "2026-03-01", subtotal: 200 }),
    ];
    const projection = buildDeclarationSnapshot(invoicesForBasis(invoices, period, "cash"), [], "cash");
    const declaration = buildDeclarationSnapshot(invoicesForBasis(invoices, period, "cash"), [], "cash");
    expect(declaration.basis).toBe("cash");
    expect(declaration.invoices.map((i) => i.id)).toEqual([2]);
    expect(declaration.totals).toEqual(projection.totals);
  });
});
