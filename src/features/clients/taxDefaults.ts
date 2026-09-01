import type { VatTreatment } from "../../db/clients";

// ponytail: hardcoded membership list, changes essentially never; update if the EU gains/loses a member.
export const EU_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
]);

/** Reduced IRPF retention rate for newly-registered autónomos: applies the year of alta and the
 * following two calendar years; 15% thereafter. No/invalid `retaStartDate` → assume just registered.
 * ponytail: whole-year granularity (the rule is calendar-year based, not a rolling 36 months). */
export const IRPF_REDUCED_RATE = 7;
export const IRPF_STANDARD_RATE = 15;

export function defaultIrpfRate(
  retaStartDate: string | null | undefined,
  today: Date = new Date(),
): number {
  const altaYear = Number(retaStartDate?.slice(0, 4));
  if (!Number.isInteger(altaYear) || altaYear < 1900) return IRPF_REDUCED_RATE;
  return today.getFullYear() <= altaYear + 2 ? IRPF_REDUCED_RATE : IRPF_STANDARD_RATE;
}

export function suggestVatTreatment(country: string | null): VatTreatment {
  if (!country || country === "ES") return "standard";
  if (EU_COUNTRIES.has(country)) return "reverse_charge_eu";
  return "export_outside_eu";
}

export function irpfApplicable(country: string | null): boolean {
  return !country || country === "ES";
}
