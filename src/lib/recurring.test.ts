import { describe, expect, it } from "vitest";
import { recurringInvoiceCandidates } from "./recurring";
import type { InvoiceListItem } from "../db/invoices";

function invoice(overrides: Partial<InvoiceListItem>): InvoiceListItem {
  return {
    id: 1,
    clientId: 1,
    clientName: "Acme",
    seriesPrefix: "AAA",
    invoiceNumber: 1,
    issueDate: "2026-07-10",
    dueDate: "2026-08-09",
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
    ...overrides,
  };
}

describe("recurringInvoiceCandidates", () => {
  it("flags a client invoiced last month but not yet this month", () => {
    const result = recurringInvoiceCandidates(
      [invoice({ id: 1, clientId: 1, clientName: "Acme", issueDate: "2026-07-10" })],
      "2026-08-02",
    );
    expect(result).toEqual([
      { clientId: 1, clientName: "Acme", lastInvoiceId: 1, lastInvoiceTotal: 106 },
    ]);
  });

  it("excludes a client already invoiced this month", () => {
    const result = recurringInvoiceCandidates(
      [
        invoice({ id: 1, clientId: 1, issueDate: "2026-07-10" }),
        invoice({ id: 2, clientId: 1, issueDate: "2026-08-01" }),
      ],
      "2026-08-02",
    );
    expect(result).toEqual([]);
  });

  it("excludes a client with no invoice last month", () => {
    const result = recurringInvoiceCandidates(
      [invoice({ id: 1, clientId: 1, issueDate: "2026-06-10" })],
      "2026-08-02",
    );
    expect(result).toEqual([]);
  });

  it("ignores drafts (no issue date) for both months", () => {
    const result = recurringInvoiceCandidates(
      [invoice({ id: 1, clientId: 1, issueDate: null, status: "draft" })],
      "2026-08-02",
    );
    expect(result).toEqual([]);
  });

  it("picks the most recent invoice when a client had several last month", () => {
    const result = recurringInvoiceCandidates(
      [
        invoice({ id: 1, clientId: 1, issueDate: "2026-07-05", total: 50 }),
        invoice({ id: 2, clientId: 1, issueDate: "2026-07-25", total: 75 }),
      ],
      "2026-08-02",
    );
    expect(result).toEqual([
      { clientId: 1, clientName: "Acme", lastInvoiceId: 2, lastInvoiceTotal: 75 },
    ]);
  });

  it("rolls over correctly from January into the prior December", () => {
    const result = recurringInvoiceCandidates(
      [invoice({ id: 1, clientId: 1, issueDate: "2025-12-15" })],
      "2026-01-10",
    );
    expect(result).toEqual([
      { clientId: 1, clientName: "Acme", lastInvoiceId: 1, lastInvoiceTotal: 106 },
    ]);
  });
});
