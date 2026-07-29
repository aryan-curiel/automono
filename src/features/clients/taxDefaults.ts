import type { VatTreatment } from "../../db/clients";

// ponytail: hardcoded membership list, changes essentially never; update if the EU gains/loses a member.
export const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

// ponytail: hardcoded reduced first-year IRPF rate; bump to 15 once the reduced period ends.
export const IRPF_DEFAULT_RATE = 7;

export function suggestVatTreatment(country: string | null): VatTreatment {
  if (!country || country === "ES") return "standard";
  if (EU_COUNTRIES.has(country)) return "reverse_charge_eu";
  return "export_outside_eu";
}

export function irpfApplicable(country: string | null): boolean {
  return !country || country === "ES";
}
