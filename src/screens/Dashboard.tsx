import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TrendUp, Clock, Wallet, Scales } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { KpiTile } from "../components/ui/KpiTile";
import type { KpiDelta } from "../components/ui/KpiTile";
import { PageHeader } from "../components/PageHeader";
import { ivaDeductiblePctOf, listExpenses } from "../db/expenses";
import type { ExpenseRecord } from "../db/expenses";
import { getPreferences } from "../db/preferences";
import { invoiceNumberLabel } from "../lib/invoice";
import { invoiceStatusMeta } from "../lib/status";
import { formatDate, formatEUR } from "../lib/format";
import {
  compareQuarterKeys,
  defaultQuarterPeriod,
  previousQuarterKey,
  quarterKeyLabel,
  quarterKeyOf,
  quarterRange,
} from "../lib/dateRange";
import type { Period } from "../lib/dateRange";
import { expenseByCategory, revenueByClient } from "../lib/analytics";
import { QuarterBarChart } from "../components/charts/QuarterBarChart";
import { StackedQuarterBarChart } from "../components/charts/StackedQuarterBarChart";
import { QuarterTrendChart } from "../components/charts/QuarterTrendChart";
import { nextTaxDeadlines } from "../lib/taxCalendar";
import { recurringInvoiceCandidates } from "../lib/recurring";
import { invoicesInPeriod, paidInvoicesInPeriod } from "../lib/quarterlyDeclaration";
import type { InvoiceListItem } from "../db/invoices";
import { listDeclarations, getDeclaration, requiredModelos } from "../db/declarations";
import type {
  DeclarationListItem,
  DeclarationDetail,
  DeclarationStatus,
  Modelo,
} from "../db/declarations";
import type { Screen } from "../types";
import { useCurrentQuarterKey } from "../hooks/useCurrentQuarterKey";

const RECENT_QUARTERS = 4;

/** The [from, to] date range of a "YYYY-QN" quarter key. */
function quarterKeyRange(key: string): Period {
  const [yearStr, q] = key.split("-Q");
  return quarterRange(Number(yearStr), Number(q) as 1 | 2 | 3 | 4);
}

/** `count` quarter keys ending at `currentKey`, ascending (oldest first). */
function recentQuarterKeys(currentKey: string, count: number): string[] {
  const keys = [currentKey];
  for (let i = 1; i < count; i++) keys.unshift(previousQuarterKey(keys[0]));
  return keys;
}

/** The quarter an expense counts toward — its own date's quarter, unless overridden. Mirrors
 * the OR-match `listExpenses({ quarterKeys })` already applies server-side. */
function expenseQuarterKey(expense: ExpenseRecord): string {
  return expense.declaredPeriod ?? quarterKeyOf(expense.date);
}

const MODELO_PATH_KEY: Record<Modelo, "modelo303Path" | "modelo130Path" | "modelo111Path"> = {
  "303": "modelo303Path",
  "130": "modelo130Path",
  "111": "modelo111Path",
};

interface DashboardProps {
  invoices: InvoiceListItem[];
  onNavigate: (screen: Screen) => void;
  onNavigateToQuarter: (quarterKey: string) => void;
  onOpenInvoice: (id: number) => void;
  onDuplicateInvoice: (id: number) => Promise<void>;
}

