import { useState } from "react";
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
  const t = PREVIEW_LABELS[invoice.language === "en" ? "en" : "es"];

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

  function handleDelete() {
    if (!window.confirm("¿Eliminar este borrador? Esta acción no se puede deshacer.")) return;
    onDelete();
  }

  return (
    <div className="px-8 pb-15">
      <BackLink label="Facturas" onClick={onBack} />

      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono">{invoiceNumberLabel(invoice)}</span>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </span>
        }
        subtitle={`${invoice.clientName} · emitida ${formatDate(invoice.issueDate)}`}
        actions={
          <>
            {invoice.status === "draft" && (
              <Button variant="secondary" onClick={onEdit}>
                Editar
              </Button>
            )}
            {canRectify && (
              <Button variant="secondary" onClick={onStartRectification}>
                Crear rectificativa
              </Button>
            )}
            {canMarkPaid && (
              <Button variant="secondary" onClick={onOpenMarkPaid}>
                Marcar como pagada
              </Button>
            )}
            <Menu>
              <MenuTrigger
                className="p-2 rounded-control hover:bg-surface-alt cursor-pointer"
                aria-label="Más acciones"
              >
                <DotsThreeVertical size={16} weight="bold" />
              </MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={onDuplicate}>Duplicar factura</MenuItem>
                {invoice.status === "draft" && (
                  <MenuItem danger onSelect={handleDelete}>
                    Eliminar borrador
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
                    {generatingPdf ? "Generando…" : "Descargar PDF"}
                  </Button>
                  <MenuTrigger asChild>
                    <Button
                      disabled={generatingPdf}
                      className="rounded-l-none border-l border-l-white/25 !px-2.5"
                      aria-label="Más opciones de descarga"
                    >
                      <CaretDown size={12} weight="bold" />
                    </Button>
                  </MenuTrigger>
                </div>
                <MenuContent>
                  <MenuItem onSelect={() => onDownloadPdf(true)} disabled={generatingPdf}>
                    Generar y descargar
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
        title="Marcar factura como pagada"
      >
        <p className="text-[13px] text-ink-soft mb-4">
          ¿Confirmas que esta factura ha sido pagada?
        </p>
        <div className="flex gap-2.5 justify-end">
          <Button variant="secondary" onClick={onCancelMarkPaid}>
            Cancelar
          </Button>
          <Button onClick={onConfirmMarkPaid}>Confirmar pago</Button>
        </div>
      </Sheet>

      {invoice.isRectification && (
        <div className="flex items-start gap-2.5 bg-danger-soft text-danger rounded-card py-3 px-4 font-medium text-[13px] mb-6">
          <Warning size={16} weight="fill" className="shrink-0 mt-0.5" />
          <span>
            Rectifica a{" "}
            <b className="font-mono">{rectifies ? invoiceNumberLabel(rectifies) : ""}</b> —{" "}
            {invoice.rectificationType === "full" ? "anulación completa" : "corrección parcial"}.
            Motivo: {invoice.rectificationReason}
          </span>
        </div>
      )}

      {rectifiedBy && (
        <div className="flex items-start gap-2.5 bg-surface-alt text-ink-soft rounded-card py-3 px-4 font-medium text-[13px] mb-6">
          <Info size={16} weight="fill" className="shrink-0 mt-0.5" />
          <span>
            Esta factura ha sido rectificada por{" "}
            <b className="font-mono">{invoiceNumberLabel(rectifiedBy)}</b>.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 items-start">
        <Card className="py-5 px-6">
          <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-3.5">
            Desglose
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
            <span>Base imponible</span>
            <span className="font-medium font-mono text-[13.5px]">
              {formatEUR(amounts.subtotal)}
            </span>
          </div>
          <div className="flex justify-between py-1 text-[13.5px] text-ink-soft">
            <span>IVA ({invoice.ivaRate ?? 0}%)</span>
            <span className="font-medium font-mono text-[13.5px]">
              {formatEUR(amounts.ivaAmount)}
            </span>
          </div>
          <div className="flex justify-between pt-1 pb-2.5 text-[13.5px] text-ink-soft">
            <span>
              IRPF ({irpfRateShown}%){irpfForeignClient && " (cliente extranjero)"}
            </span>
            <span className="font-medium font-mono text-[13.5px]">
              -{formatEUR(amounts.irpfAmount)}
            </span>
          </div>
          <div className="flex justify-between pt-2.5 border-t border-border font-bold text-[15px]">
            <span>Total</span>
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
            {t.invoiceNumber}: {invoiceNumberLabel(invoice)}
            <br />
            {t.issuedOn}: {formatDate(invoice.issueDate)}
            {invoice.dueDate && (
              <>
                <br />
                {t.dueDate}: {formatDate(invoice.dueDate)}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6 mt-5 mb-6">
            <div>
              <div className="font-bold text-[13px] mb-2">{t.billTo}</div>
              <div className="text-[11.5px] text-[#5b6472] leading-relaxed">
                {invoice.clientName}
                <br />
                {(invoice.vatTreatment === "standard" || !invoice.vatTreatment) && (
                  <>
                    {t.taxId}: {invoice.clientNif}
                    <br />
                  </>
                )}
                {invoice.clientVatNumber && (
                  <>
                    {t.vatNumber}: {invoice.clientVatNumber}
                    <br />
                  </>
                )}
                {invoice.clientAddress}
              </div>
            </div>
            <div>
              <div className="font-bold text-[13px] mb-2">{t.from}</div>
              <div className="text-[11.5px] text-[#5b6472] leading-relaxed">
                {business.name}
                <br />
                {t.taxId}: {business.nifCif}
                <br />
                {business.vatNumber && (
                  <>
                    {t.vatNumber}: {business.vatNumber}
                    <br />
                  </>
                )}
                {business.address}
              </div>
            </div>
          </div>

          <div className="font-bold text-sm mb-2">{t.items}</div>
          <div className="border-t-[1.5px] border-[#1c2430]">
            <div className="grid grid-cols-[2.2fr_.9fr_.5fr_.8fr_.9fr] py-2 font-semibold text-[10.5px] uppercase tracking-wide text-[#5b6472] border-b border-[#e2ddd3]">
              <div>{t.description}</div>
              <div>{t.price}</div>
              <div>{t.qty}</div>
              <div>{t.taxRate}</div>
              <div className="text-right">{t.amount}</div>
            </div>
            {lines.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-[2.2fr_.9fr_.5fr_.8fr_.9fr] py-2 text-xs border-b border-[#f0ede7]"
              >
                <div>{l.description}</div>
                <div>{formatEUR(l.unitPrice)}</div>
                <div>{l.quantity}</div>
                <div>{invoice.ivaRate ? `${invoice.ivaRate}%` : "-"}</div>
                <div className="text-right">{formatEUR(lineTotal(l))}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 ml-auto w-[220px]">
            <div className="flex justify-between text-xs py-1.5 border-t border-[#1c2430]">
              <span>{t.subtotal}</span>
              <span>{formatEUR(amounts.subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs py-1.5">
              <span>
                {t.iva} {invoice.ivaRate ?? 0}%
              </span>
              <span>{formatEUR(amounts.ivaAmount)}</span>
            </div>
            <div className="flex justify-between text-xs py-1.5">
              <span>
                {t.irpf} {irpfRateShown}%{irpfForeignClient && ` (${t.foreignClient})`}
              </span>
              <span>-{formatEUR(amounts.irpfAmount)}</span>
            </div>
            <div className="flex justify-between font-bold text-sm py-1.5 border-t border-[#1c2430]">
              <span>{t.total}</span>
              <span>{formatEUR(amounts.total)}</span>
            </div>
          </div>

          {invoice.vatNoteText && (
            <div className="mt-5 text-[10.5px] text-[#5b6472] leading-relaxed italic">
              {invoice.vatNoteText}
            </div>
          )}

          <div className="mt-6 bg-[#f1f2f4] rounded-control p-5">
            <div className="font-bold text-base mb-3">{t.payByBankTransfer}</div>
            <div className="text-[11.5px] text-[#5b6472] leading-relaxed grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 w-fit">
              <span>{t.reference}</span>
              <span>{invoiceNumberLabel(invoice)}</span>
              {business.bankName && (
                <>
                  <span>{t.bank}</span>
                  <span>{business.bankName}</span>
                </>
              )}
              <span>IBAN</span>
              <span className="font-bold text-[#1c2430]">{business.iban}</span>
              <span>BIC</span>
              <span>{business.bic}</span>
            </div>
            <div className="text-[10.5px] text-[#5b6472] mt-6">{t.pageOneOfOne}</div>
          </div>
        </div>
      </div>

      {overdueDays > 0 && (
        <Card className="py-5 px-6 mt-4">
          <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-3.5">
            Interés de demora (Ley 3/2004)
          </div>
          <div className="flex items-end gap-5">
            <div className="text-[13.5px] text-ink-soft">
              {overdueDays} días de retraso sobre {formatEUR(amounts.total)}
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
              <span className="text-[13px] text-ink-soft">% anual</span>
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs text-ink-soft mb-0.5">Interés adeudado</div>
              <div className="font-bold text-base font-mono">{formatEUR(lateInterest)}</div>
            </div>
          </div>
          <div className="text-[11px] text-ink-soft mt-3">
            Tipo orientativo — comprueba el vigente en el BOE (interés legal + 8 puntos) antes de
            reclamarlo.
          </div>
        </Card>
      )}
    </div>
  );
}
