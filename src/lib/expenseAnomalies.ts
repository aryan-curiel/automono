import { ivaDeductiblePctOf, type ExpenseRecord } from "../db/expenses";
import { compareQuarterKeys, previousQuarterKey, quarterKeyOf } from "./dateRange";
import { formatEUR } from "./format";

/**
 * Deterministic expense anomaly detection — pure, offline, no LLM. Flags things worth a second
 * look before filing a quarter: a spike in deducible IVA, likely duplicate receipts, an IRPF
 * rate that disagrees with how the same category is usually treated, and single expenses far
 * outside their category's normal range. All baselines are learned from the user's own history
 * (categories are free-form, so nothing is hard-coded).
 */

export type AnomalySeverity = "warning" | "info";
export type AnomalyKind = "iva-spike" | "duplicate" | "irpf-mismatch" | "category-outlier";

export interface ExpenseAnomaly {
  severity: AnomalySeverity;
  kind: AnomalyKind;
  /** English, deterministic — for tests and any non-UI consumer. The Gastos panel re-renders
   * the text from `kind` + `params` via i18n. */
  message: string;
  params: Record<string, string | number>;
  /** Expenses the warning is about (the offending one, or the whole duplicate cluster / quarter). */
  expenseIds: number[];
}

export interface DetectOptions {
  /** Quarter key ("YYYY-QN") to test for a deducible-IVA spike. Defaults to the latest quarter
   * present in `expenses`. */
  referenceQuarter?: string;
  /** Multiple of the trailing 4-quarter average deducible IVA that counts as a spike. */
  ivaSpikeMultiple?: number;
  /** Max days between two same-provider, same-amount expenses to call them a likely duplicate. */
  duplicateWindowDays?: number;
  /** Multiple of a category's median amount above which a single expense is an outlier. */
  categoryOutlierMultiple?: number;
}

const DEFAULTS = {
  ivaSpikeMultiple: 3,
  duplicateWindowDays: 5,
  categoryOutlierMultiple: 4,
};

/** ponytail: buckets on the accrual date / declared period only — cash-basis `paidDate` is ignored. */
function effectiveQuarter(e: ExpenseRecord): string {
  return e.declaredPeriod ?? quarterKeyOf(e.date);
}

function deductibleIva(e: ExpenseRecord): number {
  return (e.ivaAmount ?? 0) * (ivaDeductiblePctOf(e) / 100);
}

/** An IRPF rate below this reads as "no retention" — absorbs rounding noise on stored rates. */
const RETENTION_FLOOR = 1;

function irpfRateOf(e: ExpenseRecord): number {
  return e.irpfRate ?? 0;
}

function normProvider(p: string | null): string | null {
  const s = p?.trim().toLowerCase();
  return s ? s : null;
}

function categoryOf(e: ExpenseRecord): string | null {
  const s = e.category?.trim();
  return s ? s : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Most common value; ties broken by the larger value (a real retention rate beats a zero). */
function mode(nums: number[]): number {
  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
  let best = 0;
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && value > best)) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function daysApart(a: string, b: string): number {
  const day = 86_400_000;
  return Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / day));
}

