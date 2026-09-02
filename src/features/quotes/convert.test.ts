import { describe, expect, it } from "vitest";
import { invoiceDraftFromQuote } from "./convert";

describe("invoiceDraftFromQuote", () => {
  const quote = { ivaRate: 21, irpfRate: 15, language: "es" as const };
  const lines = [
    { description: "Diseño", quantity: 2, unitPrice: 300 },
    { description: "Consultoría", quantity: 1, unitPrice: 150 },
  ];

  it("carries tax rates and language onto the draft", () => {
    const draft = invoiceDraftFromQuote(quote, lines, "2026-09-02");
    expect(draft.ivaRate).toBe(21);
    expect(draft.irpfRate).toBe(15);
    expect(draft.language).toBe("es");
  });

  it("uses today's date, not the quote's", () => {
    expect(invoiceDraftFromQuote(quote, lines, "2026-09-02").issueDate).toBe("2026-09-02");
  });

  it("copies every line stripped to description/quantity/unitPrice", () => {
    const draft = invoiceDraftFromQuote(quote, lines, "2026-09-02");
    expect(draft.lines).toEqual([
      { description: "Diseño", quantity: 2, unitPrice: 300 },
      { description: "Consultoría", quantity: 1, unitPrice: 150 },
    ]);
  });

  it("preserves a null IRPF rate", () => {
    const draft = invoiceDraftFromQuote({ ...quote, irpfRate: null }, lines, "2026-09-02");
    expect(draft.irpfRate).toBeNull();
  });
});
