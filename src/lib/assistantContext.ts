import type { InvoiceListItem } from "../db/invoices";
import type { ExpenseRecord } from "../db/expenses";
import { outstandingAmount, revenueByClient } from "./analytics";
import { quarterRange, yearRange } from "./dateRange";
import { formatEUR } from "./format";
import {
  buildDeclarationSnapshot,
  expensesInPeriod,
  invoicesInPeriod,
} from "./quarterlyDeclaration";
import { nextTaxDeadlines } from "./taxCalendar";

export interface AssistantContextInput {
  invoices: InvoiceListItem[];
  expenses: ExpenseRecord[];
  /** The synthesized `contexto_usuario.md`; empty string when nothing has been generated. */
  userContextMd: string;
  /** Today, ISO `YYYY-MM-DD` — injectable so the builder stays pure/testable. */
  todayIso: string;
}

function quarterOf(todayIso: string): { year: number; quarter: 1 | 2 | 3 | 4 } {
  const [y, m] = todayIso.split("-").map(Number);
  return { year: y, quarter: (Math.floor((m - 1) / 3) + 1) as 1 | 2 | 3 | 4 };
}

function totalsBlock(
  title: string,
  invoices: InvoiceListItem[],
  expenses: ExpenseRecord[],
): string {
  const { totals } = buildDeclarationSnapshot(invoices, expenses);
  return [
    `## ${title}`,
    `- Base facturada: ${formatEUR(totals.invoicedBase)} (${invoices.length} facturas)`,
    `- IVA repercutido: ${formatEUR(totals.ivaByRate.reduce((s, r) => s + r.iva, 0))}`,
    `- IRPF retenido en facturas: ${formatEUR(totals.irpfWithheld)}`,
    `- Gastos deducibles (base): ${formatEUR(totals.expensesDeductibleBase)} (${expenses.length} gastos)`,
    `- IVA soportado deducible: ${formatEUR(totals.expensesIvaDeductible)}`,
    `- Rendimiento neto (base facturada − gastos): ${formatEUR(totals.netIrpfIncome)}`,
    `- Resultado tras retenciones: ${formatEUR(totals.margin)}`,
  ].join("\n");
}

/**
 * A compact markdown snapshot of the user's fiscal position, prepended to their question as
 * grounding for the LLM. All figures come from the same pure selectors the screens use, so the
 * assistant and the UI never disagree. The synthesized `contexto_usuario.md` is appended verbatim.
 *
 * ponytail: rebuilt from scratch on every turn (cheap, all in-memory) rather than cached.
 */
export function buildAssistantContext(input: AssistantContextInput): string {
  const { invoices, expenses, userContextMd, todayIso } = input;
  const { year, quarter } = quarterOf(todayIso);
  const qPeriod = quarterRange(year, quarter);
  const yPeriod = yearRange(year);

  const qInvoices = invoicesInPeriod(invoices, qPeriod);
  const qExpenses = expensesInPeriod(expenses, qPeriod);
  const ytdInvoices = invoicesInPeriod(invoices, yPeriod);
  const ytdExpenses = expensesInPeriod(expenses, yPeriod);

  const topClients = revenueByClient(ytdInvoices).slice(0, 5);

  const unpaid = invoices.filter((inv) => inv.status === "issued" && outstandingAmount(inv) > 0);
  const unpaidTotal = unpaid.reduce((s, inv) => s + outstandingAmount(inv), 0);
  const drafts = invoices.filter((inv) => inv.status === "draft").length;

  const deadlines = nextTaxDeadlines(todayIso, 3);

  const sections: string[] = [
    `Fecha de hoy: ${todayIso}. Trimestre en curso: ${quarter}T ${year}.`,
    totalsBlock(
      `Trimestre en curso (${quarter}T ${year}, criterio de devengo)`,
      qInvoices,
      qExpenses,
    ),
    totalsBlock(`Año en curso (${year}, acumulado)`, ytdInvoices, ytdExpenses),
    [
      `## Principales clientes (facturado ${year}, IVA incluido)`,
      ...(topClients.length
        ? topClients.map((c) => `- ${c.clientName}: ${formatEUR(c.total)}`)
        : ["- (sin facturas emitidas este año)"]),
    ].join("\n"),
    [
      `## Pendiente`,
      `- Facturas emitidas sin cobrar: ${unpaid.length} por ${formatEUR(unpaidTotal)}`,
      `- Facturas en borrador: ${drafts}`,
    ].join("\n"),
    [
      `## Próximos vencimientos fiscales`,
      ...deadlines.map((d) => `- ${d.label}: ${d.dueDate}`),
    ].join("\n"),
  ];

  if (userContextMd.trim()) {
    sections.push(`## Contexto del negocio (contexto_usuario.md)\n\n${userContextMd.trim()}`);
  }

  return sections.join("\n\n");
}
