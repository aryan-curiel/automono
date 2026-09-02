import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Receipt, CalendarCheck, ArrowsClockwise, Tray, Sparkle } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/PageHeader";
import { countExpenses } from "../db/expenses";
import { countReceiptInbox } from "../db/receiptInbox";
import { listContracts, type ContractRecord } from "../db/contracts";
import { formatDate, formatEUR } from "../lib/format";
import { overdueSummary } from "../lib/analytics";
import { nextTaxDeadlines } from "../lib/taxCalendar";
import { recurringInvoiceCandidates } from "../lib/recurring";
import type { InvoiceListItem } from "../db/invoices";
import type { Screen } from "../types";

interface DashboardProps {
  invoices: InvoiceListItem[];
  loading?: boolean;
  onNavigate: (screen: Screen, id?: string) => void;
  onDuplicateInvoice: (id: number) => Promise<void>;
}

/**
 * The Home screen: a task inbox, not a report. Four action rows — overdue invoices, the next
 * tax deadline, recurring invoices ready to draft, unreviewed receipts — each deep-linking to
 * the screen that resolves it. A zero-count row is hidden; the tax deadline is always shown.
 * Analytics moved to ResumenTrimestral / ResumenAnual (issue #86).
 */
export function Dashboard({
  invoices,
  loading = false,
  onNavigate,
  onDuplicateInvoice,
}: DashboardProps) {
  const { t } = useTranslation();
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [receiptCount, setReceiptCount] = useState(0);
  const [expenseCount, setExpenseCount] = useState<number | null>(null);
  const [generatingFor, setGeneratingFor] = useState<number | null>(null);

  useEffect(() => {
    void listContracts().then(setContracts);
  }, []);
  useEffect(() => {
    void countReceiptInbox().then(setReceiptCount);
  }, []);
  useEffect(() => {
    void countExpenses().then(setExpenseCount);
  }, []);

  // ponytail: "today" is captured at memo time, not per render — a Home screen left open across
  // midnight keeps yesterday's date until invoices/contracts next change. Fine here.
  const { soonIso, overdue, deadline, recurring } = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    return {
      soonIso: new Date(new Date(todayIso).getTime() + 14 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      overdue: overdueSummary(invoices, todayIso),
      deadline: nextTaxDeadlines(todayIso, 1)[0] ?? null,
      recurring: recurringInvoiceCandidates(invoices, contracts, todayIso),
    };
  }, [invoices, contracts]);

  async function handleGenerateRecurring(id: number) {
    setGeneratingFor(id);
    try {
      await onDuplicateInvoice(id);
    } finally {
      setGeneratingFor(null);
    }
  }

  // Brand-new install — no invoices and no expenses yet. `expenseCount === null` means the count
  // is still loading, so hold off rather than flash the first-run panel at a user who has data.
  const firstRun =
    !loading && expenseCount !== null && invoices.length === 0 && expenseCount === 0;

  if (firstRun) {
    return (
      <div className="px-8 pb-15">
        <PageHeader title={t("dashboard.title")} />
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <Sparkle size={40} className="text-ink-soft/40" />
          <div className="font-bold text-base">{t("dashboard.firstRun.title")}</div>
          <div className="text-sm text-ink-soft max-w-md">{t("dashboard.firstRun.subtitle")}</div>
          <div className="flex items-center gap-2.5 mt-2">
            <Button onClick={() => onNavigate("factura-nueva")}>
              + {t("invoices.newInvoice")}
            </Button>
            <Button variant="secondary" onClick={() => onNavigate("cliente-nuevo")}>
              + {t("clients.newClient")}
            </Button>
            <Button variant="secondary" onClick={() => onNavigate("gasto-nuevo")}>
              + {t("dashboard.addExpense")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const deadlineSoon = deadline !== null && deadline.dueDate <= soonIso;
  const nothingToDo = overdue.count === 0 && recurring.length === 0 && receiptCount === 0;

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

      <Card className="px-4">
        <div className="divide-y divide-border">
          {overdue.count > 0 && (
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <Receipt size={18} className="text-warn shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-[13.5px]">
                    {t("dashboard.inbox.overdue.title", { count: overdue.count })}
                  </div>
                  <div className="text-xs text-ink-soft mt-0.5">
                    {t("dashboard.inbox.overdue.detail", { amount: formatEUR(overdue.total) })}
                  </div>
                </div>
              </div>
              <Button
                variant="secondary"
                className="shrink-0"
                onClick={() => onNavigate("facturas", "cobros")}
              >
                {t("dashboard.inbox.overdue.action")}
              </Button>
            </div>
          )}

          {deadline && (
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <CalendarCheck
                  size={18}
                  className={`shrink-0 ${deadlineSoon ? "text-warn" : "text-ink-soft"}`}
                />
                <div className="min-w-0">
                  <div className="font-semibold text-[13.5px]">
                    {t("dashboard.inbox.deadline.title", { label: deadline.label })}
                  </div>
                  <div
                    className={`text-xs mt-0.5 ${deadlineSoon ? "text-warn font-medium" : "text-ink-soft"}`}
                  >
                    {t("dashboard.inbox.deadline.detail", { date: formatDate(deadline.dueDate) })}
                  </div>
                </div>
              </div>
              <Button
                variant="secondary"
                className="shrink-0"
                onClick={() => onNavigate("resumen-trimestral")}
              >
                {t("dashboard.inbox.deadline.action")}
              </Button>
            </div>
          )}

          {recurring.length > 0 && (
            <div className="py-4">
              <div className="flex items-center gap-3">
                <ArrowsClockwise size={18} className="text-ink-soft shrink-0" />
                <div className="font-semibold text-[13.5px]">
                  {t("dashboard.inbox.recurring.title", { count: recurring.length })}
                </div>
              </div>
              <div className="pl-8 mt-2 flex flex-col gap-2">
                {recurring.map((c) => (
                  <div key={c.clientId} className="flex items-center justify-between gap-3">
                    <span className="text-[13px] truncate min-w-0">
                      {c.clientName}
                      <span className="text-ink-soft">
                        {" · "}
                        {formatEUR(c.lastInvoiceTotal)}
                        {c.dueDate
                          ? ` · ${t("dashboard.recurring.dueOn", { date: formatDate(c.dueDate) })}`
                          : ""}
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-xs shrink-0"
                      disabled={generatingFor === c.lastInvoiceId}
                      onClick={() => void handleGenerateRecurring(c.lastInvoiceId)}
                    >
                      {generatingFor === c.lastInvoiceId
                        ? t("dashboard.recurring.generating")
                        : t("dashboard.recurring.generateShort")}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {receiptCount > 0 && (
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <Tray size={18} className="text-ink-soft shrink-0" />
                <div className="font-semibold text-[13.5px]">
                  {t("dashboard.inbox.receipts.title", { count: receiptCount })}
                </div>
              </div>
              <Button
                variant="secondary"
                className="shrink-0"
                onClick={() => onNavigate("gastos", "inbox")}
              >
                {t("dashboard.inbox.receipts.action")}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {nothingToDo && (
        <div className="text-xs text-ink-soft mt-4 px-1">{t("dashboard.allClear")}</div>
      )}
    </div>
  );
}
