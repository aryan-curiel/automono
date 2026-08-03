import { useEffect, useState } from "react";
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
import { monthRange, yearRange } from "../lib/dateRange";
import { agingReport, expenseByCategory, revenueByClient, type AgingBucket } from "../lib/analytics";
import { nextTaxDeadlines } from "../lib/taxCalendar";
import { recurringInvoiceCandidates } from "../lib/recurring";
import type { InvoiceListItem } from "../db/invoices";
import type { Screen } from "../types";

const AGING_LABEL: Record<AgingBucket, string> = {
  current: "Al día",
  "0-30": "0-30 días",
  "30-60": "30-60 días",
  "60+": "60+ días",
};

interface DashboardProps {
  invoices: InvoiceListItem[];
  onNavigate: (screen: Screen) => void;
  onOpenInvoice: (id: number) => void;
  onDuplicateInvoice: (id: number) => Promise<void>;
}

export function Dashboard({ invoices, onNavigate, onOpenInvoice, onDuplicateInvoice }: DashboardProps) {
  const [clientCount, setClientCount] = useState(0);
  const [expensesThisMonth, setExpensesThisMonth] = useState(0);
  const [expensesThisYear, setExpensesThisYear] = useState<ExpenseRecord[]>([]);
  const [generatingFor, setGeneratingFor] = useState<number | null>(null);

  useEffect(() => {
    listClients().then((clients) => setClientCount(clients.length));
  }, []);

  useEffect(() => {
    const now = new Date();
    const { from, to } = monthRange(now.getFullYear(), now.getMonth() + 1);
    listExpenses({ from, to }).then((expenses) =>
      setExpensesThisMonth(expenses.reduce((s, e) => s + e.amount, 0)),
    );
  }, []);

  useEffect(() => {
    const { from, to } = yearRange(new Date().getFullYear());
    listExpenses({ from, to }).then(setExpensesThisYear);
  }, []);

  const todayIso = new Date().toISOString().slice(0, 10);
  const thisYear = new Date().getFullYear();
  const invoicesThisYear = invoices.filter(
    (inv) => inv.issueDate !== null && inv.issueDate.startsWith(String(thisYear)),
  );

  const recentInvoices = invoices.slice(0, 4);
  const upcomingDue = invoices.filter((inv) => inv.status === "issued").slice(0, 3);
  const topClients = revenueByClient(invoicesThisYear).slice(0, 5);
  const topCategories = expenseByCategory(expensesThisYear).slice(0, 5);
  const aging = agingReport(invoices, todayIso);
  const taxDeadlines = nextTaxDeadlines(todayIso, 2);
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

  const totalFacturado = invoices
    .filter((inv) => inv.status !== "draft")
    .reduce((s, inv) => s + inv.total, 0);
  const pendiente = invoices
    .filter((inv) => inv.status === "issued")
    .reduce((s, inv) => s + inv.total, 0);

  const kpis = [
    {
      label: "Facturado",
      value: formatEUR(totalFacturado),
      icon: TrendUp,
      tone: "neutral" as const,
    },
    {
      label: "Pendiente de cobro",
      value: formatEUR(pendiente),
      icon: Clock,
      tone: "warn" as const,
    },
    {
      label: "Clientes activos",
      value: String(clientCount),
      icon: UsersThree,
      tone: "neutral" as const,
    },
    {
      label: "Gastos (mes)",
      value: formatEUR(expensesThisMonth),
      icon: Wallet,
      tone: "neutral" as const,
    },
  ];

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title="Inicio"
        actions={
          <>
            <Button variant="secondary" onClick={() => onNavigate("gasto-nuevo")}>
              + Gasto
            </Button>
            <Button onClick={() => onNavigate("factura-nueva")}>+ Nueva factura</Button>
          </>
        }
      />

      <div className="grid grid-cols-4 gap-3.5 mb-6">
        {kpis.map((kpi) => (
          <KpiTile key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} tone={kpi.tone} />
        ))}
      </div>

      {recurring.length > 0 && (
        <Card className="p-5.5 mb-4">
          <div className="font-bold text-[15px] mb-4">Facturas recurrentes</div>
          {recurring.map((c) => (
            <div
              key={c.clientId}
              className="flex items-center justify-between py-2.5 border-b border-border last:border-b-0"
            >
              <div>
                <div className="font-semibold text-[13px]">{c.clientName}</div>
                <div className="text-xs text-ink-soft">
                  Facturado el mes pasado: {formatEUR(c.lastInvoiceTotal)}
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={() => handleGenerateRecurring(c.lastInvoiceId)}
                disabled={generatingFor === c.lastInvoiceId}
              >
                {generatingFor === c.lastInvoiceId ? "Generando…" : "Generar factura"}
              </Button>
            </div>
          ))}
        </Card>
      )}

      <div className="grid grid-cols-[1.5fr_1fr] gap-4">
        <Card className="p-5.5">
          <div className="font-bold text-[15px] mb-4">Facturas recientes</div>
          {recentInvoices.map((inv) => {
            const meta = invoiceStatusMeta(inv.status);
            return (
              <div
                key={inv.id}
                onClick={() => onOpenInvoice(inv.id)}
                className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-control border-b border-border last:border-b-0
                           cursor-pointer transition-colors hover:bg-surface-alt"
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
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <div className="font-semibold text-[13.5px] font-mono w-[90px] text-right">
                    {formatEUR(inv.total)}
                  </div>
                </div>
              </div>
            );
          })}
        </Card>

        <Card className="p-5.5">
          <div className="font-bold text-[15px] mb-4">Próximos vencimientos</div>
          {upcomingDue.map((inv) => (
            <div key={inv.id} className="py-2.5 border-b border-border last:border-b-0">
              <div className="font-semibold text-[13px]">{inv.clientName}</div>
              <div className="flex justify-between mt-0.5">
                <span className="text-xs text-ink-soft">Vence {formatDate(inv.dueDate)}</span>
                <span className="font-semibold text-[12.5px] font-mono">
                  {formatEUR(inv.total)}
                </span>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <Card className="p-5.5">
          <div className="font-bold text-[15px] mb-4">Antigüedad de cobros</div>
          {aging
            .filter((g) => g.bucket !== "current")
            .map((g) => (
              <div
                key={g.bucket}
                className="flex items-center justify-between py-2.5 border-b border-border last:border-b-0"
              >
                <span className="font-medium text-[13.5px]">{AGING_LABEL[g.bucket]}</span>
                <span className="flex items-center gap-2.5">
                  <span className="text-xs text-ink-soft">{g.invoices.length} facturas</span>
                  <span className="font-semibold text-[13.5px] font-mono w-[90px] text-right">
                    {formatEUR(g.total)}
                  </span>
                </span>
              </div>
            ))}
        </Card>

        <Card className="p-5.5">
          <div className="font-bold text-[15px] mb-4">Calendario fiscal</div>
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
        <Card className="p-5.5">
          <div className="font-bold text-[15px] mb-4">Ingresos por cliente ({thisYear})</div>
          {topClients.length === 0 && <div className="text-xs text-ink-soft">Sin datos todavía</div>}
          {topClients.map((c) => (
            <div key={c.clientId} className="py-2 border-b border-border last:border-b-0">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-[13.5px]">{c.clientName}</span>
                <span className="font-semibold text-[13px] font-mono">{formatEUR(c.total)}</span>
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

        <Card className="p-5.5">
          <div className="font-bold text-[15px] mb-4">Gastos por categoría ({thisYear})</div>
          {topCategories.length === 0 && <div className="text-xs text-ink-soft">Sin datos todavía</div>}
          {topCategories.map((c) => (
            <div key={c.category} className="py-2 border-b border-border last:border-b-0">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-[13.5px]">{c.category}</span>
                <span className="font-semibold text-[13px] font-mono">{formatEUR(c.total)}</span>
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
