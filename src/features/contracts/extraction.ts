import type { BillingCadence, VatTreatment } from "../../types";

/** Raw billing terms returned by the `extract_contract_terms_cmd` LLM extraction. */
export interface ContractTermsLlm {
  base: number | null;
  cadence: string | null;
  irpfRate: number | null;
  vatTreatment: string | null;
  description: string | null;
}

/** Advisory first-invoice-line fields — shown read-only for the user to copy into a real invoice. */
export interface FirstInvoiceLineSuggestion {
  description: string | null;
  base: number | null;
  irpfRate: number | null;
  vatTreatment: VatTreatment | null;
}

export interface ContractTermsSuggestion {
  /** `"none"` when the contract is one-off or the cadence couldn't be read — leaves the form as-is. */
  billingCadence: BillingCadence;
  /** `null` when the model found neither an amount nor a usable description. */
  firstLine: FirstInvoiceLineSuggestion | null;
}

// The model is told to answer with one of four exact tokens, but real answers drift ("annual",
// "per month", "once"). Map the common variants; anything unrecognized falls through to "none".
const CADENCE_ALIASES: Record<string, BillingCadence> = {
  monthly: "monthly",
  month: "monthly",
  "per month": "monthly",
  quarterly: "quarterly",
  quarter: "quarterly",
  yearly: "yearly",
  year: "yearly",
  annual: "yearly",
  annually: "yearly",
  one_off: "none",
  "one-off": "none",
  oneoff: "none",
  once: "none",
  single: "none",
};

const VAT_TREATMENTS: readonly VatTreatment[] = [
  "standard",
  "reverse_charge_eu",
  "export_outside_eu",
  "exempt_other",
];

function positiveNumber(n: number | null): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

function nonNegativeNumber(n: number | null): number | null {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

/** Normalizes a raw LLM extraction into a cadence to prefill and an advisory first-line suggestion. */
export function mapContractTerms(raw: ContractTermsLlm): ContractTermsSuggestion {
  const billingCadence = CADENCE_ALIASES[(raw.cadence ?? "").trim().toLowerCase()] ?? "none";
  const vatTreatment = VAT_TREATMENTS.includes(raw.vatTreatment as VatTreatment)
    ? (raw.vatTreatment as VatTreatment)
    : null;
  const description = raw.description?.trim() || null;
  const base = positiveNumber(raw.base);
  const irpfRate = nonNegativeNumber(raw.irpfRate);

  const firstLine =
    description || base !== null ? { description, base, irpfRate, vatTreatment } : null;

  return { billingCadence, firstLine };
}
