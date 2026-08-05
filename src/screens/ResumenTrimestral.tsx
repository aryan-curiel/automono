import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { TrendUp, Percent, ChartLineUp, Scales, DownloadSimple, Plus } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { KpiTile } from "../components/ui/KpiTile";
import { PageHeader } from "../components/PageHeader";
import { PeriodSelector, type Kind } from "../components/PeriodSelector";
import { DeclarationWizard } from "../components/DeclarationWizard";
import { listExpenses } from "../db/expenses";
import type { ExpenseRecord } from "../db/expenses";
import { writeTextFile } from "../db/export";
import { listDeclarations } from "../db/declarations";
import type { DeclarationListItem } from "../db/declarations";
import {
  defaultQuarterPeriod,
  priorYearPeriod,
  quarterKeyOf,
  quartersInRange,
  type Period,
} from "../lib/dateRange";
import { yoyDelta } from "../lib/analytics";
import { formatEUR } from "../lib/format";
import {
  buildDeclarationCsv,
  buildDeclarationSnapshot,
  invoicesInPeriod,
} from "../lib/quarterlyDeclaration";
import type { InvoiceListItem } from "../db/invoices";

function deltaLabel(delta: number | null): string | null {
  if (delta === null) return null;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(0)}% vs año anterior`;
}

interface ResumenTrimestralProps {
  invoices: InvoiceListItem[];
  onOpenDeclaration: (id: number) => void;
}

export function ResumenTrimestral({ invoices, onOpenDeclaration }: ResumenTrimestralProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>(defaultQuarterPeriod);
  const [kind, setKind] = useState<Kind>("quarter");
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [priorExpenses, setPriorExpenses] = useState<ExpenseRecord[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [declarations, setDeclarations] = useState<DeclarationListItem[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);

  function refreshDeclarations() {
    listDeclarations().then(setDeclarations);
  }

  useEffect(refreshDeclarations, []);

  useEffect(() => {
    listExpenses({
      from: period.from,
      to: period.to,
      quarterKeys: kind === "quarter" ? quartersInRange(period.from, period.to) : undefined,
    }).then(setExpenses);
  }, [period, kind]);

  const priorPeriod = priorYearPeriod(period);
  useEffect(() => {
    listExpenses({
      from: priorPeriod.from,
      to: priorPeriod.to,
      quarterKeys: kind === "quarter" ? quartersInRange(priorPeriod.from, priorPeriod.to) : undefined,
    }).then(setPriorExpenses);
  }, [priorPeriod.from, priorPeriod.to, kind]);

  const qInvoices = invoicesInPeriod(invoices, period);
  const snapshot = buildDeclarationSnapshot(qInvoices, expenses);
  const {
    invoicedBase,
    ivaByRate: byRate,
    irpfWithheld,
    expensesDeductibleBase,
    expensesIvaDeductible: expensesIva,
    expensesIrpfWithheld,
    netIrpfIncome,
    margin,
  } = snapshot.totals;

  // YoY: same period, one year earlier — same calc, reused inputs.
  const priorInvoices = invoicesInPeriod(invoices, priorPeriod);
  const priorTotals = buildDeclarationSnapshot(priorInvoices, priorExpenses).totals;
  const priorMargin = priorTotals.margin;
  const revenueDelta = deltaLabel(yoyDelta(invoicedBase, priorTotals.invoicedBase));
  const marginDelta = deltaLabel(yoyDelta(margin, priorMargin));

  const [wizardInitialYearStr, wizardInitialQuarterStr] = quarterKeyOf(period.from).split("-Q");
  const wizardInitialYear = Number(wizardInitialYearStr);
  const wizardInitialQuarter = Number(wizardInitialQuarterStr) as 1 | 2 | 3 | 4;

  function handleOpenWizard() {
    setWizardKey((k) => k + 1);
    setWizardOpen(true);
  }

  async function handleExport() {
    setExportError(null);
    const path = await save({
      defaultPath: `resumen_${period.label.replace(/\s+/g, "_")}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;
    setExporting(true);
    try {
      await writeTextFile(path, buildDeclarationCsv(snapshot));
    } catch (e) {
      setExportError(`No se pudo exportar: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title={t("resumenTrimestral.title")}
        subtitle={t("resumenTrimestral.subtitle")}
        actions={
          <>
            <PeriodSelector
              defaultKind="quarter"
              onChange={(p, k) => {
                setPeriod(p);
                setKind(k);
              }}
            />
            <Button variant="secondary" onClick={handleExport} disabled={exporting}>
              <DownloadSimple size={14} weight="bold" className="inline -mt-0.5 mr-1.5" />
              {exporting ? t("resumenTrimestral.exportingCsv") : t("resumenTrimestral.exportCsv")}
            </Button>
          </>
        }
      />

      {exportError && <div className="text-sm text-danger mb-4">{exportError}</div>}

      <div className="grid grid-cols-5 gap-3.5 mb-6">
        <KpiTile
          label={t("declarations.detail.invoicedBase")}
          value={formatEUR(invoicedBase)}
          icon={TrendUp}
          subtitle={revenueDelta ?? undefined}
          compact
        />
        <KpiTile
          label={t("declarations.detail.irpfWithheld")}
          value={formatEUR(irpfWithheld)}
          icon={Percent}
          compact
        />
        <KpiTile
          label={t("declarations.detail.expensesIrpfWithheld")}
          value={formatEUR(expensesIrpfWithheld)}
          icon={Percent}
          compact
        />
        <KpiTile
          label={t("declarations.detail.netIrpfIncome")}
          value={formatEUR(netIrpfIncome)}
          icon={ChartLineUp}
          compact
        />
        <KpiTile
          label={t("declarations.detail.margin")}
          value={formatEUR(margin)}
          icon={Scales}
          tone={margin < 0 ? "warn" : "neutral"}
          subtitle={marginDelta ?? undefined}
          compact
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="py-5 px-6">
          <div className="font-bold text-sm mb-3.5">{t("declarations.detail.ivaByRateTitle")}</div>
          {byRate.length === 0 && (
            <p className="text-[13px] text-ink-soft py-3">
              {t("declarations.detail.ivaByRateEmpty")}
            </p>
          )}
          {byRate.map(({ rate, base, iva }) => (
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
          <div className="font-bold text-sm mb-3.5">
            {t("declarations.detail.expensesQuarterTitle")}
          </div>
          <div className="flex justify-between py-2 border-b border-border font-medium text-[13.5px]">
            <span>{t("declarations.detail.expensesDeductibleBase")}</span>
            <span className="font-semibold font-mono text-[13.5px]">
              {formatEUR(expensesDeductibleBase)}
            </span>
          </div>
          <div className="flex justify-between py-2 font-medium text-[13.5px]">
            <span>{t("declarations.detail.expensesIvaDeductible")}</span>
            <span className="font-semibold font-mono text-[13.5px]">{formatEUR(expensesIva)}</span>
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between mt-8 mb-3.5">
        <div className="font-bold text-sm">{t("declarations.title")}</div>
        <Button variant="secondary" onClick={handleOpenWizard}>
          <Plus size={14} weight="bold" className="inline -mt-0.5 mr-1.5" />
          {t("declarations.newButton")}
        </Button>
      </div>

      <Card className="py-2 px-6">
        {declarations.length === 0 && (
          <p className="text-[13px] text-ink-soft py-3">{t("declarations.empty")}</p>
        )}
        {declarations.map((d) => (
          <button
            key={d.id}
            onClick={() => onOpenDeclaration(d.id)}
            className="w-full flex items-center justify-between py-3 border-b border-border last:border-b-0 text-left cursor-pointer hover:bg-surface-alt -mx-6 px-6"
          >
            <div className="flex items-center gap-3">
              <span className="font-semibold text-[13.5px]">
                Q{d.quarter} {d.year}
              </span>
              <Badge tone={d.status === "completed" ? "success" : "info"}>
                {t(`declarations.status.${d.status}`)}
              </Badge>
            </div>
            <div className="flex items-center gap-6 text-[13px] text-ink-soft">
              <span>
                {d.invoiceCount} {t("declarations.table.invoicesLabel")} ·{" "}
                <span className="font-mono font-medium text-ink">{formatEUR(d.invoicedTotal)}</span>
              </span>
              <span>
                {d.expenseCount} {t("declarations.table.expensesLabel")} ·{" "}
                <span className="font-mono font-medium text-ink">{formatEUR(d.expensesTotal)}</span>
              </span>
            </div>
          </button>
        ))}
      </Card>

      <DeclarationWizard
        key={wizardKey}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        invoices={invoices}
        initialYear={wizardInitialYear}
        initialQuarter={wizardInitialQuarter}
        onCreated={refreshDeclarations}
      />
    </div>
  );
}
