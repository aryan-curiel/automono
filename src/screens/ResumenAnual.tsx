import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { CaretLeft, CaretRight, DownloadSimple } from "@phosphor-icons/react";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ErrorText } from "../components/ui/Field";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Modelo347Panel } from "../components/Modelo347Panel";
import { QuarterBarChart } from "../components/charts/QuarterBarChart";
import { listExpenses } from "../db/expenses";
import type { ExpenseRecord } from "../db/expenses";
import type { InvoiceListItem } from "../db/invoices";
import { writeTextFile } from "../db/export";
import { yearRange } from "../lib/dateRange";
import { formatEUR } from "../lib/format";
import { buildModelo347, buildModelo347Csv } from "../lib/modelo347";
import { annualPnl, multiYearSummary } from "../lib/annualSummary";
import { estimateAnnualIrpf } from "../lib/irpfEstimate";

interface ResumenAnualProps {
  invoices: InvoiceListItem[];
}

type Tab = "multiyear" | "pnl" | "modelo347";

/** How many years the multi-year dashboard looks back, including the selected year. */
const YEARS_BACK = 5;

const formatPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)} %`;

/** Annual tax + analytics surface for a chosen calendar year: a multi-year revenue dashboard,
 * a single-year profit & loss with a rough IRPF (Renta) estimate, and the Modelo 347
 * "operaciones con terceros" summary. */
export function ResumenAnual({ invoices }: ResumenAnualProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("multiyear");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    // Load the whole multi-year window once so every tab works off the same in-memory set.
    const from = yearRange(year - (YEARS_BACK - 1)).from;
    const to = yearRange(year).to;
    let cancelled = false;
    void listExpenses({ from, to }).then((rows) => {
      if (!cancelled) setExpenses(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const years = useMemo(
    () => Array.from({ length: YEARS_BACK }, (_, i) => year - (YEARS_BACK - 1) + i),
    [year],
  );
  const multiYear = useMemo(
    () => multiYearSummary(invoices, expenses, years),
    [invoices, expenses, years],
  );
  const pnl = useMemo(() => annualPnl(invoices, expenses, year), [invoices, expenses, year]);
  const irpf = useMemo(() => estimateAnnualIrpf(pnl.net), [pnl.net]);
  const modelo347 = useMemo(
    () => buildModelo347(invoices, expenses, year),
    [invoices, expenses, year],
  );

  async function handleExport() {
    setExportError(null);
    const path = await save({
      defaultPath: `modelo_347_${year}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;
    try {
      await writeTextFile(path, buildModelo347Csv(modelo347));
    } catch {
      setExportError(t("declarations.modelo347.exportError"));
    }
  }

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title={t("declarations.annual.title")}
        subtitle={t("declarations.annual.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="p-1.5 rounded-control hover:bg-surface-alt cursor-pointer
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                onClick={() => setYear((y) => y - 1)}
                aria-label={t("declarations.modelo347.yearPrev")}
              >
                <CaretLeft size={14} weight="bold" />
              </button>
              <span className="text-[13px] font-semibold tabular-nums w-12 text-center">{year}</span>
              <button
                type="button"
                className="p-1.5 rounded-control hover:bg-surface-alt cursor-pointer
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                onClick={() => setYear((y) => y + 1)}
                aria-label={t("declarations.modelo347.yearNext")}
              >
                <CaretRight size={14} weight="bold" />
              </button>
            </div>
            {tab === "modelo347" && (
              <Button
                variant="secondary"
                onClick={() => void handleExport()}
                disabled={modelo347.rows.length === 0}
              >
                <DownloadSimple size={14} weight="bold" className="inline -mt-0.5 mr-1.5" />
                {t("declarations.modelo347.export")}
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-6">
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "multiyear", label: t("declarations.annual.tabs.multiyear") },
            { value: "pnl", label: t("declarations.annual.tabs.pnl") },
            { value: "modelo347", label: t("declarations.annual.tabs.modelo347") },
          ]}
        />
      </div>

      {tab === "multiyear" && <MultiYearView rows={multiYear} />}
      {tab === "pnl" && <PnlView pnl={pnl} irpf={irpf} />}
      {tab === "modelo347" && (
        <>
          {exportError && <ErrorText>{exportError}</ErrorText>}
          <Modelo347Panel summary={modelo347} />
        </>
      )}
    </div>
  );
}

