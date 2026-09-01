import { describe, expect, it } from "vitest";
import { dueRecurringDrafts, nextBillingDate, recurringInvoiceCandidates } from "./recurring";
import type { InvoiceListItem } from "../db/invoices";
import type { ContractRecord } from "../db/contracts";

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
    clientCountry: null,
    vatTreatment: null,
    clientVatNumber: null,
    clientNif: null,
    ...overrides,
  };
}

function contract(overrides: Partial<ContractRecord>): ContractRecord {
  return {
    id: 1,
    clientId: 1,
    title: "Retainer",
    filePath: null,
    startDate: "2026-01-01",
    endDate: null,
    status: "active",
    notes: null,
    billingCadence: "monthly",
    nextInvoiceDate: "2026-08-01",
    ...overrides,
  };
}

describe("nextBillingDate", () => {
  it("advances by one month", () => {
    expect(nextBillingDate("2026-08-01", "monthly")).toBe("2026-09-01");
  });

  it("advances by a quarter", () => {
    expect(nextBillingDate("2026-08-15", "quarterly")).toBe("2026-11-15");
  });

  it("advances by a year", () => {
    expect(nextBillingDate("2026-02-28", "yearly")).toBe("2027-02-28");
  });

  it("rolls the year over", () => {
    expect(nextBillingDate("2026-12-10", "monthly")).toBe("2027-01-10");
  });

  it("clamps a month-end anchor to the shorter target month", () => {
    expect(nextBillingDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextBillingDate("2026-03-31", "monthly")).toBe("2026-04-30");
  });
});

describe("recurringInvoiceCandidates", () => {
  it("flags a cadence contract that is due, cloning the client's last invoice", () => {
    const result = recurringInvoiceCandidates(
      [invoice({ id: 7, clientId: 1, issueDate: "2026-07-10", total: 200 })],
      [contract({ clientId: 1, nextInvoiceDate: "2026-08-01" })],
      "2026-08-02",
    );
    expect(result).toEqual([
      { clientId: 1, clientName: "Acme", lastInvoiceId: 7, lastInvoiceTotal: 200, dueDate: "2026-08-01" },
    ]);
  });

  it("does not flag a cadence contract whose next date is still in the future", () => {
    const result = recurringInvoiceCandidates(
      [invoice({ clientId: 1, issueDate: "2026-07-10" })],
      [contract({ clientId: 1, nextInvoiceDate: "2026-09-01" })],
      "2026-08-02",
    );
    expect(result).toEqual([]);
  });

  it("skips a due contract when the client has no invoice to clone", () => {
    const result = recurringInvoiceCandidates(
      [],
      [contract({ clientId: 1, nextInvoiceDate: "2026-08-01" })],
      "2026-08-02",
    );
    expect(result).toEqual([]);
  });

  it("ignores inactive contracts and cadence 'none'", () => {
    const result = recurringInvoiceCandidates(
      [invoice({ clientId: 1, issueDate: "2026-07-10" })],
      [
        contract({ id: 1, clientId: 1, status: "terminated", nextInvoiceDate: "2026-08-01" }),
        contract({ id: 2, clientId: 1, billingCadence: "none", nextInvoiceDate: "2026-08-01" }),
      ],
      "2026-08-02",
    );
    // Falls through to the heuristic (invoiced last month, not this) instead.
    expect(result).toEqual([
      { clientId: 1, clientName: "Acme", lastInvoiceId: 1, lastInvoiceTotal: 106, dueDate: null },
    ]);
  });

  it("falls back to the month heuristic for clients with no active cadence contract", () => {
    const result = recurringInvoiceCandidates(
      [invoice({ id: 1, clientId: 2, clientName: "Beta", issueDate: "2026-07-10" })],
      [],
      "2026-08-02",
    );
    expect(result).toEqual([
      { clientId: 2, clientName: "Beta", lastInvoiceId: 1, lastInvoiceTotal: 106, dueDate: null },
    ]);
  });

  it("does not double-count a client covered by both a cadence contract and the heuristic", () => {
    const result = recurringInvoiceCandidates(
      [invoice({ id: 1, clientId: 1, issueDate: "2026-07-10" })],
      [contract({ clientId: 1, nextInvoiceDate: "2026-08-01" })],
      "2026-08-02",
    );
    expect(result).toHaveLength(1);
    expect(result[0].dueDate).toBe("2026-08-01");
  });

  it("excludes a heuristic client already invoiced this month", () => {
    const result = recurringInvoiceCandidates(
      [
        invoice({ id: 1, clientId: 1, issueDate: "2026-07-10" }),
        invoice({ id: 2, clientId: 1, issueDate: "2026-08-01" }),
      ],
      [],
      "2026-08-02",
    );
    expect(result).toEqual([]);
  });
});

describe("dueRecurringDrafts", () => {
  it("returns one task per due contract, advancing the anchor past today", () => {
    const result = dueRecurringDrafts(
      [contract({ id: 3, clientId: 1, nextInvoiceDate: "2026-08-01" })],
      [invoice({ id: 9, clientId: 1, issueDate: "2026-07-10" })],
      "2026-08-05",
    );
    expect(result).toEqual([
      { contractId: 3, templateInvoiceId: 9, newNextDate: "2026-09-01" },
    ]);
  });

  it("fast-forwards a long-stale anchor to the first date after today (no backfill)", () => {
    const result = dueRecurringDrafts(
      [contract({ id: 3, clientId: 1, billingCadence: "monthly", nextInvoiceDate: "2026-01-01" })],
      [invoice({ id: 9, clientId: 1, issueDate: "2025-12-10" })],
      "2026-08-05",
    );
    expect(result).toHaveLength(1);
    expect(result[0].newNextDate).toBe("2026-09-01");
  });

  it("skips contracts not yet due, inactive, or with no clonable invoice", () => {
    expect(
      dueRecurringDrafts(
        [contract({ nextInvoiceDate: "2026-09-01" })],
        [invoice({ clientId: 1, issueDate: "2026-07-10" })],
        "2026-08-05",
      ),
    ).toEqual([]);
    expect(
      dueRecurringDrafts([contract({ nextInvoiceDate: "2026-08-01" })], [], "2026-08-05"),
    ).toEqual([]);
  });
});
