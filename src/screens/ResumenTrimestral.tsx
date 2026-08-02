import { useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { TrendUp, Percent, ChartLineUp, DownloadSimple } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { KpiTile } from "../components/ui/KpiTile";
import { PageHeader } from "../components/PageHeader";
import { PeriodSelector } from "../components/PeriodSelector";
import { listExpenses } from "../db/expenses";
import type { ExpenseRecord } from "../db/expenses";
import { writeTextFile } from "../db/export";
import { defaultQuarterPeriod, type Period } from "../lib/dateRange";
import { csvRow } from "../lib/csv";
import { formatEUR, formatDate } from "../lib/format";
import type { InvoiceListItem } from "../db/invoices";

interface ResumenTrimestralProps {
  invoices: InvoiceListItem[];
}

function buildExportCsv(invoices: InvoiceListItem[], expenses: ExpenseRecord[]): string {
  const lines: string[] = [];

  lines.push(csvRow(["Facturas"]));
  lines.push(
    csvRow(["Fecha", "Nº factura", "Cliente", "Base", "% IVA", "IVA", "% IRPF", "IRPF", "Total"]),
  );
  for (const inv of invoices) {
    lines.push(
      csvRow([
        formatDate(inv.issueDate),
        inv.seriesPrefix && inv.invoiceNumber ? `${inv.seriesPrefix}-${inv.invoiceNumber}` : "",
        inv.clientName,
        inv.subtotal,
        inv.ivaRate,
        inv.ivaAmount,
        inv.irpfRate,
        inv.irpfAmount,
        inv.total,
      ]),
    );
  }

  lines.push("");

  lines.push(csvRow(["Gastos"]));
  lines.push(csvRow(["Fecha", "Categoría", "Descripción", "Importe", "IVA", "% deducible"]));
  for (const e of expenses) {
    lines.push(
      csvRow([
        formatDate(e.date),
        e.category ?? "",
        e.description ?? "",
        e.amount,
        e.ivaAmount ?? 0,
        e.deductiblePct,
      ]),
    );
  }

  return lines.join("\n");
}

export function ResumenTrimestral({ invoices }: ResumenTrimestralProps) {
  const [period, setPeriod] = useState<Period>(defaultQuarterPeriod);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    listExpenses({ from: period.from, to: period.to }).then(setExpenses);
  }, [period]);

  const qInvoices = invoices.filter(
    (inv) =>
      inv.status !== "draft" &&
      inv.issueDate !== null &&
      inv.issueDate >= period.from &&
      inv.issueDate <= period.to,
  );

  const byRate = new Map<number, { base: number; iva: number }>();
  qInvoices.forEach((inv) => {
    const bucket = byRate.get(inv.ivaRate) ?? { base: 0, iva: 0 };
    bucket.base += inv.subtotal;
    bucket.iva += inv.ivaAmount;
    byRate.set(inv.ivaRate, bucket);
  });

  const invoicedBase = qInvoices.reduce((s, inv) => s + inv.subtotal, 0);
  const irpfWithheld = qInvoices.reduce((s, inv) => s + inv.irpfAmount, 0);
  const expensesDeductibleBase = expenses.reduce(
    (s, e) => s + e.amount * (e.deductiblePct / 100),
    0,
  );
  const expensesIva = expenses.reduce(
    (s, e) => s + (e.ivaAmount ?? 0) * (e.deductiblePct / 100),
    0,
  );
  const netIrpfIncome = invoicedBase - expensesDeductibleBase;

  async function handleExport() {
    setExportError(null);
    const path = await save({
      defaultPath: `resumen_${period.label.replace(/\s+/g, "_")}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;
    setExporting(true);
    try {
      await writeTextFile(path, buildExportCsv(qInvoices, expenses));
    } catch (e) {
      setExportError(`No se pudo exportar: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title="Resumen trimestral"
        subtitle="ayuda informativa para Modelo 130/303"
        actions={
          <>
            <PeriodSelector defaultKind="quarter" onChange={setPeriod} />
            <Button variant="secondary" onClick={handleExport} disabled={exporting}>
              <DownloadSimple size={14} weight="bold" className="inline -mt-0.5 mr-1.5" />
              {exporting ? "Exportando…" : "Exportar CSV"}
            </Button>
          </>
        }
      />

      {exportError && <div className="text-sm text-danger mb-4">{exportError}</div>}

      <div className="grid grid-cols-3 gap-3.5 mb-6">
        <KpiTile label="Total facturado (base)" value={formatEUR(invoicedBase)} icon={TrendUp} />
        <KpiTile label="IRPF retenido" value={formatEUR(irpfWithheld)} icon={Percent} />
        <KpiTile label="Ingreso neto estimado" value={formatEUR(netIrpfIncome)} icon={ChartLineUp} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="py-5 px-6">
          <div className="font-bold text-sm mb-3.5">IVA repercutido por tipo</div>
          {[...byRate.entries()].map(([rate, { base, iva }]) => (
            <div
              key={rate}
              className="flex justify-between py-2 border-b border-border last:border-b-0 font-medium text-[13.5px]"
            >
              <span>
                {rate}% IVA{rate === 0 ? " (exenta)" : ""}
              </span>
              <span className="font-semibold font-mono text-[13.5px]">
                {formatEUR(base)} base · {formatEUR(iva)} IVA
              </span>
            </div>
          ))}
        </Card>
        <Card className="py-5 px-6">
          <div className="font-bold text-sm mb-3.5">Gastos deducibles del trimestre</div>
          <div className="flex justify-between py-2 border-b border-border font-medium text-[13.5px]">
            <span>Total gastos</span>
            <span className="font-semibold font-mono text-[13.5px]">
              {formatEUR(expensesDeductibleBase)}
            </span>
          </div>
          <div className="flex justify-between py-2 font-medium text-[13.5px]">
            <span>IVA deducible</span>
            <span className="font-semibold font-mono text-[13.5px]">{formatEUR(expensesIva)}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
