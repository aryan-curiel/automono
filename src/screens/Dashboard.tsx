import { useEffect, useState } from "react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/PageHeader";
import { listClients } from "../db/clients";
import { listExpenses } from "../db/expenses";
import { invoiceNumberLabel } from "../lib/invoice";
import { invoiceStatusMeta } from "../lib/status";
import { formatDate, formatEUR } from "../lib/format";
import { monthRange } from "../lib/dateRange";
import type { InvoiceListItem } from "../db/invoices";
import type { Screen } from "../types";

interface DashboardProps {
  invoices: InvoiceListItem[];
  onNavigate: (screen: Screen) => void;
  onOpenInvoice: (id: number) => void;
}

export function Dashboard({ invoices, onNavigate, onOpenInvoice }: DashboardProps) {
  const [clientCount, setClientCount] = useState(0);
  const [expensesThisMonth, setExpensesThisMonth] = useState(0);

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

  const recentInvoices = invoices.slice(0, 4);
  const upcomingDue = invoices.filter((inv) => inv.status === "issued").slice(0, 3);

  const totalFacturado = invoices
    .filter((inv) => inv.status !== "draft")
    .reduce((s, inv) => s + inv.total, 0);
  const pendiente = invoices
    .filter((inv) => inv.status === "issued")
    .reduce((s, inv) => s + inv.total, 0);

  const kpis = [
    { label: "Facturado", value: formatEUR(totalFacturado), warn: false },
    { label: "Pendiente de cobro", value: formatEUR(pendiente), warn: true },
    { label: "Clientes activos", value: String(clientCount), warn: false },
    {
      label: "Gastos (mes)",
      value: formatEUR(expensesThisMonth),
      warn: false,
    },
  ];

  return (
    <div className="px-10 pt-8 pb-15">
      <PageHeader
        title="Resumen"
        actions={
          <>
            <Button variant="secondary" onClick={() => onNavigate("clientes")}>
              + Cliente
            </Button>
            <Button variant="secondary" onClick={() => onNavigate("gastos")}>
              + Gasto
            </Button>
            <Button onClick={() => onNavigate("factura-nueva")}>+ Nueva factura</Button>
          </>
        }
      />

      <div className="grid grid-cols-4 gap-4 mb-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="py-4.5 px-5">
            <div className="font-semibold text-xs text-ink-soft mb-2.5">{kpi.label}</div>
            <div className="font-bold text-2xl font-mono tracking-tight">{kpi.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-[1.5fr_1fr] gap-4">
        <Card className="p-5.5">
          <div className="font-bold text-[15px] mb-4">Facturas recientes</div>
          {recentInvoices.map((inv) => {
            const meta = invoiceStatusMeta(inv.status);
            return (
              <div
                key={inv.id}
                onClick={() => onOpenInvoice(inv.id)}
                className="flex items-center justify-between py-2.5 border-b border-border last:border-b-0 cursor-pointer"
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
                <span className="text-xs text-ink-soft">Vence {formatDate(inv.issueDate)}</span>
                <span className="font-semibold text-[12.5px] font-mono">
                  {formatEUR(inv.total)}
                </span>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
