import type { InvoiceListItem } from "../db/invoices";
import type { ExpenseRecord } from "../db/expenses";
import { yearRange } from "./dateRange";
import { invoicesInPeriod } from "./quarterlyDeclaration";
import { roundCents } from "./invoice";
import { csvRow } from "./csv";

/**
 * Modelo 347 reporting threshold. A counterparty is only listed when the annual total of
 * operations of one kind (sales OR purchases), IVA included, *exceeds* this figure.
 */
export const MODELO_347_THRESHOLD = 3005.06;

/**
 * "sales" = Clave B (the autónomo's own invoices to a client); "purchases" = Clave A
 * (expenses paid to a provider). AEAT tests each side against the threshold independently,
 * so the same counterparty can appear once per side or not at all.
 */
export type Modelo347Side = "sales" | "purchases";

export interface Modelo347Row {
  /** Stable key for React lists — side + counterparty identity. */
  key: string;
  side: Modelo347Side;
  /** Client name (sales) or provider name (purchases). */
  name: string;
  /** Counterparty NIF/CIF — known for clients, `null` for providers (not tracked yet). */
  nif: string | null;
  /** IVA-included operation total per calendar quarter, `[T1, T2, T3, T4]`, rounded to cents. */
  quarters: [number, number, number, number];
  /** Sum of `quarters`. */
  total: number;
}

export interface Modelo347Summary {
  year: number;
  /** One row per counterparty+side over the threshold, sorted by side then name. */
  rows: Modelo347Row[];
  /** Sum of every listed row's total. */
  total: number;
}

interface Acc {
  name: string;
  nif: string | null;
  quarters: [number, number, number, number];
}

/** Calendar-quarter index (0–3) of an ISO "YYYY-MM-DD" date. */
function quarterIndex(iso: string): 0 | 1 | 2 | 3 {
  return (Math.floor((Number(iso.slice(5, 7)) - 1) / 3) % 4) as 0 | 1 | 2 | 3;
}

function accFor(
  map: Map<string | number, Acc>,
  id: string | number,
  name: string,
  nif: string | null,
): Acc {
  let acc = map.get(id);
  if (!acc) {
    acc = { name, nif, quarters: [0, 0, 0, 0] };
    map.set(id, acc);
  }
  return acc;
}

function toRow(side: Modelo347Side, key: string, acc: Acc): Modelo347Row | null {
  const quarters = acc.quarters.map(roundCents) as [number, number, number, number];
  const total = roundCents(quarters[0] + quarters[1] + quarters[2] + quarters[3]);
  if (total <= MODELO_347_THRESHOLD) return null;
  return { key, side, name: acc.name, nif: acc.nif, quarters, total };
}

/**
 * Annual Modelo 347 "operaciones con terceros" summary for `year`: one row per client
 * (sales, Clave B) and per provider (purchases, Clave A) whose IVA-included annual total
 * exceeds {@link MODELO_347_THRESHOLD}, each with a per-quarter breakdown.
 *
 * Excluded, per the Modelo 347 instructions:
 * - intra-community services (`reverse_charge_eu`) — declared in Modelo 349;
 * - exports outside the EU (`export_outside_eu`) — outside 347's scope;
 * - any operation carrying IRPF withholding — already cross-reported via Modelo 190/180.
 *
 * ponytail: expenses have no intra-community marker, so the 349 exclusion is invoice-only;
 * domestic purchases are assumed. Expenses with no `provider` recorded can't be attributed
 * and are skipped.
 */
export function buildModelo347(
  invoices: InvoiceListItem[],
  expenses: ExpenseRecord[],
  year: number,
): Modelo347Summary {
  const period = yearRange(year);

  const sales = new Map<string | number, Acc>();
  for (const inv of invoicesInPeriod(invoices, period)) {
    if (inv.vatTreatment === "reverse_charge_eu" || inv.vatTreatment === "export_outside_eu")
      continue;
    if (inv.irpfAmount > 0) continue;
    const amount = roundCents(inv.subtotal + inv.ivaAmount);
    if (amount === 0) continue;
    accFor(sales, inv.clientId, inv.clientName, inv.clientNif).quarters[
      quarterIndex(inv.issueDate!)
    ] += amount;
  }

  const purchases = new Map<string | number, Acc>();
  for (const exp of expenses) {
    if (exp.date < period.from || exp.date > period.to) continue;
    const name = exp.provider?.trim();
    if (!name) continue;
    if ((exp.irpfAmount ?? 0) > 0) continue;
    const amount = roundCents(exp.amount + (exp.ivaAmount ?? 0));
    if (amount === 0) continue;
    accFor(purchases, `p:${name.toLowerCase()}`, name, null).quarters[quarterIndex(exp.date)] +=
      amount;
  }

  const rows: Modelo347Row[] = [];
  for (const [id, acc] of sales) {
    const row = toRow("sales", `sales:${id}`, acc);
    if (row) rows.push(row);
  }
  for (const [id, acc] of purchases) {
    const row = toRow("purchases", `purchases:${id}`, acc);
    if (row) rows.push(row);
  }
  rows.sort((a, b) => a.side.localeCompare(b.side) || a.name.localeCompare(b.name));

  const total = roundCents(rows.reduce((s, r) => s + r.total, 0));
  return { year, rows, total };
}

/** CSV rendering of a Modelo 347 summary — for the annual accountant handoff. */
export function buildModelo347Csv(summary: Modelo347Summary): string {
  const lines: string[] = [];
  lines.push(csvRow([`Modelo 347 · ${summary.year}`]));
  lines.push(csvRow(["Tipo", "Nombre", "NIF", "T1", "T2", "T3", "T4", "Total anual"]));
  for (const r of summary.rows) {
    lines.push(
      csvRow([
        r.side === "sales" ? "Ventas (B)" : "Compras (A)",
        r.name,
        r.nif ?? "",
        r.quarters[0],
        r.quarters[1],
        r.quarters[2],
        r.quarters[3],
        r.total,
      ]),
    );
  }
  lines.push(csvRow(["Total", "", "", "", "", "", "", summary.total]));
  return lines.join("\n");
}
