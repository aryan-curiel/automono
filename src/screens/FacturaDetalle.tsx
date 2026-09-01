import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CaretDown, DotsThreeVertical, Warning, Info } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Sheet } from "../components/ui/Sheet";
import { TextInput } from "../components/ui/Field";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
import { BackLink, PageHeader } from "../components/PageHeader";
import type { BusinessProfileRecord } from "../db/businessProfile";
import { formatDate, formatEUR } from "../lib/format";
import { amountsFromLines, invoiceNumberLabel, lineTotal } from "../lib/invoice";
import { invoiceStatusMeta } from "../lib/status";
import { daysOverdue, lateInterestOwed } from "../lib/lateInterest";
import type { InvoiceLineRecord, InvoiceListItem, InvoiceRecord } from "../db/invoices";
import { irpfApplicable } from "../features/clients";

// Ley 3/2004 sets this as ECB reference + 8 points, republished by BOE twice a year — not
// something to hardcode precisely; this is a starting point the user corrects to the current
// published figure before relying on the number.
const DEFAULT_LATE_INTEREST_RATE_PCT = 8;

// The client-facing document (unlike the rest of this screen's own-language UI chrome) must
// render in the invoice's own language, matching the PDF generator's `Labels` in pdf.rs.
// "ca" has no dedicated backend template either, so it falls back to Spanish there too.
const PREVIEW_LABELS = {
  es: {
    invoiceNumber: "Número de factura",
    issuedOn: "Emitida el",
    dueDate: "Fecha de vencimiento",
    billTo: "Facturar a",
    from: "De",
    taxId: "NIF/CIF",
    vatNumber: "Número de IVA",
    items: "Líneas",
    description: "Descripción",
    price: "Precio",
    qty: "Cant.",
    taxRate: "Tipo IVA",
    amount: "Importe",
    subtotal: "Base imponible",
    iva: "IVA",
    irpf: "IRPF",
    foreignClient: "cliente extranjero",
    total: "Total",
    payByBankTransfer: "Paga por transferencia bancaria",
    reference: "Referencia",
    bank: "Banco",
    pageOneOfOne: "Página 1 de 1",
  },
  en: {
    invoiceNumber: "Invoice number",
    issuedOn: "Issued on",
    dueDate: "Due date",
    billTo: "Billed to",
    from: "From",
    taxId: "Tax ID",
    vatNumber: "VAT number",
    items: "Items",
    description: "Description",
    price: "Price",
    qty: "Qty",
    taxRate: "Tax rate",
    amount: "Amount",
    subtotal: "Subtotal",
    iva: "VAT",
    irpf: "IRPF withholding",
    foreignClient: "foreign client",
    total: "Total",
    payByBankTransfer: "Pay by bank transfer",
    reference: "Reference",
    bank: "Bank",
    pageOneOfOne: "Page 1 of 1",
  },
} as const;

interface FacturaDetalleProps {
  invoice: InvoiceRecord;
  lines: InvoiceLineRecord[];
  invoices: InvoiceListItem[];
  businessProfile: BusinessProfileRecord;
  markingPaid: boolean;
  generatingPdf: boolean;
  onBack: () => void;
  onOpenMarkPaid: () => void;
  onCancelMarkPaid: () => void;
  onConfirmMarkPaid: () => void;
  onStartRectification: () => void;
  onDownloadPdf: (force: boolean) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
}

