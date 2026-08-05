import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MagnifyingGlass, Receipt, DotsThreeVertical } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/Field";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
import { Sheet } from "../components/ui/Sheet";
import { PageHeader } from "../components/PageHeader";
import { formatDate, formatEUR } from "../lib/format";
import { invoiceNumberLabel } from "../lib/invoice";
import { invoiceStatusMeta } from "../lib/status";
import type { InvoiceListItem } from "../db/invoices";

interface FacturasProps {
  invoices: InvoiceListItem[];
  loading: boolean;
  onOpenInvoice: (id: number) => void;
  onNewInvoice: () => void;
  onDeleteInvoice: (id: number) => void;
  onDuplicateInvoice: (id: number) => void;
}

export function Facturas({
  invoices,
  loading,
  onOpenInvoice,
  onNewInvoice,
  onDeleteInvoice,
  onDuplicateInvoice,
}: FacturasProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [deletePending, setDeletePending] = useState<number | null>(null);

  const filtered = invoices.filter((inv) =>
    `${invoiceNumberLabel(inv)} ${inv.clientName}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title={t("invoices.title")}
        subtitle={t("invoices.subtitleCount", { count: filtered.length })}
        actions={
          <>
            <div className="relative">
              <MagnifyingGlass
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft"
              />
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("invoices.searchPlaceholder")}
                className="w-52 pl-8"
              />
            </div>
            <Button onClick={onNewInvoice}>+ {t("invoices.newInvoice")}</Button>
          </>
        }
      />

      {loading ? (
        <Card className="overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[.9fr_1.4fr_1fr_1fr_1fr_32px] py-3 px-5.5 border-t border-border first:border-t-0"
            >
              <div className="h-4 w-16 rounded bg-surface-alt animate-pulse" />
              <div className="h-4 w-28 rounded bg-surface-alt animate-pulse" />
              <div className="h-4 w-20 rounded bg-surface-alt animate-pulse" />
              <div className="h-4 w-16 rounded bg-surface-alt animate-pulse" />
              <div className="h-4 w-14 rounded bg-surface-alt animate-pulse" />
            </div>
          ))}
        </Card>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <Receipt size={32} className="text-ink-soft/40" />
          <div className="text-sm text-ink-soft">
            {invoices.length === 0 ? t("invoices.empty") : t("invoices.noResults")}
          </div>
          {invoices.length === 0 && (
            <Button variant="secondary" onClick={onNewInvoice}>
              + {t("invoices.newInvoice")}
            </Button>
          )}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1.3fr_1.4fr_1fr_1fr_32px] py-3 px-5.5 bg-surface-alt font-medium text-xs uppercase tracking-wide text-ink-soft">
            <div>{t("invoices.columns.number")}</div>
            <div>{t("invoices.columns.client")}</div>
            <div>{t("invoices.columns.date")}</div>
            <div className="text-right">{t("invoices.columns.amount")}</div>
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
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    if (e.key === " ") e.preventDefault();
                    onOpenInvoice(inv.id);
                  }
                }}
                className="group grid grid-cols-[1.3fr_1.4fr_1fr_1fr_32px] py-3 px-5.5
                           border-t border-border items-center cursor-pointer
                           transition-colors hover:bg-surface-alt
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[13.5px] font-mono text-accent">
                      {invoiceNumberLabel(inv)}
                    </span>
                    <Badge tone={meta.tone}>{t(meta.labelKey)}</Badge>
                  </div>
                  {rectifies && (
                    <div className="font-medium text-[11px] text-ink-soft">
                      {t("invoices.rectifies", { number: invoiceNumberLabel(rectifies) })}
                    </div>
                  )}
                  {rectifiedBy && (
                    <div className="font-medium text-[11px] text-ink-soft">
                      {t("invoices.rectifiedBy", { number: invoiceNumberLabel(rectifiedBy) })}
                    </div>
                  )}
                </div>
                <div className="font-medium text-[13.5px]">{inv.clientName}</div>
                <div className="text-[13px] text-ink-soft">{formatDate(inv.issueDate)}</div>
                <div className="font-semibold text-[13.5px] font-mono text-right">
                  {formatEUR(inv.total)}
                </div>
                <div
                  className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Menu>
                    <MenuTrigger className="p-1.5 rounded-control hover:bg-border cursor-pointer">
                      <DotsThreeVertical size={16} weight="bold" />
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => onOpenInvoice(inv.id)}>{t("common.viewDetail")}</MenuItem>
                      <MenuItem onSelect={() => onDuplicateInvoice(inv.id)}>
                        {t("invoices.detail.duplicateInvoice")}
                      </MenuItem>
                      {inv.status === "draft" && (
                        <MenuItem danger onSelect={() => setDeletePending(inv.id)}>
                          {t("invoices.actions.delete")}
                        </MenuItem>
                      )}
                    </MenuContent>
                  </Menu>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Sheet
        open={deletePending !== null}
        onOpenChange={(open) => !open && setDeletePending(null)}
        title={t("invoices.actions.delete")}
      >
        <p className="text-[13px] text-ink-soft mb-4">{t("invoices.actions.confirmDelete")}</p>
        <div className="flex gap-2.5 justify-end">
          <Button variant="secondary" onClick={() => setDeletePending(null)}>
            {t("invoices.detail.cancel")}
          </Button>
          <Button
            variant="ghost-danger"
            onClick={() => {
              if (deletePending !== null) onDeleteInvoice(deletePending);
              setDeletePending(null);
            }}
          >
            {t("invoices.actions.delete")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
