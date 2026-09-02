import { describe, expect, it } from "vitest";
import {
  parseStatementCsv,
  detectColumnMapping,
  parseAmount,
  parseStatementDate,
  toStatementLines,
  dedupeKey,
  proposeMatches,
  type MatchableInvoice,
  type StatementLine,
} from "./bankReconcile";

describe("parseStatementCsv", () => {
  it("sniffs a semicolon delimiter (common in Spanish exports)", () => {
    const csv = "Fecha valor;Concepto;Importe\n01/03/2026;TRANSF FROM ACME;1.210,00";
    const parsed = parseStatementCsv(csv);
    expect(parsed.delimiter).toBe(";");
    expect(parsed.headers).toEqual(["Fecha valor", "Concepto", "Importe"]);
    expect(parsed.rows).toEqual([["01/03/2026", "TRANSF FROM ACME", "1.210,00"]]);
  });

  it("handles quoted fields with an embedded delimiter", () => {
    const csv = 'date,amount,description\n2026-03-01,100.00,"Smith, John payment"';
    const parsed = parseStatementCsv(csv);
    expect(parsed.rows[0]).toEqual(["2026-03-01", "100.00", "Smith, John payment"]);
  });

  it("strips a UTF-8 BOM and skips blank lines", () => {
    const csv = "﻿a,b\n1,2\n\n3,4\n";
    expect(parseStatementCsv(csv).rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});

describe("detectColumnMapping", () => {
  it("maps Spanish headers and prefers 'fecha valor' over 'fecha operación'", () => {
    const m = detectColumnMapping([
      "Fecha operación",
      "Fecha valor",
      "Concepto",
      "Importe",
      "Referencia",
    ]);
    expect(m).toEqual({ date: 1, amount: 3, description: 2, reference: 4 });
  });

  it("maps English headers and leaves reference unmapped when absent", () => {
    const m = detectColumnMapping(["Date", "Description", "Amount"]);
    expect(m).toEqual({ date: 0, amount: 2, description: 1, reference: -1 });
  });
});

describe("parseAmount", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["-45,00", -45],
    ["1234.5", 1234.5],
    ["1,50", 1.5],
    ["2.500", 2500],
    ["3.000,00 €", 3000],
    ["", NaN],
  ])("parses %s", (raw, expected) => {
    const got = parseAmount(raw);
    if (Number.isNaN(expected)) expect(Number.isNaN(got)).toBe(true);
    else expect(got).toBeCloseTo(expected, 2);
  });
});

describe("parseStatementDate", () => {
  it.each([
    ["01/03/2026", "2026-03-01"],
    ["1-3-2026", "2026-03-01"],
    ["01.03.26", "2026-03-01"],
    ["2026-03-01", "2026-03-01"],
    ["not a date", ""],
  ])("parses %s", (raw, expected) => {
    expect(parseStatementDate(raw)).toBe(expected);
  });
});

describe("toStatementLines", () => {
  it("normalises rows and drops ones without a usable date or amount", () => {
    const { rows } = parseStatementCsv(
      "Fecha valor;Concepto;Importe;Referencia\n" +
        "05/03/2026;Pago factura 2026-014;1.210,00;REF99\n" +
        ";broken;;\n" +
        "07/03/2026;Comision;-3,50;",
    );
    const m = detectColumnMapping(["Fecha valor", "Concepto", "Importe", "Referencia"]);
    expect(toStatementLines(rows, m)).toEqual([
      {
        valueDate: "2026-03-05",
        amount: 1210,
        description: "Pago factura 2026-014",
        reference: "REF99",
      },
      { valueDate: "2026-03-07", amount: -3.5, description: "Comision", reference: "" },
    ]);
  });
});

describe("dedupeKey", () => {
  it("is stable and insensitive to case / whitespace in text fields", () => {
    const a: StatementLine = {
      valueDate: "2026-03-05",
      amount: 1210,
      description: "Pago Factura",
      reference: "R1",
    };
    const b: StatementLine = { ...a, description: "  pago factura  " };
    expect(dedupeKey(a)).toBe(dedupeKey(b));
  });

  it("differs when the amount differs", () => {
    const a: StatementLine = { valueDate: "2026-03-05", amount: 1210, description: "x", reference: "" };
    expect(dedupeKey(a)).not.toBe(dedupeKey({ ...a, amount: 1211 }));
  });
});

function inv(over: Partial<MatchableInvoice>): MatchableInvoice {
  return {
    id: 1,
    seriesPrefix: "2026",
    invoiceNumber: 14,
    isRectification: false,
    issueDate: "2026-02-20",
    total: 1210,
    amountPaid: 0,
    status: "issued",
    ...over,
  };
}

describe("proposeMatches", () => {
  const line: StatementLine = {
    valueDate: "2026-03-05",
    amount: 1210,
    description: "TRANSFERENCIA Pago 2026-014 ACME SL",
    reference: "",
  };

  it("requires an amount match — no proposal when nothing lines up", () => {
    expect(proposeMatches([line], [inv({ total: 999 })])).toEqual([]);
  });

  it("matches on amount + invoice number in the description, high confidence", () => {
    const [m] = proposeMatches([line], [inv({})]);
    expect(m.invoice.id).toBe(1);
    expect(m.confidence).toBe("high");
    expect(m.reasons).toEqual(expect.arrayContaining(["amount", "reference", "date-close"]));
    expect(m.amount).toBe(1210);
  });

  it("matches a partially-paid invoice on its outstanding balance", () => {
    const half: StatementLine = { ...line, amount: 605, description: "abono parcial" };
    const [m] = proposeMatches([half], [inv({ amountPaid: 605 })]);
    expect(m.invoice.id).toBe(1);
    expect(m.reasons).not.toContain("reference");
  });

  it("does not offer one invoice to two lines", () => {
    const l2: StatementLine = { ...line, valueDate: "2026-03-06", description: "otro pago 2026-014" };
    const matches = proposeMatches([line, l2], [inv({})]);
    expect(matches).toHaveLength(1);
  });

  it("ignores debit lines and non-issued invoices", () => {
    const debit: StatementLine = { ...line, amount: -1210 };
    expect(proposeMatches([debit], [inv({})])).toEqual([]);
    expect(proposeMatches([line], [inv({ status: "paid" })])).toEqual([]);
  });

  it("skips a match when the invoice was issued long after the value date", () => {
    expect(proposeMatches([line], [inv({ issueDate: "2025-01-01", invoiceNumber: 999 })])).toEqual(
      [],
    );
  });
});
