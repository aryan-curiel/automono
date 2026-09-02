import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MagnifyingGlass, Receipt, DotsThreeVertical } from "@phosphor-icons/react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/Field";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
import { Sheet } from "../components/ui/Sheet";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { DataTable, type DataTableColumn } from "../components/ui/DataTable";
import { PageHeader } from "../components/PageHeader";
import { formatDate, formatEUR } from "../lib/format";
import { invoiceNumberLabel } from "../lib/invoice";
import { invoiceStatusMeta } from "../lib/status";
import type { InvoiceListItem } from "../db/invoices";
import type { BusinessProfileRecord } from "../db/businessProfile";
import { Cobros } from "./Cobros";

export type FacturasView = "list" | "cobros";

interface FacturasProps {
  invoices: InvoiceListItem[];
  loading: boolean;
  view: FacturasView;
  businessProfile: BusinessProfileRecord | null;
  onSetView: (view: FacturasView) => void;
  onOpenInvoice: (id: number) => void;
  onNewInvoice: () => void;
  onDeleteInvoice: (id: number) => void;
  onDuplicateInvoice: (id: number) => void;
  onPaymentRecorded: () => void;
}

export function Facturas({
  invoices,
  loading,
  view,
  businessProfile,
  onSetView,
  onOpenInvoice,
  onNewInvoice,
  onDeleteInvoice,
  onDuplicateInvoice,
  onPaymentRecorded,
}: FacturasProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [deletePending, setDeletePending] = useState<number | null>(null);

  const filtered = invoices.filter((inv) =>
    `${invoiceNumberLabel(inv)} ${inv.clientName}`.toLowerCase().includes(query.toLowerCase()),
  );

  const columns: DataTableColumn<InvoiceListItem>[] = [
    {
      key: "number",
      header: t("invoices.columns.number"),
      width: "1.3fr",
      render: (inv) => {
        const meta = invoiceStatusMeta(inv.status);
        const rectifies = inv.rectifiesInvoiceId
          ? invoices.find((i) => i.id === inv.rectifiesInvoiceId)
          : null;
        const rectifiedBy = inv.rectifiedByInvoiceId
          ? invoices.find((i) => i.id === inv.rectifiedByInvoiceId)
          : null;
        return (
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
        );
      },
    },
    {
      key: "client",
      header: t("invoices.columns.client"),
      width: "1.4fr",
      render: (inv) => <div className="font-medium text-[13.5px]">{inv.clientName}</div>,
    },
    {
      key: "date",
      header: t("invoices.columns.date"),
      width: "1fr",
      render: (inv) => <div className="text-[13px] text-ink-soft">{formatDate(inv.issueDate)}</div>,
    },
    {
      key: "amount",
      header: t("invoices.columns.amount"),
      width: "1fr",
      align: "right",
      render: (inv) => (
        <div className="font-semibold text-[13.5px] font-mono text-right">
          {formatEUR(inv.total)}
        </div>
      ),
    },
  ];

  const tabs = (
    <SegmentedControl<FacturasView>
      value={view}
      onChange={onSetView}
      options={[
        { value: "list", label: t("invoices.tabs.all") },
        { value: "cobros", label: t("invoices.tabs.collections") },
      ]}
    />
  );

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title={view === "cobros" ? t("collections.title") : t("invoices.title")}
        subtitle={
          view === "cobros" ? undefined : t("invoices.subtitleCount", { count: filtered.length })
        }
        actions={
          view === "list" ? (
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
          ) : undefined
        }
      />

      <div className="mb-6">{tabs}</div>

      {view === "cobros" ? (
        businessProfile ? (
          <Cobros
            embedded
            invoices={invoices}
            loading={loading}
            businessProfile={businessProfile}
            onOpenInvoice={onOpenInvoice}
            onPaymentRecorded={onPaymentRecorded}
          />
        ) : (
          <div className="text-sm text-ink-soft py-10 text-center">{t("collections.loading")}</div>
        )
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(inv) => inv.id}
          onRowActivate={(inv) => onOpenInvoice(inv.id)}
          loading={loading}
          padX="px-5.5"
          empty={
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
          }
          rowMenu={(inv) => (
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
          )}
        />
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
