import { describe, expect, it } from "vitest";
import { buildAssistantContext } from "./assistantContext";
import type { InvoiceListItem } from "../db/invoices";
import type { ExpenseRecord } from "../db/expenses";

function invoice(overrides: Partial<InvoiceListItem>): InvoiceListItem {
  return {
    id: 1,
    clientId: 1,
    clientName: "Acme",
    seriesPrefix: "AAA",
    invoiceNumber: 1,
    issueDate: "2026-08-10",
    dueDate: "2026-09-09",
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
    amountPaid: 0,
    paidDate: null,
    ...overrides,
  };
}

function expense(overrides: Partial<ExpenseRecord>): ExpenseRecord {
  return {
    id: 1,
    date: "2026-08-05",
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
    ...overrides,
  };
}

const TODAY = "2026-09-02"; // Q3 2026

describe("buildAssistantContext", () => {
  it("reports current-quarter and YTD invoiced base off the shared selectors", () => {
    const ctx = buildAssistantContext({
      invoices: [
        invoice({ id: 1, issueDate: "2026-08-10", subtotal: 1000 }), // Q3 + YTD
        invoice({ id: 2, issueDate: "2026-02-01", subtotal: 400 }), // YTD only
        invoice({ id: 3, issueDate: "2025-11-01", subtotal: 999 }), // neither
      ],
      expenses: [expense({ id: 1, date: "2026-08-05", amount: 100 })],
      userContextMd: "",
      todayIso: TODAY,
    });

    expect(ctx).toContain("Trimestre en curso: 3T 2026");
    expect(ctx).toContain("Base facturada: 1.000,00 € (1 facturas)");
    expect(ctx).toContain("Base facturada: 1.400,00 € (2 facturas)");
  });

  it("summarises pending invoices, drafts and top clients", () => {
    const ctx = buildAssistantContext({
      invoices: [
        invoice({
          id: 1,
          clientId: 1,
          clientName: "Big Co",
          status: "issued",
          total: 1060,
          amountPaid: 0,
        }),
        invoice({
          id: 2,
          clientId: 2,
          clientName: "Small Co",
          status: "paid",
          total: 500,
          amountPaid: 500,
        }),
        invoice({ id: 3, status: "draft" }),
      ],
      expenses: [],
      userContextMd: "",
      todayIso: TODAY,
    });

    expect(ctx).toContain("Facturas emitidas sin cobrar: 1 por 1.060,00 €");
    expect(ctx).toContain("Facturas en borrador: 1");
    expect(ctx).toContain("- Big Co: 1.060,00 €");
    expect(ctx).toContain("Próximos vencimientos fiscales");
  });

  it("appends contexto_usuario.md when present and omits the section when blank", () => {
    const base = { invoices: [], expenses: [], todayIso: TODAY };

    const withCtx = buildAssistantContext({
      ...base,
      userContextMd: "# Negocio\n\nDesarrollo web.",
    });
    expect(withCtx).toContain("## Contexto del negocio (contexto_usuario.md)");
    expect(withCtx).toContain("Desarrollo web.");

    const withoutCtx = buildAssistantContext({ ...base, userContextMd: "   " });
    expect(withoutCtx).not.toContain("Contexto del negocio");
    expect(withoutCtx).toContain("(sin facturas emitidas este año)");
  });
});
