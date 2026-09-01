import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { CaretLeft, CaretRight, DownloadSimple } from "@phosphor-icons/react";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { ErrorText } from "../components/ui/Field";
import { Modelo347Panel } from "../components/Modelo347Panel";
import { listExpenses } from "../db/expenses";
import type { ExpenseRecord } from "../db/expenses";
import type { InvoiceListItem } from "../db/invoices";
import { writeTextFile } from "../db/export";
import { yearRange } from "../lib/dateRange";
import { buildModelo347, buildModelo347Csv } from "../lib/modelo347";

interface ResumenAnualProps {
  invoices: InvoiceListItem[];
}

/** Annual tax surface. Currently just the Modelo 347 "operaciones con terceros" summary for a
 * chosen calendar year; a natural home for other annual/informative views later. */
export function ResumenAnual({ invoices }: ResumenAnualProps) {
  const { t } = useTranslation();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const period = yearRange(year);
    let cancelled = false;
    void listExpenses({ from: period.from, to: period.to }).then((rows) => {
      if (!cancelled) setExpenses(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const summary = useMemo(
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
      await writeTextFile(path, buildModelo347Csv(summary));
    } catch {
      setExportError(t("declarations.modelo347.exportError"));
    }
  }

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title={t("declarations.modelo347.title")}
        subtitle={t("declarations.modelo347.subtitle")}
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
              <span className="text-[13px] font-semibold tabular-nums w-12 text-center">
                {year}
              </span>
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
            <Button
              variant="secondary"
              onClick={() => void handleExport()}
              disabled={summary.rows.length === 0}
            >
              <DownloadSimple size={14} weight="bold" className="inline -mt-0.5 mr-1.5" />
              {t("declarations.modelo347.export")}
            </Button>
          </div>
        }
      />

      {exportError && <ErrorText>{exportError}</ErrorText>}
      <Modelo347Panel summary={summary} />
    </div>
  );
}