function MultiYearView({ rows }: { rows: ReturnType<typeof multiYearSummary> }) {
  const { t } = useTranslation();
  const hasData = rows.some((r) => r.revenue !== 0 || r.expenses !== 0);
  if (!hasData) {
    return <Card className="px-5 py-4 text-[13px] text-ink-soft">{t("declarations.annual.multiyear.empty")}</Card>;
  }

  const chartData = (pick: (r: (typeof rows)[number]) => number) =>
    rows.map((r) => ({ key: String(r.year), label: String(r.year), value: pick(r) }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="font-bold text-sm mb-4">{t("declarations.annual.multiyear.revenueChart")}</div>
          <QuarterBarChart
            data={chartData((r) => r.revenue)}
            color="var(--color-accent)"
            seriesLabel={t("declarations.annual.multiyear.revenue")}
            formatValue={formatEUR}
          />
        </Card>
        <Card className="p-6">
          <div className="font-bold text-sm mb-4">{t("declarations.annual.multiyear.netChart")}</div>
          <QuarterBarChart
            data={chartData((r) => r.net)}
            color="var(--color-accent)"
            seriesLabel={t("declarations.annual.multiyear.net")}
            formatValue={formatEUR}
          />
        </Card>
      </div>

      <Card className="px-5 py-4">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-ink-soft text-left">
              <th className="py-1.5 font-medium">{t("declarations.annual.multiyear.year")}</th>
              <th className="py-1.5 font-medium text-right">{t("declarations.annual.multiyear.revenue")}</th>
              <th className="py-1.5 font-medium text-right">{t("declarations.annual.multiyear.expenses")}</th>
              <th className="py-1.5 font-medium text-right">{t("declarations.annual.multiyear.net")}</th>
              <th className="py-1.5 font-medium text-right">{t("declarations.annual.multiyear.yoy")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year} className="border-t border-border">
                <td className="py-1.5 font-medium">{r.year}</td>
                <td className="py-1.5 text-right font-mono">{formatEUR(r.revenue)}</td>
                <td className="py-1.5 text-right font-mono">{formatEUR(r.expenses)}</td>
                <td className="py-1.5 text-right font-mono font-medium">{formatEUR(r.net)}</td>
                <td
                  className={`py-1.5 text-right font-mono ${
                    r.revenueYoY == null
                      ? "text-ink-soft"
                      : r.revenueYoY >= 0
                        ? "text-success"
                        : "text-danger"
                  }`}
                >
                  {r.revenueYoY == null ? "—" : formatPct(r.revenueYoY)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function BreakdownList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number }[];
}) {
  const { t } = useTranslation();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card className="p-6">
      <div className="font-bold text-sm mb-4">{title}</div>
      {rows.length === 0 && <div className="text-xs text-ink-soft">{t("dashboard.noData")}</div>}
      {rows.map((r) => (
        <div key={r.label} className="py-2 border-b border-border last:border-b-0">
          <div className="flex items-center justify-between gap-3 mb-1">
            <span className="font-medium text-[13.5px] truncate min-w-0">{r.label}</span>
            <span className="font-semibold text-[13px] font-mono shrink-0">{formatEUR(r.value)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </Card>
  );
}

function PnlView({
  pnl,
  irpf,
}: {
  pnl: ReturnType<typeof annualPnl>;
  irpf: ReturnType<typeof estimateAnnualIrpf>;
}) {
  const { t } = useTranslation();

  if (pnl.totalRevenue === 0 && pnl.totalExpenses === 0) {
    return (
      <Card className="px-5 py-4 text-[13px] text-ink-soft">
        {t("declarations.annual.pnl.empty", { year: pnl.year })}
      </Card>
    );
  }

  const summary: { label: string; value: number }[] = [
    { label: t("declarations.annual.pnl.revenue"), value: pnl.totalRevenue },
    { label: t("declarations.annual.pnl.expenses"), value: pnl.totalExpenses },
    { label: t("declarations.annual.pnl.net"), value: pnl.net },
  ];

  return (
    <div className="space-y-4">
      <Card className="px-5 py-4">
        <table className="w-full text-[13px]">
          <tbody>
            {summary.map((s, i) => (
              <tr key={s.label} className={i > 0 ? "border-t border-border" : ""}>
                <td className={`py-1.5 ${i === 2 ? "font-semibold" : ""}`}>{s.label}</td>
                <td
                  className={`py-1.5 text-right font-mono ${i === 2 ? "font-semibold" : ""}`}
                >
                  {formatEUR(s.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-ink-soft mt-3">{t("declarations.annual.pnl.note")}</p>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <BreakdownList
          title={t("declarations.annual.pnl.byClient")}
          rows={pnl.byClient.map((c) => ({ label: c.clientName, value: c.base }))}
        />
        <BreakdownList
          title={t("declarations.annual.pnl.byCategory")}
          rows={pnl.byCategory.map((c) => ({ label: c.category, value: c.total }))}
        />
      </div>

      <Card className="px-5 py-4">
        <div className="font-bold text-sm mb-4">
          {t("declarations.annual.irpf.title", { year: pnl.year })}
        </div>
        <table className="w-full text-[13px]">
          <tbody>
            <tr>
              <td className="py-1.5">{t("declarations.annual.irpf.taxableBase")}</td>
              <td className="py-1.5 text-right font-mono">{formatEUR(irpf.taxableBase)}</td>
            </tr>
            <tr className="border-t border-border font-semibold">
              <td className="py-1.5">{t("declarations.annual.irpf.tax")}</td>
              <td className="py-1.5 text-right font-mono">{formatEUR(irpf.tax)}</td>
            </tr>
            <tr className="border-t border-border">
              <td className="py-1.5">{t("declarations.annual.irpf.effectiveRate")}</td>
              <td className="py-1.5 text-right font-mono">{irpf.effectiveRate.toFixed(1)} %</td>
            </tr>
            <tr className="border-t border-border">
              <td className="py-1.5">{t("declarations.annual.irpf.marginalRate")}</td>
              <td className="py-1.5 text-right font-mono">{irpf.marginalRate} %</td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-ink-soft mt-3">{t("declarations.annual.irpf.disclaimer")}</p>
      </Card>
    </div>
  );
}
