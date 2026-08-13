import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TrendUp,
  TrendDown,
  Clock,
  UsersThree,
  Wallet,
  CalendarCheck,
  Lock,
} from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { KpiTile } from "../components/ui/KpiTile";
import { PageHeader } from "../components/PageHeader";
import { listClients } from "../db/clients";
import { listExpenses } from "../db/expenses";
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
import { agingReport, expenseByCategory, revenueByClient } from "../lib/analytics";
import { nextTaxDeadlines, deadlineQuarterKey } from "../lib/taxCalendar";
import { recurringInvoiceCandidates } from "../lib/recurring";
import { invoicesInPeriod, paidInvoicesInPeriod } from "../lib/quarterlyDeclaration";
import type { InvoiceListItem } from "../db/invoices";
import { listDeclarations, getDeclaration } from "../db/declarations";
import type {
  DeclarationListItem,
  DeclarationDetail,
  DeclarationStatus,
  Modelo,
} from "../db/declarations";
import type { Screen } from "../types";

const RECENT_QUARTERS = 4;
const CURRENT_KEY = quarterKeyOf(defaultQuarterPeriod().from);
const [CURRENT_YEAR_STR, CURRENT_QUARTER_STR] = CURRENT_KEY.split("-Q");
const CURRENT_YEAR = Number(CURRENT_YEAR_STR);
const CURRENT_QUARTER = Number(CURRENT_QUARTER_STR);

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

const QUARTER_KEYS = recentQuarterKeys(CURRENT_KEY, RECENT_QUARTERS);
const QUARTER_WINDOW_FROM = quarterKeyRange(QUARTER_KEYS[0]).from;
const QUARTER_WINDOW_TO = quarterKeyRange(QUARTER_KEYS[QUARTER_KEYS.length - 1]).to;

/** The quarter an expense counts toward — its own date's quarter, unless overridden. Mirrors
 * the OR-match `listExpenses({ quarterKeys })` already applies server-side. */
function expenseQuarterKey(expense: ExpenseRecord): string {
  return expense.declaredPeriod ?? quarterKeyOf(expense.date);
}

