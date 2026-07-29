import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/PageHeader";
import { PeriodSelector } from "../components/PeriodSelector";
import { listExpenses } from "../db/expenses";
import type { ExpenseRecord } from "../db/expenses";
import { defaultPeriod, type Period } from "../lib/dateRange";
import { formatDate, formatEUR } from "../lib/format";

interface GastosProps {
  onOpenExpense: (id: number) => void;
  onNewExpense: () => void;
}

export function Gastos({ onOpenExpense, onNewExpense }: GastosProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    listExpenses({ from: period.from, to: period.to })
      .then(setExpenses)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [period]);

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const ivaTotal = expenses.reduce((s, e) => s + (e.ivaAmount ?? 0) * (e.deductiblePct / 100), 0);

  return (
    <div className="px-10 pt-8 pb-15">
      <PageHeader
        title={t("expenses.title")}
        subtitle={period.label}
        actions={
          <>
            <PeriodSelector onChange={setPeriod} />
            <Button onClick={onNewExpense}>+ {t("expenses.newExpense")}</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 mb-5">
        <Card className="py-4.5 px-5">
          <div className="font-semibold text-xs text-ink-soft mb-2">
            {t("expenses.summary.total")}
          </div>
          <div className="font-bold text-2xl font-mono">{formatEUR(total)}</div>
        </Card>
        <Card className="py-4.5 px-5">
          <div className="font-semibold text-xs text-ink-soft mb-2">
            {t("expenses.summary.deductibleIva")}
          </div>
          <div className="font-bold text-2xl font-mono">{formatEUR(ivaTotal)}</div>
        </Card>
      </div>

      {loading ? (
        <div className="text-sm text-ink-soft">{t("expenses.loading")}</div>
      ) : loadError ? (
        <div className="text-sm text-danger">{t("expenses.errors.loadFailed")}</div>
      ) : expenses.length === 0 ? (
        <div className="text-sm text-ink-soft">{t("expenses.empty")}</div>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[.9fr_1fr_1.6fr_1fr_1fr_.8fr] py-3 px-5.5 bg-surface-alt font-semibold text-xs uppercase tracking-wide text-ink-soft">
            <div>{t("expenses.columns.date")}</div>
            <div>{t("expenses.columns.category")}</div>
            <div>{t("expenses.columns.description")}</div>
            <div>{t("expenses.columns.amount")}</div>
            <div>{t("expenses.columns.iva")}</div>
            <div>{t("expenses.columns.deductible")}</div>
          </div>
          {expenses.map((e) => (
            <div
              key={e.id}
              onClick={() => onOpenExpense(e.id)}
              className="grid grid-cols-[.9fr_1fr_1.6fr_1fr_1fr_.8fr] py-4 px-5.5 border-t border-border items-center cursor-pointer"
            >
              <div className="text-[13px] text-ink-soft">{formatDate(e.date)}</div>
              <div>
                {e.category && (
                  <span className="font-semibold text-xs bg-surface-alt px-2.5 py-1 rounded-full">
                    {e.category}
                  </span>
                )}
              </div>
              <div className="font-medium text-[13.5px]">{e.description}</div>
              <div className="font-semibold text-[13.5px] font-mono">{formatEUR(e.amount)}</div>
              <div className="font-medium text-[13px] font-mono text-ink-soft">
                {formatEUR(e.ivaAmount ?? 0)}
              </div>
              <div className="font-medium text-[13px]">{e.deductiblePct}%</div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
