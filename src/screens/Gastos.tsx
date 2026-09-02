import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Wallet,
  Receipt,
  PiggyBank,
  Percent,
  DotsThreeVertical,
  Warning,
  X,
} from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { KpiTile } from "../components/ui/KpiTile";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
import { DataTable, type DataTableColumn } from "../components/ui/DataTable";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { PageHeader } from "../components/PageHeader";
import { PeriodSelector, type Kind } from "../components/PeriodSelector";
import { BandejaRecibos } from "./BandejaRecibos";
import { ivaDeductiblePctOf, listExpenses, updateExpense } from "../db/expenses";
import type { ExpenseRecord } from "../db/expenses";
import { defaultQuarterPeriod, quarterKeyOf, quartersInRange, type Period } from "../lib/dateRange";
import { formatDate, formatEUR } from "../lib/format";
import {
  anomalySignature,
  detectExpenseAnomalies,
  type ExpenseAnomaly,
} from "../lib/expenseAnomalies";

export type GastosView = "list" | "inbox";

interface GastosProps {
  view: GastosView;
  onSetView: (view: GastosView) => void;
  onOpenExpense: (id: number) => void;
  onNewExpense: () => void;
  /** Receipt-inbox tab plumbing (folded in from the old `bandeja` screen). */
  inboxRefreshToken: number;
  onInboxChanged: () => void;
  onOpenSettings: () => void;
}

const DISMISSED_KEY = "automono.dismissedAnomalies";

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Translated text for an anomaly — the pure detector carries an English `message`; the UI
 * re-renders it from `kind` + `params`. */
function anomalyText(t: TFunction, a: ExpenseAnomaly): string {
  const key =
    a.kind === "irpf-mismatch"
      ? `expenses.anomalies.irpfMismatch.${a.params.variant}`
      : a.kind === "iva-spike"
        ? "expenses.anomalies.ivaSpike"
        : a.kind === "category-outlier"
          ? "expenses.anomalies.categoryOutlier"
          : "expenses.anomalies.duplicate";
  return t(key, a.params);
}

