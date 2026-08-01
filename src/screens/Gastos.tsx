import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Wallet, DotsThreeVertical } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
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
    <div className="px-8 pb-15">
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
        <Card className="overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[.9fr_1fr_1.6fr_1fr_1fr_.8fr_32px] py-3 px-5.5 border-t border-border first:border-t-0"
            >
              <div className="h-4 w-16 rounded bg-surface-alt animate-pulse" />
              <div className="h-4 w-20 rounded bg-surface-alt animate-pulse" />
              <div className="h-4 w-32 rounded bg-surface-alt animate-pulse" />
              <div className="h-4 w-16 rounded bg-surface-alt animate-pulse" />
              <div className="h-4 w-12 rounded bg-surface-alt animate-pulse" />
              <div className="h-4 w-10 rounded bg-surface-alt animate-pulse" />
            </div>
          ))}
        </Card>
      ) : loadError ? (
        <div className="text-sm text-danger">{t("expenses.errors.loadFailed")}</div>
      ) : expenses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <Wallet size={32} className="text-ink-soft/40" />
          <div className="text-sm text-ink-soft">{t("expenses.empty")}</div>
          <Button variant="secondary" onClick={onNewExpense}>
            + {t("expenses.newExpense")}
          </Button>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[.9fr_1fr_1.6fr_1fr_1fr_.8fr_32px] py-3 px-5.5 bg-surface-alt font-semibold text-xs uppercase tracking-wide text-ink-soft">
            <div>{t("expenses.columns.date")}</div>
            <div>{t("expenses.columns.category")}</div>
            <div>{t("expenses.columns.description")}</div>
            <div>{t("expenses.columns.amount")}</div>
            <div>{t("expenses.columns.iva")}</div>
            <div>{t("expenses.columns.deductible")}</div>
            <div />
          </div>
          {expenses.map((e) => (
            <div
              key={e.id}
              onClick={() => onOpenExpense(e.id)}
              className="group grid grid-cols-[.9fr_1fr_1.6fr_1fr_1fr_.8fr_32px] py-3 px-5.5
                         border-t border-border items-center cursor-pointer
                         transition-colors hover:bg-surface-alt"
            >
              <div className="text-[13px] text-ink-soft">{formatDate(e.date)}</div>
              <div>
                {e.category && (
                  <span className="font-semibold text-xs bg-surface-alt px-2.5 py-1 rounded-pill">
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
              <div
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e2) => e2.stopPropagation()}
              >
                <Menu>
                  <MenuTrigger className="p-1.5 rounded-control hover:bg-border cursor-pointer">
                    <DotsThreeVertical size={16} weight="bold" />
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem onSelect={() => onOpenExpense(e.id)}>Ver detalle</MenuItem>
                  </MenuContent>
                </Menu>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