export function Dashboard({
  invoices,
  onNavigate,
  onNavigateToQuarter,
  onOpenInvoice,
  onDuplicateInvoice,
}: DashboardProps) {
  const { t } = useTranslation();
  const [recentExpenses, setRecentExpenses] = useState<ExpenseRecord[]>([]);
  const [generatingFor, setGeneratingFor] = useState<number | null>(null);
  const [declarations, setDeclarations] = useState<DeclarationListItem[]>([]);
  const [currentDeclarationDetail, setCurrentDeclarationDetail] =
    useState<DeclarationDetail | null>(null);
  const [altaKey, setAltaKey] = useState<string | null>(null);
  const [presents111, setPresents111] = useState(false);

  const currentKey = useCurrentQuarterKey();
  const [currentYearStr, currentQuarterStr] = currentKey.split("-Q");
  const currentYear = Number(currentYearStr);
  const currentQuarter = Number(currentQuarterStr);
  const quarterKeys = useMemo(() => recentQuarterKeys(currentKey, RECENT_QUARTERS), [currentKey]);
  const quarterWindowFrom = quarterKeyRange(quarterKeys[0]).from;
  const quarterWindowTo = quarterKeyRange(quarterKeys[quarterKeys.length - 1]).to;

  useEffect(() => {
    void getPreferences().then((prefs) => {
      setAltaKey(quarterKeyOf(prefs.retaStartDate));
      setPresents111(prefs.presentsModelo111);
    });
  }, []);

  const activeModelos = requiredModelos(presents111);

  useEffect(() => {
    void listExpenses({
      from: quarterWindowFrom,
      to: quarterWindowTo,
      quarterKeys,
    }).then(setRecentExpenses);
  }, [quarterWindowFrom, quarterWindowTo, quarterKeys]);

  useEffect(() => {
    void listDeclarations().then(setDeclarations);
  }, []);

  useEffect(() => {
    const current = declarations.find(
      (d) => d.year === currentYear && d.quarter === currentQuarter,
    );
    const detail =
      current?.status === "in_progress" ? getDeclaration(current.id) : Promise.resolve(null);
    void detail.then(setCurrentDeclarationDetail);
  }, [declarations, currentYear, currentQuarter]);

  // Every derived structure below scans `invoices` / `recentExpenses` (some once per
  // quarter key). Memoized so a parent re-render that didn't change either list is free.
  // ponytail: "today" is captured at memo time, not per render — a Dashboard left open
  // across midnight keeps yesterday's date until invoices/expenses next change. Fine here.
  const {
    soonIso,
    thisYear,
    quarterPeriod,
    taxDeadlines,
    invoicesThisQuarter,
    recentInvoices,
    topClients,
    expensesThisQuarter,
    topCategories,
    expensesByQuarter,
    currentDeclaration,
    prevQuarterKey,
    ivaTrendData,
    grossInvoicedByQuarter,
    trendData,
    paidPendingData,
    totalRevenueThisYear,
    topClientShare,
    repeatClientShare,
    topExpenseCategory,
    categoryTrendData,
    recurring,
    maxClientRevenue,
    maxCategoryExpense,
  } = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const soonIso = new Date(new Date(todayIso).getTime() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const thisYear = new Date().getFullYear();
    const quarterPeriod = defaultQuarterPeriod();
    const taxDeadlines = nextTaxDeadlines(todayIso, 2);

    const invoicesThisYear = invoices.filter(
      (inv) => inv.issueDate !== null && inv.issueDate.startsWith(String(thisYear)),
    );
    const invoicesThisQuarter = invoices.filter(
      (inv) =>
        inv.issueDate !== null &&
        inv.issueDate >= quarterPeriod.from &&
        inv.issueDate <= quarterPeriod.to,
    );

    const recentInvoices = invoices.slice(0, 4);
    const topClients = revenueByClient(invoicesThisYear).slice(0, 5);

    const quarterExpenses = recentExpenses.filter((e) => expenseQuarterKey(e) === currentKey);
    const expensesThisQuarter = quarterExpenses.reduce(
      (s, e) => s + e.amount * (e.deductiblePct / 100),
      0,
    );
    const topCategories = expenseByCategory(quarterExpenses).slice(0, 5);

    const expensesByQuarter = new Map(quarterKeys.map((key) => [key, 0] as [string, number]));
    for (const expense of recentExpenses) {
      const key = expenseQuarterKey(expense);
      if (expensesByQuarter.has(key)) {
        expensesByQuarter.set(
          key,
          expensesByQuarter.get(key)! + expense.amount * (expense.deductiblePct / 100),
        );
      }
    }

    const currentDeclaration = declarations.find(
      (d) => d.year === currentYear && d.quarter === currentQuarter,
    );
    const statusByKey = new Map<string, DeclarationStatus>(
      declarations.map((d) => [`${d.year}-Q${d.quarter}`, d.status]),
    );

    const prevQuarterKey = quarterKeys[quarterKeys.length - 2];

    const ivaInvoicedByQuarter = new Map(
      quarterKeys.map((key) => {
        const total = invoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
          (s, inv) => s + inv.ivaAmount,
          0,
        );
        return [key, total] as const;
      }),
    );
    const ivaDeductibleByQuarter = new Map(quarterKeys.map((key) => [key, 0] as [string, number]));
    for (const expense of recentExpenses) {
      const key = expenseQuarterKey(expense);
      if (ivaDeductibleByQuarter.has(key)) {
        ivaDeductibleByQuarter.set(
          key,
          ivaDeductibleByQuarter.get(key)! +
            (expense.ivaAmount ?? 0) * (ivaDeductiblePctOf(expense) / 100),
        );
      }
    }
    const ivaNetByQuarter = new Map(
      quarterKeys.map(
        (key) =>
          [
            key,
            (ivaInvoicedByQuarter.get(key) ?? 0) - (ivaDeductibleByQuarter.get(key) ?? 0),
          ] as const,
      ),
    );
    const ivaTrendData = quarterKeys.map((key) => ({
      key,
      label: quarterKeyLabel(key),
      value: ivaNetByQuarter.get(key) ?? 0,
    }));

    const grossInvoicedByQuarter = new Map(
      quarterKeys.map((key) => {
        const total = invoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
          (s, inv) => s + inv.total,
          0,
        );
        return [key, total] as const;
      }),
    );
    const paidByQuarter = new Map(
      quarterKeys.map((key) => {
        const total = paidInvoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
          (s, inv) => s + inv.total,
          0,
        );
        return [key, total] as const;
      }),
    );

    // Only quarters from the RETA alta date onward — before that the freelancer
    // wasn't registered, so plotting €0 there just adds an empty gutter.
    const trendData = quarterKeys
      .filter((key) => altaKey === null || compareQuarterKeys(key, altaKey) >= 0)
      .map((key) => {
        const invoiced = grossInvoicedByQuarter.get(key) ?? 0;
        const expenses = expensesByQuarter.get(key) ?? 0;
        const declared = statusByKey.get(key);
        return {
          key,
          label: quarterKeyLabel(key),
          invoiced,
          expenses,
          net: invoiced - expenses,
          status: declared ?? (key === currentKey ? ("in_progress" as const) : ("none" as const)),
        };
      });

    const paidPendingData = quarterKeys.map((key) => {
      const total = grossInvoicedByQuarter.get(key) ?? 0;
      const paid = paidByQuarter.get(key) ?? 0;
      return {
        key,
        label: quarterKeyLabel(key),
        a: paid,
        b: Math.max(0, total - paid),
      };
    });

    const clientInvoiceCountThisYear = new Map<number, number>();
    for (const inv of invoicesThisYear) {
      if (inv.status === "draft") continue;
      clientInvoiceCountThisYear.set(
        inv.clientId,
        (clientInvoiceCountThisYear.get(inv.clientId) ?? 0) + 1,
      );
    }
    const revenueByClientThisYear = revenueByClient(invoicesThisYear);
    const totalRevenueThisYear = revenueByClientThisYear.reduce((s, c) => s + c.total, 0);
    const repeatRevenueThisYear = revenueByClientThisYear
      .filter((c) => (clientInvoiceCountThisYear.get(c.clientId) ?? 0) >= 2)
      .reduce((s, c) => s + c.total, 0);
    const topClientShare =
      totalRevenueThisYear > 0 ? (topClients[0]?.total ?? 0) / totalRevenueThisYear : 0;
    const repeatClientShare =
      totalRevenueThisYear > 0 ? repeatRevenueThisYear / totalRevenueThisYear : 0;

    const topExpenseCategory = expenseByCategory(recentExpenses)[0]?.category;
    const categoryTrendByQuarter = new Map(
      quarterKeys.map((key) => {
        const total = recentExpenses
          .filter(
            (e) =>
              expenseQuarterKey(e) === key &&
              (e.category?.trim() || "Sin categoría") === topExpenseCategory,
          )
          .reduce((s, e) => s + e.amount * (e.deductiblePct / 100), 0);
        return [key, total] as const;
      }),
    );
    const categoryTrendData = quarterKeys.map((key) => ({
      key,
      label: quarterKeyLabel(key),
      value: categoryTrendByQuarter.get(key) ?? 0,
    }));

    const recurring = recurringInvoiceCandidates(invoices, todayIso);
    const maxClientRevenue = Math.max(1, ...topClients.map((c) => c.total));
    const maxCategoryExpense = Math.max(1, ...topCategories.map((c) => c.total));

    return {
      soonIso,
      thisYear,
      quarterPeriod,
      taxDeadlines,
      invoicesThisQuarter,
      recentInvoices,
      topClients,
      expensesThisQuarter,
      topCategories,
      expensesByQuarter,
      currentDeclaration,
      prevQuarterKey,
      ivaTrendData,
      grossInvoicedByQuarter,
      trendData,
      paidPendingData,
      totalRevenueThisYear,
      topClientShare,
      repeatClientShare,
      topExpenseCategory,
      categoryTrendData,
      recurring,
      maxClientRevenue,
      maxCategoryExpense,
    };
  }, [
    invoices,
    recentExpenses,
    quarterKeys,
    altaKey,
    declarations,
    currentKey,
    currentYear,
    currentQuarter,
  ]);

  async function handleGenerateRecurring(id: number) {
    setGeneratingFor(id);
    try {
      await onDuplicateInvoice(id);
    } finally {
      setGeneratingFor(null);
    }
  }

  const totalFacturado = invoicesThisQuarter
    .filter((inv) => inv.status !== "draft")
    .reduce((s, inv) => s + inv.total, 0);
  const pendiente = invoices
    .filter((inv) => inv.status === "issued")
    .reduce((s, inv) => s + inv.total, 0);
  const netoTrimestre = totalFacturado - expensesThisQuarter;

  /** Quarter-over-quarter change for a KPI tile. `invert` flips which direction reads
   * as good news — an expense going up is unfavorable even though the number rose. */
  function kpiDelta(amount: number, invert = false): KpiDelta | undefined {
    if (amount === 0) return undefined;
    const goingUp = amount >= 0;
    const favorable = invert ? !goingUp : goingUp;
    return {
      formatted: `${goingUp ? "+" : "-"}${formatEUR(Math.abs(amount))}`,
      direction: goingUp ? "up" : "down",
      tone: favorable ? "success" : "danger",
    };
  }

  const facturadoDelta = kpiDelta(
    (grossInvoicedByQuarter.get(currentKey) ?? 0) -
      (grossInvoicedByQuarter.get(prevQuarterKey) ?? 0),
  );
  const gastosDelta = kpiDelta(
    (expensesByQuarter.get(currentKey) ?? 0) - (expensesByQuarter.get(prevQuarterKey) ?? 0),
    true,
  );
  const netoDelta = kpiDelta(
    (grossInvoicedByQuarter.get(currentKey) ?? 0) -
      (expensesByQuarter.get(currentKey) ?? 0) -
      ((grossInvoicedByQuarter.get(prevQuarterKey) ?? 0) -
        (expensesByQuarter.get(prevQuarterKey) ?? 0)),
  );

  const kpis = [
    {
      label: t("dashboard.kpis.invoicedQuarter"),
      value: formatEUR(totalFacturado),
      icon: TrendUp,
      tone: "neutral" as const,
      delta: facturadoDelta,
    },
    {
      label: t("dashboard.kpis.expensesQuarter"),
      value: formatEUR(expensesThisQuarter),
      icon: Wallet,
      tone: "neutral" as const,
      delta: gastosDelta,
    },
    {
      label: t("dashboard.kpis.netQuarter"),
      value: formatEUR(netoTrimestre),
      icon: Scales,
      tone: "neutral" as const,
      delta: netoDelta,
    },
    {
      label: t("dashboard.kpis.pendingCollection"),
      value: formatEUR(pendiente),
      icon: Clock,
      tone: "warn" as const,
    },
  ];

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title={t("dashboard.title")}
        actions={
          <>
            <Button variant="secondary" onClick={() => onNavigate("gasto-nuevo")}>
              + {t("dashboard.addExpense")}
            </Button>
            <Button onClick={() => onNavigate("factura-nueva")}>
              + {t("invoices.newInvoice")}
            </Button>
          </>
        }
      />

      <Card className="p-6 mb-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="font-bold text-sm">{quarterKeyLabel(currentKey)}</span>
              <Badge
                tone={
                  currentDeclaration?.status === "completed"
                    ? "success"
                    : currentDeclaration?.status === "in_progress"
                      ? "info"
                      : "neutral"
                }
              >
                {currentDeclaration
                  ? t(`declarations.status.${currentDeclaration.status}`)
                  : t("dashboard.declarationStatus.notStarted")}
              </Badge>
            </div>
            {taxDeadlines[0] && (
              <div
                className={`text-xs mt-1 ${
                  taxDeadlines[0].dueDate <= soonIso ? "text-warn font-medium" : "text-ink-soft"
                }`}
              >
                {t("dashboard.declarationStatus.nextDeadline", {
                  label: taxDeadlines[0].label,
                  date: formatDate(taxDeadlines[0].dueDate),
                })}
              </div>
            )}
            {currentDeclarationDetail && (
              <div className="flex items-center gap-4 mt-3">
                {activeModelos.map((modelo) => {
                  const attached = !!currentDeclarationDetail[MODELO_PATH_KEY[modelo]];
                  return (
                    <span
                      key={modelo}
                      className="flex items-center gap-1.5 text-xs text-ink-soft"
                      title={
                        attached
                          ? t("declarations.detail.attached")
                          : t("dashboard.declarationStatus.missing")
                      }
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          attached ? "bg-success" : "bg-ink-soft/40"
                        }`}
                      />
                      Modelo {modelo}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <Button onClick={() => onNavigate("resumen-trimestral")} className="shrink-0">
            {t("dashboard.declarationStatus.goToSummary")}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {kpis.map((kpi) => (
          <KpiTile
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            tone={kpi.tone}
            delta={kpi.delta}
          />
        ))}
      </div>

      <div className="mb-4">
        <Card className="p-6">
          <div className="font-bold text-sm mb-4">{t("dashboard.trend.title")}</div>
          <QuarterTrendChart
            data={trendData}
            invoicedLabel={t("dashboard.kpis.invoicedQuarter")}
            expensesLabel={t("dashboard.kpis.expensesQuarter")}
            netLabel={t("dashboard.kpis.netQuarter")}
            formatValue={formatEUR}
            onSelectQuarter={onNavigateToQuarter}
          />
        </Card>
      </div>

      <div className="grid grid-cols-[1.5fr_1fr] gap-4">
        <Card className="p-6">
          <div className="font-bold text-sm mb-4">{t("dashboard.recentInvoices.title")}</div>
          {recentInvoices.map((inv) => {
            const meta = invoiceStatusMeta(inv.status);
            return (
              <div
                key={inv.id}
                onClick={() => onOpenInvoice(inv.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    if (e.key === " ") e.preventDefault();
                    onOpenInvoice(inv.id);
                  }
                }}
                className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-control border-b border-border last:border-b-0
                           cursor-pointer transition-colors hover:bg-surface-alt
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="font-semibold text-[13px] font-mono text-accent w-19 shrink-0">
                    {invoiceNumberLabel(inv)}
                  </div>
                  <div className="font-medium text-[13.5px] whitespace-nowrap overflow-hidden text-ellipsis">
                    {inv.clientName}
                  </div>
                </div>
                <div className="flex items-center gap-3.5 shrink-0">
                  <Badge tone={meta.tone}>{t(meta.labelKey)}</Badge>
                  <div className="font-semibold text-[13.5px] font-mono w-[90px] text-right">
                    {formatEUR(inv.total)}
                  </div>
                </div>
              </div>
            );
          })}
        </Card>

        <Card className="p-6">
          <div className="font-bold text-sm mb-4">{t("dashboard.recurring.title")}</div>
          {recurring.length === 0 && (
            <div className="text-xs text-ink-soft">{t("dashboard.noData")}</div>
          )}
          {recurring.map((c) => (
            <div key={c.clientId} className="py-2.5 border-b border-border last:border-b-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[13px] truncate min-w-0">{c.clientName}</span>
                <span className="font-semibold text-[12.5px] font-mono shrink-0">
                  {formatEUR(c.lastInvoiceTotal)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-xs text-ink-soft">{t("dashboard.recurring.lastMonth")}</span>
                <Button
                  variant="secondary"
                  className="px-2.5 py-1 text-xs shrink-0"
                  onClick={() => void handleGenerateRecurring(c.lastInvoiceId)}
                  disabled={generatingFor === c.lastInvoiceId}
                >
                  {generatingFor === c.lastInvoiceId
                    ? t("dashboard.recurring.generating")
                    : t("dashboard.recurring.generateShort")}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <Card className="p-6">
          <div className="font-bold text-sm mb-4">
            {t("dashboard.revenueByClient.title", { year: thisYear })}
          </div>
          {topClients.length === 0 && (
            <div className="text-xs text-ink-soft">{t("dashboard.noData")}</div>
          )}
          {topClients.map((c) => (
            <div key={c.clientId} className="py-2 border-b border-border last:border-b-0">
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-medium text-[13.5px] truncate min-w-0">{c.clientName}</span>
                <span className="font-semibold text-[13px] font-mono shrink-0">
                  {formatEUR(c.total)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${(c.total / maxClientRevenue) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </Card>

        <Card className="p-6">
          <div className="font-bold text-sm mb-4">
            {t("dashboard.expensesByCategory.title", { period: quarterPeriod.label })}
          </div>
          {topCategories.length === 0 && (
            <div className="text-xs text-ink-soft">{t("dashboard.noData")}</div>
          )}
          {topCategories.map((c) => (
            <div key={c.category} className="py-2 border-b border-border last:border-b-0">
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-medium text-[13.5px] truncate min-w-0">{c.category}</span>
                <span className="font-semibold text-[13px] font-mono shrink-0">
                  {formatEUR(c.total)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
                <div
                  className="h-full rounded-full bg-warn"
                  style={{ width: `${(c.total / maxCategoryExpense) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mt-8 mb-4">
        {t("dashboard.analytics.title")}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="font-bold text-sm mb-4">{t("dashboard.analytics.ivaTrend.title")}</div>
          <QuarterBarChart
            data={ivaTrendData}
            color="var(--color-accent)"
            seriesLabel={t("dashboard.analytics.ivaTrend.title")}
            formatValue={formatEUR}
            formatTooltipValue={(value) =>
              value < 0
                ? `${formatEUR(Math.abs(value))} ${t("dashboard.analytics.ivaTrend.creditSuffix")}`
                : formatEUR(value)
            }
          />
          <div className="text-[11px] text-ink-soft mt-3">
            {t("dashboard.analytics.ivaTrend.subtitle")}
          </div>
        </Card>

        <Card className="p-6">
          <div className="font-bold text-sm mb-4">
            {t("dashboard.analytics.paidVsOutstanding.title")}
          </div>
          <StackedQuarterBarChart
            data={paidPendingData}
            aColor="var(--color-success)"
            bColor="var(--color-info)"
            aLabel={t("dashboard.analytics.paidVsOutstanding.paid")}
            bLabel={t("dashboard.analytics.paidVsOutstanding.pending")}
            formatValue={formatEUR}
          />
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <Card className="p-6">
          <div className="font-bold text-sm mb-4">{t("dashboard.analytics.composition.title")}</div>
          {totalRevenueThisYear === 0 ? (
            <div className="text-xs text-ink-soft">{t("dashboard.noData")}</div>
          ) : (
            <>
              <div className="py-2 border-b border-border">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="font-medium text-[13.5px] truncate min-w-0">
                    {t("dashboard.analytics.composition.topClient", {
                      client: topClients[0]?.clientName ?? "",
                    })}
                  </span>
                  <span className="font-semibold text-[13px] font-mono shrink-0">
                    {Math.round(topClientShare * 100)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface-alt overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${topClientShare * 100}%` }}
                  />
                </div>
              </div>
              <div className="py-2">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="font-medium text-[13.5px]">
                    {t("dashboard.analytics.composition.repeatClients")}
                  </span>
                  <span className="font-semibold text-[13px] font-mono shrink-0">
                    {Math.round(repeatClientShare * 100)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface-alt overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${repeatClientShare * 100}%` }}
                  />
                </div>
              </div>
            </>
          )}
        </Card>

        <Card className="p-6">
          <div className="font-bold text-sm mb-4">
            {topExpenseCategory
              ? t("dashboard.analytics.topCategoryTrend.title", { category: topExpenseCategory })
              : t("dashboard.analytics.topCategoryTrend.titleEmpty")}
          </div>
          {!topExpenseCategory ? (
            <div className="text-xs text-ink-soft">{t("dashboard.noData")}</div>
          ) : (
            <QuarterBarChart
              data={categoryTrendData}
              color="var(--color-warn)"
              seriesLabel={topExpenseCategory}
              formatValue={formatEUR}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
