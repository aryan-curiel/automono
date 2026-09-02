import { roundCents } from "./invoice";

/**
 * Rough full-year IRPF (Renta) estimate from an autónomo's net profit.
 *
 * ponytail: naive heuristic — the combined national scale (estatal + the default autonómica
 * tramos, which most CCAA track closely), a flat personal allowance, and nothing else. No
 * autonomic variation, no reductions for estimación directa simplificada, no dependants, no
 * regional deductions, no split of savings vs general base. This is an orientación, not a
 * filing; upgrade path is a real Renta engine if the app ever needs one.
 */

export interface IrpfBracket {
  from: number;
  /** exclusive upper edge, or null for the top open bracket */
  to: number | null;
  /** marginal rate, percent */
  rate: number;
}

/** Combined (estatal + autonómica default) IRPF general-base scale, stable 2023–2025. */
export const IRPF_BRACKETS: IrpfBracket[] = [
  { from: 0, to: 12_450, rate: 19 },
  { from: 12_450, to: 20_200, rate: 24 },
  { from: 20_200, to: 35_200, rate: 30 },
  { from: 35_200, to: 60_000, rate: 37 },
  { from: 60_000, to: 300_000, rate: 45 },
  { from: 300_000, to: null, rate: 47 },
];

/** Default mínimo personal (single filer, under 65). */
export const DEFAULT_PERSONAL_ALLOWANCE = 5_550;

export interface IrpfBracketCharge {
  rate: number;
  taxable: number;
  tax: number;
}

export interface IrpfEstimate {
  /** net after the personal allowance, floored at 0 */
  taxableBase: number;
  /** estimated full-year IRPF */
  tax: number;
  /** tax / taxableBase, percent (0 when the base is 0) */
  effectiveRate: number;
  /** rate of the highest bracket reached, percent */
  marginalRate: number;
  perBracket: IrpfBracketCharge[];
}

export function estimateIrpf(
  taxableBase: number,
  brackets: IrpfBracket[] = IRPF_BRACKETS,
): { tax: number; marginalRate: number; perBracket: IrpfBracketCharge[] } {
  const base = Math.max(0, taxableBase);
  let tax = 0;
  let marginalRate = 0;
  const perBracket: IrpfBracketCharge[] = [];
  for (const b of brackets) {
    if (base <= b.from) break;
    const upper = b.to ?? base;
    const taxable = Math.min(base, upper) - b.from;
    if (taxable <= 0) continue;
    const charge = taxable * (b.rate / 100);
    tax += charge;
    marginalRate = b.rate;
    perBracket.push({ rate: b.rate, taxable: roundCents(taxable), tax: roundCents(charge) });
  }
  return { tax: roundCents(tax), marginalRate, perBracket };
}

export interface EstimateOpts {
  /** mínimo personal y familiar to knock off the net before applying the scale */
  personalAllowance?: number;
}

export function estimateAnnualIrpf(net: number, opts: EstimateOpts = {}): IrpfEstimate {
  const allowance = opts.personalAllowance ?? DEFAULT_PERSONAL_ALLOWANCE;
  const taxableBase = roundCents(Math.max(0, net - allowance));
  const { tax, marginalRate, perBracket } = estimateIrpf(taxableBase);
  return {
    taxableBase,
    tax,
    effectiveRate: taxableBase > 0 ? roundCents((tax / taxableBase) * 100) : 0,
    marginalRate,
    perBracket,
  };
}
