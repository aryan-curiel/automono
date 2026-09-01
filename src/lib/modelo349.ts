import type { InvoiceListItem } from "../db/invoices";
import type { Period } from "./dateRange";
import { invoicesInPeriod } from "./quarterlyDeclaration";
import { roundCents } from "./invoice";
import { csvRow } from "./csv";
import { formatDate } from "./format";

/**
 * Modelo 349 operation clave. AutoMono only ever emits `S` (prestaciones intracomunitarias de
 * servicios) — the invoicing side of an autónomo selling services to EU businesses under
 * reverse charge, which is the overwhelmingly common case.
 * ponytail: no goods/services distinction in the line-item data, so we can't derive `E`
 * (entrega de bienes). Add a per-client or per-invoice clave field if a goods seller ever needs it.
 */
export type Clave349 = "S";

export interface Modelo349Row {
  clientId: number;
  clientName: string;
  /** EU VAT number (NIF-IVA), snapshot-preferred. `null` if the client has none recorded. */
  vatNumber: string | null;
  /** ISO country code, snapshot-preferred. */
  country: string | null;
  clave: Clave349;
  /** Total taxable base for the period, rounded to cents. */
  base: number;
}

export interface Modelo349Summary {
  rows: Modelo349Row[];
  /** Sum of every row's base. */
  total: number;
}

/**
 * Quarterly Modelo 349 summary: one row per intracomunitario client (VAT treatment
 * `reverse_charge_eu`), with their VAT number and total invoiced base for `period`.
 *
 * Always accrual (by issue date, non-draft) — the criterio de caja opt-in does not apply to
 * intracommunity operations, which are always declared in the period they're performed.
 */
export function buildModelo349(invoices: InvoiceListItem[], period: Period): Modelo349Summary {
  const byClient = new Map<number, Modelo349Row>();

  for (const inv of invoicesInPeriod(invoices, period)) {
    if (inv.vatTreatment !== "reverse_charge_eu") continue;
    const existing = byClient.get(inv.clientId);
    if (existing) {
      existing.base = roundCents(existing.base + inv.subtotal);
    } else {
      byClient.set(inv.clientId, {
        clientId: inv.clientId,
        clientName: inv.clientName,
        vatNumber: inv.clientVatNumber,
        country: inv.clientCountry,
        clave: "S",
        base: roundCents(inv.subtotal),
      });
    }
  }

  const rows = [...byClient.values()].sort((a, b) => a.clientName.localeCompare(b.clientName));
  const total = roundCents(rows.reduce((s, r) => s + r.base, 0));
  return { rows, total };
}

/** CSV section for a Modelo 349 summary — appended to the quarter's accountant CSV export. */
export function buildModelo349Csv(summary: Modelo349Summary, period: Period): string {
  const lines: string[] = [];
  lines.push(csvRow([`Modelo 349 · ${formatDate(period.from)} – ${formatDate(period.to)}`]));
  lines.push(csvRow(["Cliente", "NIF-IVA", "País", "Clave", "Base imponible"]));
  for (const r of summary.rows) {
    lines.push(csvRow([r.clientName, r.vatNumber ?? "", r.country ?? "", r.clave, r.base]));
  }
  lines.push(csvRow(["Total", "", "", "", summary.total]));
  return lines.join("\n");
}
