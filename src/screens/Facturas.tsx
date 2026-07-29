import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/PageHeader";
import { formatDate, formatEUR } from "../lib/format";
import { invoiceNumberLabel } from "../lib/invoice";
import { invoiceStatusMeta } from "../lib/status";
import type { InvoiceListItem } from "../db/invoices";

interface FacturasProps {
  invoices: InvoiceListItem[];
  onOpenInvoice: (id: number) => void;
  onNewInvoice: () => void;
}

export function Facturas({ invoices, onOpenInvoice, onNewInvoice }: FacturasProps) {
  return (
    <div className="px-10 pt-8 pb-15">
      <PageHeader
        title="Facturas"
        subtitle={`${invoices.length} facturas`}
        actions={<Button onClick={onNewInvoice}>+ Nueva factura</Button>}
      />

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[.9fr_1.4fr_1fr_1fr_1fr] py-3 px-5.5 bg-surface-alt font-semibold text-xs uppercase tracking-wide text-ink-soft">
          <div>Nº Factura</div>
          <div>Cliente</div>
          <div>Fecha</div>
          <div>Importe</div>
          <div>Estado</div>
        </div>
        {invoices.map((inv) => {
          const meta = invoiceStatusMeta(inv.status);
          const rectifies = inv.rectifiesInvoiceId
            ? invoices.find((i) => i.id === inv.rectifiesInvoiceId)
            : null;
          const rectifiedBy = inv.rectifiedByInvoiceId
            ? invoices.find((i) => i.id === inv.rectifiedByInvoiceId)
            : null;
          return (
            <div
              key={inv.id}
              onClick={() => onOpenInvoice(inv.id)}
              className="grid grid-cols-[.9fr_1.4fr_1fr_1fr_1fr] py-4 px-5.5 border-t border-border items-center cursor-pointer"
            >
              <div>
                <div className="font-semibold text-[13.5px] font-mono text-accent">
                  {invoiceNumberLabel(inv)}
                </div>
                {rectifies && (
                  <div className="font-medium text-[11px] text-ink-soft">
                    rectifica {invoiceNumberLabel(rectifies)}
                  </div>
                )}
                {rectifiedBy && (
                  <div className="font-medium text-[11px] text-ink-soft">
                    rectificada por {invoiceNumberLabel(rectifiedBy)}
                  </div>
                )}
              </div>
              <div className="font-medium text-[13.5px]">{inv.clientName}</div>
              <div className="text-[13px] text-ink-soft">{formatDate(inv.issueDate)}</div>
              <div className="font-semibold text-[13.5px] font-mono">{formatEUR(inv.total)}</div>
              <div>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