function groupBy<T>(items: T[], key: (item: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    const bucket = groups.get(k);
    if (bucket) bucket.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

function ivaSpike(expenses: ExpenseRecord[], opts: Required<DetectOptions>): ExpenseAnomaly[] {
  const sumByQuarter = new Map<string, number>();
  for (const e of expenses) {
    const q = effectiveQuarter(e);
    sumByQuarter.set(q, (sumByQuarter.get(q) ?? 0) + deductibleIva(e));
  }

  const quartersPresent = [...sumByQuarter.keys()].sort(compareQuarterKeys);
  const refQuarter = opts.referenceQuarter || quartersPresent[quartersPresent.length - 1];
  if (!refQuarter) return [];

  const trailingKeys: string[] = [];
  let key = refQuarter;
  for (let i = 0; i < 4; i++) {
    key = previousQuarterKey(key);
    trailingKeys.push(key);
  }
  // "has data" == the quarter contained at least one expense (it's a key in the map).
  const trailingValues = trailingKeys
    .filter((k) => sumByQuarter.has(k))
    .map((k) => sumByQuarter.get(k) as number);
  if (trailingValues.length < 2) return [];

  const average = trailingValues.reduce((s, v) => s + v, 0) / trailingValues.length;
  const current = sumByQuarter.get(refQuarter) ?? 0;
  if (average <= 0 || current < average * opts.ivaSpikeMultiple) return [];

  const multiple = round1(current / average);
  const expenseIds = expenses
    .filter((e) => effectiveQuarter(e) === refQuarter && deductibleIva(e) > 0)
    .map((e) => e.id);

  return [
    {
      severity: "warning",
      kind: "iva-spike",
      message: `Deducible VAT for ${refQuarter} is ${multiple}× the trailing 4-quarter average (${formatEUR(
        current,
      )} vs ${formatEUR(average)}) — possible duplicate receipt`,
      params: {
        quarter: refQuarter,
        multiple,
        current: formatEUR(current),
        average: formatEUR(average),
      },
      expenseIds,
    },
  ];
}

function duplicates(expenses: ExpenseRecord[], opts: Required<DetectOptions>): ExpenseAnomaly[] {
  const anomalies: ExpenseAnomaly[] = [];
  const byProviderAmount = groupBy(expenses, (e) => {
    const provider = normProvider(e.provider);
    return provider ? `${provider}|${e.amount.toFixed(2)}` : null;
  });

  for (const group of byProviderAmount.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    let cluster: ExpenseRecord[] = [sorted[0]];
    const flush = () => {
      if (cluster.length >= 2) {
        anomalies.push({
          severity: "warning",
          kind: "duplicate",
          message: `${cluster.length} expenses from "${cluster[0].provider}" for ${formatEUR(
            cluster[0].amount,
          )} within ${opts.duplicateWindowDays} days — possible duplicate receipt`,
          params: {
            provider: cluster[0].provider ?? "",
            amount: formatEUR(cluster[0].amount),
            count: cluster.length,
            windowDays: opts.duplicateWindowDays,
          },
          expenseIds: cluster.map((e) => e.id),
        });
      }
    };
    for (let i = 1; i < sorted.length; i++) {
      if (daysApart(sorted[i].date, cluster[cluster.length - 1].date) <= opts.duplicateWindowDays) {
        cluster.push(sorted[i]);
      } else {
        flush();
        cluster = [sorted[i]];
      }
    }
    flush();
  }
  return anomalies;
}

function irpfMismatch(expenses: ExpenseRecord[]): ExpenseAnomaly[] {
  const anomalies: ExpenseAnomaly[] = [];
  for (const [category, members] of groupBy(expenses, categoryOf)) {
    if (members.length < 3) continue;
    const rates = members.map(irpfRateOf);
    const withRetention = rates.filter((r) => r >= RETENTION_FLOOR).length;
    const share = withRetention / members.length;

    if (share <= 0.3) {
      // Category is normally un-retained — flag the ones that carry IRPF anyway.
      for (const e of members) {
        if (irpfRateOf(e) >= RETENTION_FLOOR) {
          anomalies.push({
            severity: "info",
            kind: "irpf-mismatch",
            message: `Expense in "${category}" carries ${irpfRateOf(
              e,
            )}% IRPF but expenses in this category usually have none`,
            params: { variant: "carries", category, rate: irpfRateOf(e), expected: 0 },
            expenseIds: [e.id],
          });
        }
      }
    } else if (share >= 0.7) {
      const expected = mode(rates.filter((r) => r >= RETENTION_FLOOR));
      for (const e of members) {
        const rate = irpfRateOf(e);
        if (rate < RETENTION_FLOOR) {
          anomalies.push({
            severity: "info",
            kind: "irpf-mismatch",
            message: `Expense in "${category}" has no IRPF retention but expenses in this category are usually ${expected}%`,
            params: { variant: "missing", category, rate, expected },
            expenseIds: [e.id],
          });
        } else if (Math.abs(rate - expected) > 5) {
          anomalies.push({
            severity: "info",
            kind: "irpf-mismatch",
            message: `Expense in "${category}" has ${rate}% IRPF; expenses in this category are usually ${expected}%`,
            params: { variant: "rateOff", category, rate, expected },
            expenseIds: [e.id],
          });
        }
      }
    }
  }
  return anomalies;
}

function categoryOutliers(
  expenses: ExpenseRecord[],
  opts: Required<DetectOptions>,
): ExpenseAnomaly[] {
  const anomalies: ExpenseAnomaly[] = [];
  for (const [category, members] of groupBy(expenses, categoryOf)) {
    if (members.length < 4) continue;
    const typical = median(members.map((e) => e.amount));
    if (typical <= 0) continue;
    for (const e of members) {
      if (e.amount > typical * opts.categoryOutlierMultiple) {
        anomalies.push({
          severity: "info",
          kind: "category-outlier",
          message: `Expense of ${formatEUR(e.amount)} in "${category}" is ${round1(
            e.amount / typical,
          )}× the typical amount for that category (${formatEUR(typical)})`,
          params: {
            category,
            amount: formatEUR(e.amount),
            typical: formatEUR(typical),
            multiple: round1(e.amount / typical),
          },
          expenseIds: [e.id],
        });
      }
    }
  }
  return anomalies;
}

/**
 * Runs every anomaly rule over the full expense history and returns the hits, warnings first.
 * Pass the complete list (not just the viewed period) so the trailing-quarter and per-category
 * baselines have something to compare against.
 */
export function detectExpenseAnomalies(
  expenses: ExpenseRecord[],
  opts: DetectOptions = {},
): ExpenseAnomaly[] {
  if (expenses.length === 0) return [];
  const resolved: Required<DetectOptions> = {
    referenceQuarter: opts.referenceQuarter ?? "",
    ivaSpikeMultiple: opts.ivaSpikeMultiple ?? DEFAULTS.ivaSpikeMultiple,
    duplicateWindowDays: opts.duplicateWindowDays ?? DEFAULTS.duplicateWindowDays,
    categoryOutlierMultiple: opts.categoryOutlierMultiple ?? DEFAULTS.categoryOutlierMultiple,
  };

  return [
    ...ivaSpike(expenses, resolved),
    ...duplicates(expenses, resolved),
    ...irpfMismatch(expenses),
    ...categoryOutliers(expenses, resolved),
  ];
}

/** Stable id for one anomaly — used to persist "dismissed" across sessions. Changes if the set
 * of offending expenses changes, so an edited/re-created anomaly surfaces again. */
export function anomalySignature(a: ExpenseAnomaly): string {
  return `${a.kind}:${[...a.expenseIds].sort((x, y) => x - y).join(",")}`;
}