export function FacturaDetalle({
  invoice,
  lines,
  invoices,
  businessProfile: business,
  markingPaid,
  generatingPdf,
  onBack,
  onOpenMarkPaid,
  onCancelMarkPaid,
  onConfirmMarkPaid,
  onStartRectification,
  onDownloadPdf,
  onDelete,
  onDuplicate,
  onEdit,
}: FacturaDetalleProps) {
  const { t } = useTranslation();
  const amounts =
    invoice.total != null
      ? {
          subtotal: invoice.subtotal ?? 0,
          ivaAmount: invoice.ivaAmount ?? 0,
          irpfAmount: invoice.irpfAmount ?? 0,
          total: invoice.total,
        }
      : amountsFromLines(lines, invoice.ivaRate ?? 0, invoice.irpfRate ?? 0);
  const meta = invoiceStatusMeta(invoice.status);
  const irpfForeignClient = !irpfApplicable(invoice.clientCountry);
  const irpfRateShown = invoice.irpfRate ?? 0;
  const previewLabels = PREVIEW_LABELS[invoice.language === "en" ? "en" : "es"];

  const rectifies = invoice.rectifiesInvoiceId
    ? invoices.find((i) => i.id === invoice.rectifiesInvoiceId)
    : null;
  const rectifiedBy = invoice.rectifiedByInvoiceId
    ? invoices.find((i) => i.id === invoice.rectifiedByInvoiceId)
    : null;
  const canRectify =
    invoice.status !== "draft" && !invoice.isRectification && !invoice.rectifiedByInvoiceId;
  const canMarkPaid = invoice.status !== "paid" && invoice.status !== "draft";

  const [lateRatePct, setLateRatePct] = useState(DEFAULT_LATE_INTEREST_RATE_PCT);
  const todayIso = new Date().toISOString().slice(0, 10);
  const overdueDays =
    invoice.status === "issued" && invoice.dueDate ? daysOverdue(invoice.dueDate, todayIso) : 0;
  const lateInterest = lateInterestOwed(amounts.total, lateRatePct, overdueDays);

  const [deletePending, setDeletePending] = useState(false);

  return (
    <div className="px-8 pb-15">
      <BackLink label={t("invoices.title")} onClick={onBack} />

      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono">{invoiceNumberLabel(invoice)}</span>
            <Badge tone={meta.tone}>{t(meta.labelKey)}</Badge>
          </span>
        }
        subtitle={t("invoices.detail.subtitle", {
          client: invoice.clientName,
          date: formatDate(invoice.issueDate),
        })}
        actions={
          <>
            {invoice.status === "draft" && (
              <Button variant="secondary" onClick={onEdit}>
                {t("invoices.detail.edit")}
              </Button>
            )}
            {canRectify && (
              <Button variant="secondary" onClick={onStartRectification}>
                {t("invoices.detail.createRectification")}
              </Button>
            )}
            {canMarkPaid && (
              <Button variant="secondary" onClick={onOpenMarkPaid}>
                {t("invoices.detail.markPaid")}
              </Button>
            )}
            <Menu>
              <MenuTrigger
                className="p-2 rounded-control hover:bg-surface-alt cursor-pointer"
                aria-label={t("invoices.detail.moreActions")}
              >
                <DotsThreeVertical size={16} weight="bold" />
              </MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={onDuplicate}>{t("invoices.detail.duplicateInvoice")}</MenuItem>
                {invoice.status === "draft" && (
                  <MenuItem danger onSelect={() => setDeletePending(true)}>
                    {t("invoices.actions.delete")}
                  </MenuItem>
                )}
              </MenuContent>
            </Menu>
            {invoice.status !== "draft" && (
              <Menu>
                <div className="flex">
                  <Button
                    onClick={() => onDownloadPdf(false)}
                    disabled={generatingPdf}
                    className="rounded-r-none"
                  >
                    {generatingPdf
                      ? t("invoices.detail.generatingPdf")
                      : t("invoices.detail.downloadPdf")}
                  </Button>
                  <MenuTrigger asChild>
                    <Button
                      disabled={generatingPdf}
                      className="rounded-l-none border-l border-l-white/25 !px-2.5"
                      aria-label={t("invoices.detail.moreDownloadOptions")}
                    >
                      <CaretDown size={12} weight="bold" />
                    </Button>
                  </MenuTrigger>
                </div>
                <MenuContent>
                  <MenuItem onSelect={() => onDownloadPdf(true)} disabled={generatingPdf}>
                    {t("invoices.detail.generateAndDownload")}
                  </MenuItem>
                </MenuContent>
              </Menu>
            )}
          </>
        }
      />

      <Sheet
        open={markingPaid}
        onOpenChange={(open) => !open && onCancelMarkPaid()}
        title={t("invoices.detail.markPaidTitle")}
      >
        <p className="text-[13px] text-ink-soft mb-4">{t("invoices.detail.markPaidConfirm")}</p>
        <div className="flex gap-2.5 justify-end">
          <Button variant="secondary" onClick={onCancelMarkPaid}>
            {t("invoices.detail.cancel")}
          </Button>
          <Button onClick={onConfirmMarkPaid}>{t("invoices.detail.confirmPayment")}</Button>
        </div>
      </Sheet>

      <Sheet
        open={deletePending}
        onOpenChange={setDeletePending}
        title={t("invoices.actions.delete")}
      >
        <p className="text-[13px] text-ink-soft mb-4">{t("invoices.actions.confirmDelete")}</p>
        <div className="flex gap-2.5 justify-end">
          <Button variant="secondary" onClick={() => setDeletePending(false)}>
            {t("invoices.detail.cancel")}
          </Button>
          <Button variant="ghost-danger" onClick={onDelete}>
            {t("invoices.actions.delete")}
          </Button>
        </div>
      </Sheet>

      {invoice.isRectification && (
        <div className="flex items-start gap-2.5 bg-danger-soft text-danger rounded-card py-3 px-4 font-medium text-[13px] mb-6">
          <Warning size={16} weight="fill" className="shrink-0 mt-0.5" />
          <span>
            {t("invoices.detail.rectifiesPrefix")}{" "}
            <b className="font-mono">{rectifies ? invoiceNumberLabel(rectifies) : ""}</b> —{" "}
            {invoice.rectificationType === "full"
              ? t("invoices.detail.fullCancellation")
              : t("invoices.detail.partialCorrection")}
            . {t("invoices.detail.reasonPrefix")}: {invoice.rectificationReason}
          </span>
        </div>
      )}

      {rectifiedBy && (
        <div className="flex items-start gap-2.5 bg-surface-alt text-ink-soft rounded-card py-3 px-4 font-medium text-[13px] mb-6">
          <Info size={16} weight="fill" className="shrink-0 mt-0.5" />
          <span>
            {t("invoices.detail.rectifiedByPrefix")}{" "}
            <b className="font-mono">{invoiceNumberLabel(rectifiedBy)}</b>.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 items-start">
        <Card className="py-5 px-6">
          <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-3.5">
            {t("invoices.detail.breakdownTitle")}
          </div>
          {lines.map((l) => (
            <div
              key={l.id}
              className="flex justify-between py-1.5 border-b border-border font-normal text-[13.5px]"
            >
              <span>{l.description}</span>
              <span className="font-medium font-mono text-[13.5px]">{formatEUR(lineTotal(l))}</span>
            </div>
          ))}
          <div className="flex justify-between pt-2.5 pb-1 text-[13.5px] text-ink-soft">
            <span>{t("invoices.totals.subtotal")}</span>
            <span className="font-medium font-mono text-[13.5px]">
              {formatEUR(amounts.subtotal)}
            </span>
          </div>
          <div className="flex justify-between py-1 text-[13.5px] text-ink-soft">
            <span>{t("invoices.totals.ivaWithRate", { rate: invoice.ivaRate ?? 0 })}</span>
            <span className="font-medium font-mono text-[13.5px]">
              {formatEUR(amounts.ivaAmount)}
            </span>
          </div>
          <div className="flex justify-between pt-1 pb-2.5 text-[13.5px] text-ink-soft">
            <span>
              {t("invoices.totals.irpfWithRate", { rate: irpfRateShown })}
              {irpfForeignClient && t("invoices.totals.foreignClientSuffix")}
            </span>
            <span className="font-medium font-mono text-[13.5px]">
              -{formatEUR(amounts.irpfAmount)}
            </span>
          </div>
          <div className="flex justify-between pt-2.5 border-t border-border font-bold text-[15px]">
            <span>{t("invoices.totals.total")}</span>
            <span className="font-bold text-base font-mono">{formatEUR(amounts.total)}</span>
          </div>
          {invoice.vatNoteText && (
            <div className="mt-4 py-3 px-3.5 bg-surface-alt rounded-card text-xs text-ink-soft leading-relaxed">
              {invoice.vatNoteText}
            </div>
          )}
        </Card>

        {/* Client-facing PDF preview — must visually match pdf.rs's actual output.
            No glass/blur/macOS styling here; only the frame shadow was bumped to shadow-sheet. */}
        <div className="bg-[#fdfdfc] text-[#1c2430] rounded-card shadow-sheet py-9 px-8.5 font-sans">
          <div className="flex justify-between items-start pb-4">
            <div />
            <div className="font-extrabold text-lg">{business.name}</div>
          </div>

          <div className="text-[11.5px] text-[#5b6472] leading-relaxed">
            {previewLabels.invoiceNumber}: {invoiceNumberLabel(invoice)}
            <br />
            {previewLabels.issuedOn}: {formatDate(invoice.issueDate)}
            {invoice.dueDate && (
              <>
                <br />
                {previewLabels.dueDate}: {formatDate(invoice.dueDate)}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6 mt-5 mb-6">
            <div>
              <div className="font-bold text-[13px] mb-2">{previewLabels.billTo}</div>
              <div className="text-[11.5px] text-[#5b6472] leading-relaxed">
                {invoice.clientName}
                <br />
                {(invoice.vatTreatment === "standard" || !invoice.vatTreatment) && (
                  <>
                    {previewLabels.taxId}: {invoice.clientNif}
                    <br />
                  </>
                )}
                {invoice.clientVatNumber && (
                  <>
                    {previewLabels.vatNumber}: {invoice.clientVatNumber}
                    <br />
                  </>
                )}
                {invoice.clientAddress}
              </div>
            </div>
            <div>
              <div className="font-bold text-[13px] mb-2">{previewLabels.from}</div>
              <div className="text-[11.5px] text-[#5b6472] leading-relaxed">
                {business.name}
                <br />
                {previewLabels.taxId}: {business.nifCif}
                <br />
                {business.vatNumber && (
                  <>
                    {previewLabels.vatNumber}: {business.vatNumber}
                    <br />
                  </>
                )}
                {business.address}
              </div>
            </div>
          </div>

          <div className="font-bold text-sm mb-2">{previewLabels.items}</div>
          <div className="border-t-[1.5px] border-[#1c2430]">
            <div className="grid grid-cols-[2.2fr_.9fr_.5fr_.8fr_.9fr] py-2 font-semibold text-[10.5px] uppercase tracking-wide text-[#5b6472] border-b border-[#e2ddd3]">
              <div>{previewLabels.description}</div>
              <div className="text-right">{previewLabels.price}</div>
              <div>{previewLabels.qty}</div>
              <div>{previewLabels.taxRate}</div>
              <div className="text-right">{previewLabels.amount}</div>
            </div>
            {lines.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-[2.2fr_.9fr_.5fr_.8fr_.9fr] py-2 text-xs border-b border-[#f0ede7]"
              >
                <div>{l.description}</div>
                <div className="text-right">{formatEUR(l.unitPrice)}</div>
                <div>{l.quantity}</div>
                <div>{invoice.ivaRate ? `${invoice.ivaRate}%` : "-"}</div>
                <div className="text-right">{formatEUR(lineTotal(l))}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 ml-auto w-[220px]">
            <div className="flex justify-between text-xs py-1.5 border-t border-[#1c2430]">
              <span>{previewLabels.subtotal}</span>
              <span>{formatEUR(amounts.subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs py-1.5">
              <span>
                {previewLabels.iva} {invoice.ivaRate ?? 0}%
              </span>
              <span>{formatEUR(amounts.ivaAmount)}</span>
            </div>
            <div className="flex justify-between text-xs py-1.5">
              <span>
                {previewLabels.irpf} {irpfRateShown}%
                {irpfForeignClient && ` (${previewLabels.foreignClient})`}
              </span>
              <span>-{formatEUR(amounts.irpfAmount)}</span>
            </div>
            <div className="flex justify-between font-bold text-sm py-1.5 border-t border-[#1c2430]">
              <span>{previewLabels.total}</span>
              <span>{formatEUR(amounts.total)}</span>
            </div>
          </div>

          {invoice.vatNoteText && (
            <div className="mt-5 text-[10.5px] text-[#5b6472] leading-relaxed italic">
              {invoice.vatNoteText}
            </div>
          )}

          <div className="mt-6 bg-[#f1f2f4] rounded-control p-5">
            <div className="font-bold text-base mb-3">{previewLabels.payByBankTransfer}</div>
            <div className="text-[11.5px] text-[#5b6472] leading-relaxed grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 w-fit">
              <span>{previewLabels.reference}</span>
              <span>{invoiceNumberLabel(invoice)}</span>
              {business.bankName && (
                <>
                  <span>{previewLabels.bank}</span>
                  <span>{business.bankName}</span>
                </>
              )}
              <span>IBAN</span>
              <span className="font-bold text-[#1c2430]">{business.iban}</span>
              <span>BIC</span>
              <span>{business.bic}</span>
            </div>
            <div className="text-[10.5px] text-[#5b6472] mt-6">{previewLabels.pageOneOfOne}</div>
          </div>
        </div>
      </div>

      {overdueDays > 0 && (
        <Card className="py-5 px-6 mt-4">
          <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-3.5">
            {t("invoices.detail.lateInterestTitle")}
          </div>
          <div className="flex items-end gap-5">
            <div className="text-[13.5px] text-ink-soft">
              {t("invoices.detail.overdueDaysLabel", {
                days: overdueDays,
                amount: formatEUR(amounts.total),
              })}
            </div>
            <div className="flex items-center gap-2">
              <TextInput
                type="number"
                step="0.01"
                min="0"
                mono
                value={lateRatePct}
                onChange={(e) => setLateRatePct(Number(e.target.value))}
                className="w-20"
              />
              <span className="text-[13px] text-ink-soft">{t("invoices.detail.annualLabel")}</span>
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs text-ink-soft mb-0.5">
                {t("invoices.detail.interestOwedLabel")}
              </div>
              <div className="font-bold text-base font-mono">{formatEUR(lateInterest)}</div>
            </div>
          </div>
          <div className="text-[11px] text-ink-soft mt-3">
            {t("invoices.detail.lateInterestDisclaimer")}
          </div>
        </Card>
      )}
    </div>
  );
}
