import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TrendUp, Clock, UsersThree, Wallet, CalendarCheck } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { KpiTile } from "../components/ui/KpiTile";
import { PageHeader } from "../components/PageHeader";
import { listClients } from "../db/clients";
import { listExpenses } from "../db/expenses";
import type { ExpenseRecord } from "../db/expenses";
import { invoiceNumberLabel } from "../lib/invoice";
import { invoiceStatusMeta } from "../lib/status";
import { formatDate, formatEUR } from "../lib/format";
import {
  defaultQuarterPeriod,
  previousQuarterKey,
  quarterKeyLabel,
  quarterKeyOf,
  quarterRange,
} from "../lib/dateRange";
import { agingReport, expenseByCategory, revenueByClient } from "../lib/analytics";
import { nextTaxDeadlines } from "../lib/taxCalendar";
import { recurringInvoiceCandidates } from "../lib/recurring";
import type { InvoiceListItem } from "../db/invoices";
import { listDeclarations, getDeclaration } from "../db/declarations";
import type {
  DeclarationListItem,
  DeclarationDetail,
  DeclarationStatus,
  Modelo,
} from "../db/declarations";
import type { Screen } from "../types";

const RECENT_QUARTERS = 6;
const CURRENT_KEY = quarterKeyOf(defaultQuarterPeriod().from);
const [CURRENT_YEAR_STR, CURRENT_QUARTER_STR] = CURRENT_KEY.split("-Q");
const CURRENT_YEAR = Number(CURRENT_YEAR_STR);
const CURRENT_QUARTER = Number(CURRENT_QUARTER_STR);

/** The [from, to] date range of a "YYYY-QN" quarter key. */
function quarterKeyRange(key: string): { from: string; to: string } {
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

// DeclarationStatus is wired into JSX starting in Tasks 4-5 (quarter strip, trend chart) —
// keep noUnusedLocals quiet until then.
export type { DeclarationStatus };

interface DashboardProps {
  invoices: InvoiceListItem[];
  onNavigate: (screen: Screen) => void;
  onOpenInvoice: (id: number) => void;
  onDuplicateInvoice: (id: number) => Promise<void>;
}

export function Dashboard({
  invoices,
  onNavigate,
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

  useEffect(() => {
    listClients().then((clients) => setClientCount(clients.length));
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
      const { from, to } = quarterKeyRange(key);
      const total = invoices
        .filter(
          (inv) =>
            inv.status !== "draft" &&
            inv.issueDate !== null &&
            inv.issueDate >= from &&
            inv.issueDate <= to,
        )
        .reduce((s, inv) => s + inv.total, 0);
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

  // maxTrendValue is wired into JSX starting in Task 5 (trend chart) — keep noUnusedLocals
  // quiet until then.
  void maxTrendValue;

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
            <div className="text-xs text-ink-soft">
              {t("dashboard.declarationStatus.summary", {
                invoiced: formatEUR(totalFacturado),
                expenses: formatEUR(expensesThisQuarter),
              })}
            </div>
            {taxDeadlines[0] && (
              <div
                className={`text-xs mt-1 ${
                  taxDeadlines[0].dueDate <= soonIso ? "text-warn font-medium" : "text-ink-soft"
                }`}
              >
                {t("dashboard.declarationStatus.nextDeadline", {
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
          {taxDeadlines.map((d) => (
            <div
              key={d.dueDate}
              className="flex items-center justify-between py-2.5 border-b border-border last:border-b-0"
            >
              <div className="flex items-center gap-2.5">
                <CalendarCheck size={16} weight="bold" className="text-ink-soft" />
                <span className="font-medium text-[13.5px]">{d.label}</span>
              </div>
              <span className="font-semibold text-[13.5px] font-mono">{formatDate(d.dueDate)}</span>
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
    </div>
  );
}
