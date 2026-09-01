import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Wallet, Receipt, PiggyBank, Percent, DotsThreeVertical } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { KpiTile } from "../components/ui/KpiTile";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
import { PageHeader } from "../components/PageHeader";
import { PeriodSelector, type Kind } from "../components/PeriodSelector";
import { listExpenses, updateExpense } from "../db/expenses";
import type { ExpenseRecord } from "../db/expenses";
import { defaultQuarterPeriod, quartersInRange, type Period } from "../lib/dateRange";
import { formatDate, formatEUR } from "../lib/format";

interface GastosProps {
  onOpenExpense: (id: number) => void;
  onNewExpense: () => void;
}

export function Gastos({ onOpenExpense, onNewExpense }: GastosProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>(defaultQuarterPeriod);
  const [kind, setKind] = useState<Kind>("quarter");
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [reloadToken, setReloadToken] = useState(0);

  function retry() {
    setLoading(true);
    setLoadError(false);
    setReloadToken((n) => n + 1);
  }

  async function toggleDeclared(expense: ExpenseRecord) {
    await updateExpense(expense.id, { declared: !expense.declared });
    setReloadToken((n) => n + 1);
  }

  useEffect(() => {
    listExpenses({
      from: period.from,
      to: period.to,
      quarterKeys: kind === "quarter" ? quartersInRange(period.from, period.to) : undefined,
    })
      .then(setExpenses)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [period, kind, reloadToken]);

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const deductibleTotal = expenses.reduce((s, e) => s + e.amount * (e.deductiblePct / 100), 0);
  const ivaTotal = expenses.reduce((s, e) => s + (e.ivaAmount ?? 0) * (e.deductiblePct / 100), 0);

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title={t("expenses.title")}
        subtitle={period.label}
        actions={
          <>
            <PeriodSelector
              defaultKind="quarter"
              onChange={(p, k) => {
                setLoading(true);
                setLoadError(false);
                setPeriod(p);
                setKind(k);
              }}
            />
            <Button onClick={onNewExpense}>+ {t("expenses.newExpense")}</Button>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-5">
        <KpiTile label={t("expenses.summary.total")} value={formatEUR(total)} icon={Receipt} />
        <KpiTile
          label={t("expenses.summary.deductibleTotal")}
          value={formatEUR(deductibleTotal)}
          icon={PiggyBank}
        />
        <KpiTile
          label={t("expenses.summary.deductibleIva")}
          value={formatEUR(ivaTotal)}
          icon={Percent}
        />
      </div>

      {loading ? (
        <Card className="overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[.9fr_1fr_1.6fr_.8fr_1fr_1fr_32px] py-3 px-6 border-t border-border first:border-t-0"
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
        <div className="flex flex-col items-start gap-2.5">
          <div className="text-sm text-danger">{t("expenses.errors.loadFailed")}</div>
          <Button variant="secondary" onClick={retry}>
            {t("common.retry")}
          </Button>
        </div>
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
          <div className="grid grid-cols-[.9fr_1fr_1.6fr_.8fr_1fr_1fr_32px] py-3 px-6 bg-surface-alt font-medium text-xs uppercase tracking-wide text-ink-soft">
            <div>{t("expenses.columns.date")}</div>
            <div>{t("expenses.columns.category")}</div>
            <div>{t("expenses.columns.description")}</div>
            <div className="text-right">{t("expenses.columns.deductible")}</div>
            <div className="text-right">{t("expenses.columns.amount")}</div>
            <div className="text-right">{t("expenses.columns.iva")}</div>
            <div />
          </div>
          {expenses.map((e) => (
            <div
              key={e.id}
              onClick={() => onOpenExpense(e.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  if (ev.key === " ") ev.preventDefault();
                  onOpenExpense(e.id);
                }
              }}
              className="group grid grid-cols-[.9fr_1fr_1.6fr_.8fr_1fr_1fr_32px] py-3 px-6
                         border-t border-border items-center cursor-pointer
                         transition-colors hover:bg-surface-alt
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <div className="text-[13px] text-ink-soft">{formatDate(e.date)}</div>
              <div className="flex items-center gap-1.5 min-w-0 pr-3">
                {e.category && (
                  <Badge tone="neutral" className="truncate" title={e.category}>
                    {e.category}
                  </Badge>
                )}
                {e.declared && <Badge tone="success">{t("expenses.declaredBadge")}</Badge>}
              </div>
              <div className="font-medium text-[13.5px]">{e.description}</div>
              <div className="font-medium text-[13px] font-mono text-right">
                {formatEUR(e.amount * (e.deductiblePct / 100))}
              </div>
              <div className="font-semibold text-[13.5px] font-mono text-right">
                {formatEUR(e.amount)}
              </div>
              <div className="font-medium text-[13px] font-mono text-ink-soft text-right">
                {formatEUR(e.ivaAmount ?? 0)}
              </div>
              <div
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                onClick={(e2) => e2.stopPropagation()}
              >
                <Menu>
                  <MenuTrigger className="p-1.5 rounded-control hover:bg-surface-alt cursor-pointer">
                    <DotsThreeVertical size={16} weight="bold" />
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem onSelect={() => onOpenExpense(e.id)}>
                      {t("common.viewDetail")}
                    </MenuItem>
                    <MenuItem onSelect={() => void toggleDeclared(e)}>
                      {e.declared
                        ? t("expenses.actions.unmarkDeclared")
                        : t("expenses.actions.markDeclared")}
                    </MenuItem>
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