export function Gastos({
  view,
  onSetView,
  onOpenExpense,
  onNewExpense,
  inboxRefreshToken,
  onInboxChanged,
  onOpenSettings,
}: GastosProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>(defaultQuarterPeriod);
  const [kind, setKind] = useState<Kind>("quarter");
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [allExpenses, setAllExpenses] = useState<ExpenseRecord[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [reloadToken, setReloadToken] = useState(0);

  function dismissAnomaly(signature: string) {
    setDismissed((prev) => {
      const next = new Set(prev).add(signature);
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
      } catch {
        // ignore — a dismissed anomaly reappearing next launch is acceptable
      }
      return next;
    });
  }

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

  // Anomaly detection needs the full history for its trailing-quarter and per-category baselines,
  // not just the viewed period.
  useEffect(() => {
    listExpenses({})
      .then(setAllExpenses)
      .catch(() => setAllExpenses([]));
  }, [reloadToken]);

  const anomalies = useMemo(() => {
    const visibleIds = new Set(expenses.map((e) => e.id));
    const referenceQuarter = kind === "quarter" ? quarterKeyOf(period.to) : undefined;
    return detectExpenseAnomalies(allExpenses, { referenceQuarter })
      .filter((a) => !dismissed.has(anomalySignature(a)))
      .filter((a) => a.expenseIds.some((id) => visibleIds.has(id)));
  }, [allExpenses, dismissed, expenses, kind, period.to]);

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const deductibleTotal = expenses.reduce((s, e) => s + e.amount * (e.deductiblePct / 100), 0);
  const ivaTotal = expenses.reduce(
    (s, e) => s + (e.ivaAmount ?? 0) * (ivaDeductiblePctOf(e) / 100),
    0,
  );

  const columns: DataTableColumn<ExpenseRecord>[] = [
    {
      key: "date",
      header: t("expenses.columns.date"),
      width: ".9fr",
      render: (e) => <div className="text-[13px] text-ink-soft">{formatDate(e.date)}</div>,
    },
    {
      key: "category",
      header: t("expenses.columns.category"),
      width: "1fr",
      render: (e) => (
        <div className="flex items-center gap-1.5 min-w-0 pr-3">
          {e.category && (
            <Badge tone="neutral" className="truncate" title={e.category}>
              {e.category}
            </Badge>
          )}
          {e.declared && <Badge tone="success">{t("expenses.declaredBadge")}</Badge>}
        </div>
      ),
    },
    {
      key: "description",
      header: t("expenses.columns.description"),
      width: "1.6fr",
      render: (e) => <div className="font-medium text-[13.5px]">{e.description}</div>,
    },
    {
      key: "deductible",
      header: t("expenses.columns.deductible"),
      width: ".8fr",
      align: "right",
      render: (e) => (
        <div className="font-medium text-[13px] font-mono text-right">
          {formatEUR(e.amount * (e.deductiblePct / 100))}
        </div>
      ),
    },
    {
      key: "amount",
      header: t("expenses.columns.amount"),
      width: "1fr",
      align: "right",
      render: (e) => (
        <div className="font-semibold text-[13.5px] font-mono text-right">
          {formatEUR(e.amount)}
        </div>
      ),
    },
    {
      key: "iva",
      header: t("expenses.columns.iva"),
      width: "1fr",
      align: "right",
      render: (e) => (
        <div className="font-medium text-[13px] font-mono text-ink-soft text-right">
          {formatEUR(e.ivaAmount ?? 0)}
        </div>
      ),
    },
  ];

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title={t("expenses.title")}
        subtitle={view === "inbox" ? undefined : period.label}
        actions={
          view === "inbox" ? undefined : (
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
          )
        }
      />

      <div className="mb-5">
        <SegmentedControl<GastosView>
          value={view}
          onChange={onSetView}
          options={[
            { value: "list", label: t("expenses.tabs.expenses") },
            { value: "inbox", label: t("expenses.tabs.inbox") },
          ]}
        />
      </div>

      {view === "inbox" ? (
        <BandejaRecibos
          embedded
          refreshToken={inboxRefreshToken}
          onChanged={onInboxChanged}
          onOpenSettings={onOpenSettings}
        />
      ) : (
        <>
          {anomalies.length > 0 && (
            <Card className="mb-5 divide-y divide-border">
              <div className="flex items-center gap-2 px-5 py-3">
                <Warning size={16} weight="fill" className="text-warn" />
                <span className="text-[13px] font-medium">{t("expenses.anomalies.title")}</span>
                <span className="text-xs text-ink-soft">
                  {t("expenses.anomalies.count", { count: anomalies.length })}
                </span>
              </div>
              {anomalies.map((a) => {
                const signature = anomalySignature(a);
                return (
                  <div key={signature} className="flex items-start gap-3 px-5 py-3">
                    <Badge tone={a.severity}>
                      {t(`expenses.anomalies.severity.${a.severity}`)}
                    </Badge>
                    <button
                      type="button"
                      className="flex-1 text-left text-[13px] leading-snug hover:underline"
                      onClick={() => onOpenExpense(a.expenseIds[0])}
                    >
                      {anomalyText(t, a)}
                    </button>
                    <button
                      type="button"
                      aria-label={t("common.dismiss")}
                      className="p-1 rounded-control text-ink-soft hover:bg-surface-alt cursor-pointer"
                      onClick={() => dismissAnomaly(signature)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </Card>
          )}

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

          {loadError ? (
            <div className="flex flex-col items-start gap-2.5">
              <div className="text-sm text-danger">{t("expenses.errors.loadFailed")}</div>
              <Button variant="secondary" onClick={retry}>
                {t("common.retry")}
              </Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={expenses}
              rowKey={(e) => e.id}
              onRowActivate={(e) => onOpenExpense(e.id)}
              loading={loading}
              empty={
                <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                  <Wallet size={32} className="text-ink-soft/40" />
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="text-sm font-medium text-ink">{t("expenses.empty")}</div>
                    <p className="max-w-xs text-sm text-ink-soft">{t("expenses.emptyHint")}</p>
                  </div>
                  <Button variant="secondary" onClick={onNewExpense}>
                    + {t("expenses.newExpense")}
                  </Button>
                </div>
              }
              rowMenu={(e) => (
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
              )}
            />
          )}
        </>
      )}
    </div>
  );
}
