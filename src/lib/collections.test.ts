import { describe, expect, it } from "vitest";
import { lateInterestLetter, paymentReminder, type LateInterestLetterParams } from "./collections";

const base: LateInterestLetterParams = {
  businessName: "Estudio Ruiz",
  clientName: "Cliente SA",
  invoiceNumber: "2026-014",
  issueDate: "2026-01-10",
  dueDate: "2026-02-09",
  total: 1210,
  outstanding: 1210,
  daysOverdue: 40,
  annualRatePct: 12,
  today: "2026-03-21",
  iban: "ES91 2100 0418 4502 0005 1332",
};

describe("paymentReminder", () => {
  it("names a firm overdue notice when past due, in Spanish", () => {
    const text = paymentReminder(base, "es");
    expect(text).toContain("2026-014");
    expect(text).toContain("40 día(s) de retraso");
    expect(text).toContain("1.210,00 €");
    expect(text).toContain("ES91 2100 0418 4502 0005 1332");
    expect(text).toContain("Estudio Ruiz");
  });

  it("is a gentle reminder before the due date, in English", () => {
    const text = paymentReminder({ ...base, daysOverdue: 0 }, "en");
    expect(text).toContain("friendly reminder");
    expect(text).not.toContain("overdue");
    // formatEUR is locale-agnostic (Spanish-style grouping) throughout the app.
    expect(text).toContain("Amount due: 1.210,00 €");
  });

  it("shows the outstanding balance and full total when partially paid", () => {
    const text = paymentReminder({ ...base, outstanding: 400 }, "es");
    expect(text).toContain("Importe pendiente: 400,00 € (de 1.210,00 €)");
  });

  it("omits the IBAN line when no IBAN is given", () => {
    const text = paymentReminder({ ...base, iban: null }, "en");
    expect(text).not.toMatch(/IBAN/);
  });
});

describe("lateInterestLetter", () => {
  it("cites Ley 3/2004 and includes the computed interest and total claim", () => {
    const text = lateInterestLetter(base, "es");
    expect(text).toContain("Ley 3/2004");
    // 1210 * 12% * 40/365 = 15.912...
    expect(text).toContain("15,91 €");
    // principal + interest
    expect(text).toContain("1.225,91 €");
    expect(text).toContain("40 días");
    expect(text).toContain("indemnización fija de 40 €");
  });

  it("renders an English version citing the EUR 40 recovery compensation", () => {
    const text = lateInterestLetter(base, "en");
    expect(text).toContain("Ley 3/2004");
    expect(text).toContain("EUR 40 recovery compensation");
    expect(text).toContain("15,91 €");
  });
});