const MODELOS: Modelo[] = ["303", "130", "111"];
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
  const [clientCount, setClientCount] = useState(0);
  const [recentExpenses, setRecentExpenses] = useState<ExpenseRecord[]>([]);
  const [generatingFor, setGeneratingFor] = useState<number | null>(null);
  const [declarations, setDeclarations] = useState<DeclarationListItem[]>([]);
  const [currentDeclarationDetail, setCurrentDeclarationDetail] =
    useState<DeclarationDetail | null>(null);
  const [altaKey, setAltaKey] = useState<string | null>(null);

  useEffect(() => {
    listClients().then((clients) => setClientCount(clients.length));
  }, []);

  useEffect(() => {
    getPreferences().then((prefs) => setAltaKey(quarterKeyOf(prefs.retaStartDate)));
  }, []);

  useEffect(() => {
    listExpenses({
      from: QUARTER_WINDOW_FROM,
      to: QUARTER_WINDOW_TO,
      quarterKeys: QUARTER_KEYS,
    }).then(setRecentExpenses);
  }, []);

  useEffect(() => {
    listDeclarations().then(setDeclarations);
  }, []);

  useEffect(() => {
    const current = declarations.find(
      (d) => d.year === CURRENT_YEAR && d.quarter === CURRENT_QUARTER,
    );
    const detail =
      current?.status === "in_progress" ? getDeclaration(current.id) : Promise.resolve(null);
    detail.then(setCurrentDeclarationDetail);
  }, [declarations]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const soonIso = new Date(new Date(todayIso).getTime() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const thisYear = new Date().getFullYear();
  const invoicesThisYear = invoices.filter(
    (inv) => inv.issueDate !== null && inv.issueDate.startsWith(String(thisYear)),
  );
  const quarterPeriod = defaultQuarterPeriod();
  const invoicesThisQuarter = invoices.filter(
    (inv) =>
      inv.issueDate !== null &&
      inv.issueDate >= quarterPeriod.from &&
      inv.issueDate <= quarterPeriod.to,
  );

  const recentInvoices = invoices.slice(0, 4);
  const upcomingDue = invoices.filter((inv) => inv.status === "issued").slice(0, 3);
  const topClients = revenueByClient(invoicesThisYear).slice(0, 5);
  const aging = agingReport(invoices, todayIso).filter((g) => g.bucket !== "current");
  const taxDeadlines = nextTaxDeadlines(todayIso, 2);

  const quarterExpenses = recentExpenses.filter((e) => expenseQuarterKey(e) === CURRENT_KEY);
  const expensesThisQuarter = quarterExpenses.reduce(
    (s, e) => s + e.amount * (e.deductiblePct / 100),
    0,
  );
  const topCategories = expenseByCategory(quarterExpenses).slice(0, 5);

  const invoicedByQuarter = new Map(
    QUARTER_KEYS.map((key) => {
      const total = invoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
        (s, inv) => s + inv.subtotal,
        0,
      );
      return [key, total] as const;
    }),
  );

  const expensesByQuarter = new Map(QUARTER_KEYS.map((key) => [key, 0] as [string, number]));
  for (const expense of recentExpenses) {
    const key = expenseQuarterKey(expense);
    if (expensesByQuarter.has(key)) {
      expensesByQuarter.set(
        key,
        expensesByQuarter.get(key)! + expense.amount * (expense.deductiblePct / 100),
      );
    }
  }

  const maxTrendValue = Math.max(
    1,
    ...QUARTER_KEYS.flatMap((key) => [
      invoicedByQuarter.get(key) ?? 0,
      expensesByQuarter.get(key) ?? 0,
    ]),
  );

  const currentDeclaration = declarations.find(
    (d) => d.year === CURRENT_YEAR && d.quarter === CURRENT_QUARTER,
  );
  const statusByKey = new Map<string, DeclarationStatus>(
    declarations.map((d) => [`${d.year}-Q${d.quarter}`, d.status]),
  );

  const prevQuarterKey = QUARTER_KEYS[QUARTER_KEYS.length - 2];
  const currInvoiced = invoicedByQuarter.get(CURRENT_KEY) ?? 0;
  const currExpenses = expensesByQuarter.get(CURRENT_KEY) ?? 0;
  const prevInvoiced = invoicedByQuarter.get(prevQuarterKey) ?? 0;
  const prevExpenses = expensesByQuarter.get(prevQuarterKey) ?? 0;
  function comparisonRow(label: string, current: number, prior: number) {
    return { label, value: current, delta: current - prior };
  }
  const comparison = [
    comparisonRow(t("dashboard.comparison.invoiced"), currInvoiced, prevInvoiced),
    comparisonRow(t("dashboard.comparison.expenses"), currExpenses, prevExpenses),
    comparisonRow(
      t("dashboard.comparison.net"),
      currInvoiced - currExpenses,
      prevInvoiced - prevExpenses,
    ),
  ];

  const ivaInvoicedByQuarter = new Map(
    QUARTER_KEYS.map((key) => {
      const total = invoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
        (s, inv) => s + inv.ivaAmount,
        0,
      );
      return [key, total] as const;
    }),
  );
  const ivaDeductibleByQuarter = new Map(QUARTER_KEYS.map((key) => [key, 0] as [string, number]));
  for (const expense of recentExpenses) {
    const key = expenseQuarterKey(expense);
    if (ivaDeductibleByQuarter.has(key)) {
      ivaDeductibleByQuarter.set(
        key,
        ivaDeductibleByQuarter.get(key)! + (expense.ivaAmount ?? 0) * (expense.deductiblePct / 100),
      );
    }
  }
  const ivaNetByQuarter = new Map(
    QUARTER_KEYS.map(
      (key) =>
        [key, (ivaInvoicedByQuarter.get(key) ?? 0) - (ivaDeductibleByQuarter.get(key) ?? 0)] as const,
    ),
  );
  const maxIvaNetValue = Math.max(
    1,
    ...QUARTER_KEYS.map((key) => Math.max(0, ivaNetByQuarter.get(key) ?? 0)),
  );

  const grossInvoicedByQuarter = new Map(
    QUARTER_KEYS.map((key) => {
      const total = invoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
        (s, inv) => s + inv.total,
        0,
      );
      return [key, total] as const;
    }),
  );
  const paidByQuarter = new Map(
    QUARTER_KEYS.map((key) => {
      const total = paidInvoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
        (s, inv) => s + inv.total,
        0,
      );
      return [key, total] as const;
    }),
  );

  const recurring = recurringInvoiceCandidates(invoices, todayIso);
  const maxClientRevenue = Math.max(1, ...topClients.map((c) => c.total));
  const maxCategoryExpense = Math.max(1, ...topCategories.map((c) => c.total));

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

  const kpis = [
    {
      label: t("dashboard.kpis.invoicedQuarter"),
      value: formatEUR(totalFacturado),
      icon: TrendUp,
      tone: "neutral" as const,
    },
    {
      label: t("dashboard.kpis.pendingCollection"),
      value: formatEUR(pendiente),
      icon: Clock,
      tone: "warn" as const,
    },
    {
      label: t("dashboard.kpis.activeClients"),
      value: String(clientCount),
      icon: UsersThree,
      tone: "neutral" as const,
    },
    {
      label: t("dashboard.kpis.expensesQuarter"),
      value: formatEUR(expensesThisQuarter),
      icon: Wallet,
      tone: "neutral" as const,
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
              <span className="font-bold text-sm">{quarterKeyLabel(CURRENT_KEY)}</span>
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
                {MODELOS.map((modelo) => {
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
          />
        ))}
      </div>

      <div className="grid grid-cols-[1fr_1.4fr] gap-4 mb-4">
        <Card className="p-6">
          <div className="font-bold text-sm mb-4">{t("dashboard.comparison.title")}</div>
          {comparison.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between py-2.5 border-b border-border last:border-b-0"
            >
              <span className="font-medium text-[13.5px]">{row.label}</span>
              <span className="flex items-center gap-2.5">
                {row.delta !== 0 && (
                  <span
                    className={`flex items-center gap-1 text-xs font-medium ${
                      row.delta >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {row.delta >= 0 ? (
                      <TrendUp size={12} weight="bold" />
                    ) : (
                      <TrendDown size={12} weight="bold" />
                    )}
                    {row.delta >= 0 ? "+" : "-"}
                    {formatEUR(Math.abs(row.delta))}
                  </span>
                )}
                <span className="font-semibold text-[13.5px] font-mono w-[90px] text-right">
                  {formatEUR(row.value)}
                </span>
              </span>
            </div>
          ))}
          <div className="text-[11px] text-ink-soft mt-3">{t("dashboard.comparison.subtitle")}</div>
        </Card>

        <Card className="p-6">
          <div className="font-bold text-sm mb-4">{t("dashboard.trend.title")}</div>
          {QUARTER_KEYS.map((key) => {
            const invoiced = invoicedByQuarter.get(key) ?? 0;
            const expenses = expensesByQuarter.get(key) ?? 0;
            const status = statusByKey.get(key);
            const locked = altaKey !== null && compareQuarterKeys(key, altaKey) < 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onNavigateToQuarter(key)}
                disabled={locked}
                className="w-full text-left px-2 -mx-2 py-2 border-b border-border last:border-b-0
                         rounded-control cursor-pointer hover:bg-surface-alt
                         transition-colors ease-[var(--ease-out)]
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring
                         disabled:cursor-default disabled:hover:bg-transparent"
              >
                <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5">
                  {locked ? (
                    <Lock size={10} weight="bold" className="text-ink-soft shrink-0" />
                  ) : (
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        status === "completed"
                          ? "bg-success"
                          : status === "in_progress"
                            ? "bg-info"
                            : "bg-ink-soft/40"
                      }`}
                    />
                  )}
                  {quarterKeyLabel(key)}
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-alt overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(invoiced / maxTrendValue) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] w-20 text-right shrink-0">
                    {formatEUR(invoiced)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-alt overflow-hidden">
                    <div
                      className="h-full rounded-full bg-warn"
                      style={{ width: `${(expenses / maxTrendValue) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] w-20 text-right shrink-0">
                    {formatEUR(expenses)}
                  </span>
                </div>
              </button>
            );
          })}
        </Card>
      </div>

      {recurring.length > 0 && (
        <Card className="p-6 mb-4">
          <div className="font-bold text-sm mb-4">{t("dashboard.recurring.title")}</div>
          {recurring.map((c) => (
            <div
              key={c.clientId}
              className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-b-0"
            >
              <div className="min-w-0">
                <div className="font-semibold text-[13px] truncate">{c.clientName}</div>
                <div className="text-xs text-ink-soft truncate">
                  {t("dashboard.recurring.lastInvoiced", {
                    amount: formatEUR(c.lastInvoiceTotal),
                  })}
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={() => handleGenerateRecurring(c.lastInvoiceId)}
                disabled={generatingFor === c.lastInvoiceId}
              >
                {generatingFor === c.lastInvoiceId
                  ? t("dashboard.recurring.generating")
                  : t("dashboard.recurring.generate")}
              </Button>
            </div>
          ))}
        </Card>
      )}

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
          <div className="font-bold text-sm mb-4">{t("dashboard.upcomingDue.title")}</div>
          {upcomingDue.length === 0 && (
            <div className="text-xs text-ink-soft">{t("dashboard.noData")}</div>
          )}
          {upcomingDue.map((inv) => (
            <div key={inv.id} className="py-2.5 border-b border-border last:border-b-0">
              <div className="font-semibold text-[13px]">{inv.clientName}</div>
              <div className="flex justify-between mt-0.5">
                <span className="text-xs text-ink-soft">
                  {t("dashboard.upcomingDue.due", { date: formatDate(inv.dueDate) })}
                </span>
                <span className="font-semibold text-[12.5px] font-mono">
                  {formatEUR(inv.total)}
                </span>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <Card className="p-6">
          <div className="font-bold text-sm mb-4">{t("dashboard.aging.title")}</div>
          {aging.length === 0 && (
            <div className="text-xs text-ink-soft">{t("dashboard.noData")}</div>
          )}
          {aging.map((g) => (
            <div
              key={g.bucket}
              className="flex items-center justify-between py-2.5 border-b border-border last:border-b-0"
            >
              <span className="font-medium text-[13.5px]">
                {t(`dashboard.aging.buckets.${g.bucket}` as const)}
              </span>
              <span className="flex items-center gap-2.5">
                <span className="text-xs text-ink-soft">
                  {t("dashboard.aging.invoiceCount", { count: g.invoices.length })}
                </span>
                <span className="font-semibold text-[13.5px] font-mono w-[90px] text-right">
                  {formatEUR(g.total)}
                </span>
              </span>
            </div>
          ))}
        </Card>

        <Card className="p-6">
          <div className="font-bold text-sm mb-4">{t("dashboard.taxCalendar.title")}</div>
          {taxDeadlines.length === 0 && (
            <div className="text-xs text-ink-soft">{t("dashboard.noData")}</div>
          )}
          {taxDeadlines.map((d) => {
            const declarationStatus =
              d.model === "130/303"
                ? (() => {
                    const key = deadlineQuarterKey(d.dueDate);
                    const [yearStr, q] = key.split("-Q");
                    return declarations.find(
                      (dec) => dec.year === Number(yearStr) && dec.quarter === Number(q),
                    )?.status;
                  })()
                : undefined;
            return (
              <div
                key={d.dueDate}
                className="flex items-center justify-between py-2.5 border-b border-border last:border-b-0"
              >
                <div className="flex items-center gap-2.5">
                  <CalendarCheck size={16} weight="bold" className="text-ink-soft" />
                  <span className="font-medium text-[13.5px]">{d.label}</span>
                </div>
                <span className="flex items-center gap-2 font-semibold text-[13.5px] font-mono">
                  {d.model === "130/303" && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        declarationStatus === "completed"
                          ? "bg-success"
                          : declarationStatus === "in_progress"
                            ? "bg-info"
                            : "bg-ink-soft/40"
                      }`}
                    />
                  )}
                  {formatDate(d.dueDate)}
                </span>
              </div>
            );
          })}
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
          {QUARTER_KEYS.map((key) => {
            const net = ivaNetByQuarter.get(key) ?? 0;
            return (
              <div key={key} className="py-2 border-b border-border last:border-b-0">
                <div className="text-xs font-medium mb-1.5">{quarterKeyLabel(key)}</div>
                {net < 0 ? (
                  <div className="text-xs text-success">
                    {t("dashboard.analytics.ivaTrend.credit", { amount: formatEUR(Math.abs(net)) })}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-surface-alt overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${(net / maxIvaNetValue) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] w-20 text-right shrink-0">
                      {formatEUR(net)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </Card>

        <Card className="p-6">
          <div className="font-bold text-sm mb-4">
            {t("dashboard.analytics.paidVsOutstanding.title")}
          </div>
          {QUARTER_KEYS.map((key) => {
            const total = grossInvoicedByQuarter.get(key) ?? 0;
            const paid = paidByQuarter.get(key) ?? 0;
            const pending = Math.max(0, total - paid);
            const paidPct = total > 0 ? (paid / total) * 100 : 0;
            const pendingPct = total > 0 ? (pending / total) * 100 : 0;
            return (
              <div key={key} className="py-2 border-b border-border last:border-b-0">
                <div className="flex items-center justify-between text-xs font-medium mb-1.5">
                  <span>{quarterKeyLabel(key)}</span>
                  <span className="font-mono text-ink-soft">{formatEUR(total)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden flex">
                  <div className="h-full bg-success" style={{ width: `${paidPct}%` }} />
                  <div className="h-full bg-warn" style={{ width: `${pendingPct}%` }} />
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-4 mt-3 text-[11px] text-ink-soft">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              {t("dashboard.analytics.paidVsOutstanding.paid")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-warn" />
              {t("dashboard.analytics.paidVsOutstanding.pending")}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
