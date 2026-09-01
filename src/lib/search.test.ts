import { describe, expect, it } from "vitest";
import { searchEntities } from "./search";
import type { ClientRecord } from "../db/clients";
import type { InvoiceListItem } from "../db/invoices";
import type { ContractRecord } from "../db/contracts";

function client(overrides: Partial<ClientRecord>): ClientRecord {
  return {
    id: 1,
    name: "Acme Corp",
    nifCif: "B12345678",
    vatNumber: null,
    address: null,
    email: null,
    phone: null,
    notes: null,
    seriesId: 1,
    seriesPrefix: "AAA",
    nextInvoiceNumber: 1,
    nextRectificationNumber: 1,
    vatTreatment: "standard",
    invoiceLanguage: "es",
    country: null,
    ...overrides,
  };
}

function invoice(overrides: Partial<InvoiceListItem>): InvoiceListItem {
  return {
    id: 1,
    clientId: 1,
    clientName: "Acme Corp",
    seriesPrefix: "AAA",
    invoiceNumber: 14,
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
    title: "Contrato de mantenimiento",
    filePath: null,
    startDate: "2026-01-01",
    endDate: null,
    status: "active",
    notes: null,
    billingCadence: "none",
    nextInvoiceDate: null,
    ...overrides,
  };
}

describe("searchEntities", () => {
  it("returns nothing for a blank query", () => {
    expect(searchEntities("", [client({})], [invoice({})], [contract({})])).toEqual([]);
    expect(searchEntities("   ", [client({})], [invoice({})], [contract({})])).toEqual([]);
  });

  it("matches clients by name, case-insensitively", () => {
    const results = searchEntities("acme", [client({ id: 1, name: "Acme Corp" })], [], []);
    expect(results).toEqual([{ type: "client", id: 1, label: "Acme Corp", subtitle: "B12345678" }]);
  });

  it("matches clients by NIF/CIF", () => {
    const results = searchEntities("b1234", [client({ id: 1, nifCif: "B12345678" })], [], []);
    expect(results).toHaveLength(1);
  });

  it("matches invoices by number label or client name", () => {
    const results = searchEntities(
      "AAA-014",
      [],
      [
        invoice({
          id: 5,
          seriesPrefix: "AAA",
          invoiceNumber: 14,
          clientName: "Acme Corp",
          total: 106,
        }),
      ],
      [],
    );
    expect(results).toEqual([{ type: "invoice", id: 5, label: "AAA-014", subtitle: "Acme Corp" }]);
  });

  it("matches contracts by title, with the client name as subtitle", () => {
    const results = searchEntities(
      "mantenimiento",
      [client({ id: 2, name: "Beta SL" })],
      [],
      [contract({ id: 3, title: "Contrato de mantenimiento", clientId: 2 })],
    );
    expect(results).toEqual([
      { type: "contract", id: 3, label: "Contrato de mantenimiento", subtitle: "Beta SL" },
    ]);
  });

  it("caps results at 20 across all entity types", () => {
    const clients = Array.from({ length: 30 }, (_, i) =>
      client({ id: i, name: `Cliente Uno ${i}` }),
    );
    const results = searchEntities("cliente uno", clients, [], []);
    expect(results).toHaveLength(20);
  });
});
