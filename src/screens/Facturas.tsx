import { useState } from "react";
import { MagnifyingGlass, Receipt, DotsThreeVertical } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
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
  const [query, setQuery] = useState("");

  const filtered = invoices.filter((inv) =>
    `${invoiceNumberLabel(inv)} ${inv.clientName}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title="Facturas"
        subtitle={`${filtered.length} facturas`}
        actions={
          <>
            <div className="relative">
              <MagnifyingGlass
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar"
                className="w-52 pl-8 pr-3 py-1.5 text-[13px] rounded-control bg-surface-alt border border-transparent
                           focus:border-accent focus:bg-surface focus:outline-none transition-colors"
              />
            </div>
            <Button onClick={onNewInvoice}>+ Nueva factura</Button>
          </>
        }
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <Receipt size={32} className="text-ink-soft/40" />
          <div className="text-sm text-ink-soft">
            {invoices.length === 0 ? "Aún no hay facturas" : "Sin resultados"}
          </div>
          {invoices.length === 0 && (
            <Button variant="secondary" onClick={onNewInvoice}>
              + Nueva factura
            </Button>
          )}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[.9fr_1.4fr_1fr_1fr_1fr_32px] py-3 px-5.5 bg-surface-alt font-semibold text-xs uppercase tracking-wide text-ink-soft">
            <div>Nº Factura</div>
            <div>Cliente</div>
            <div>Fecha</div>
            <div>Importe</div>
            <div>Estado</div>
            <div />
          </div>
          {filtered.map((inv) => {
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
                className="group grid grid-cols-[.9fr_1.4fr_1fr_1fr_1fr_32px] py-3 px-5.5
                           border-t border-border items-center cursor-pointer
                           transition-colors hover:bg-surface-alt"
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
                <div
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Menu>
                    <MenuTrigger className="p-1.5 rounded-control hover:bg-border cursor-pointer">
                      <DotsThreeVertical size={16} weight="bold" />
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => onOpenInvoice(inv.id)}>Ver detalle</MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
