import { useEffect, useRef, useState } from "react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { BackLink } from "../components/PageHeader";
import type { BusinessProfileRecord } from "../db/businessProfile";
import { formatDate, formatEUR } from "../lib/format";
import { amountsFromLines, invoiceNumberLabel, lineTotal } from "../lib/invoice";
import { invoiceStatusMeta } from "../lib/status";
import type { InvoiceLineRecord, InvoiceListItem, InvoiceRecord } from "../db/invoices";

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
  const irpfShown = invoice.irpfRate !== null;
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

  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!downloadMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (!downloadMenuRef.current?.contains(e.target as Node)) {
        setDownloadMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [downloadMenuOpen]);

  return (
    <div className="px-10 pt-8 pb-15">
      <BackLink label="Facturas" onClick={onBack} />

      <div className="flex items-start justify-between mb-5.5">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <h1 className="font-extrabold text-2xl tracking-tight m-0">
              {invoiceNumberLabel(invoice)}
            </h1>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <div className="text-sm text-ink-soft">
            {invoice.clientName} · emitida {formatDate(invoice.issueDate)}
          </div>
        </div>
        <div className="flex gap-2.5 shrink-0">
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
          {invoice.status !== "draft" && (
            <div className="relative flex" ref={downloadMenuRef}>
              <Button
                onClick={() => onDownloadPdf(false)}
                disabled={generatingPdf}
                className="rounded-r-none"
              >
                {generatingPdf ? "Generando…" : "Descargar PDF"}
              </Button>
              <Button
                onClick={() => setDownloadMenuOpen((o) => !o)}
                disabled={generatingPdf}
                className="rounded-l-none border-l border-l-white/25 !px-2.5"
                aria-label="Más opciones de descarga"
              >
                ▾
              </Button>
              {downloadMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-surface border border-border rounded-lg shadow-lg py-1 z-10">
                  <button
                    onClick={() => {
                      setDownloadMenuOpen(false);
                      onDownloadPdf(true);
                    }}
                    disabled={generatingPdf}
                    className="w-full text-left px-3.5 py-2.5 text-[13px] font-medium text-ink hover:bg-surface-alt cursor-pointer disabled:opacity-50"
                  >
                    Generar y descargar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {markingPaid && (
        <Card className="p-5.5 mb-5 max-w-[520px]">
          <div className="font-bold text-sm mb-1.5">Marcar factura como pagada</div>
          <div className="text-[13px] text-ink-soft mb-3.5">
            ¿Confirmas que esta factura ha sido pagada?
          </div>
          <div className="flex gap-2.5">
            <Button onClick={onConfirmMarkPaid}>Confirmar pago</Button>
            <Button variant="secondary" onClick={onCancelMarkPaid}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {invoice.isRectification && (
        <div className="bg-danger-soft text-danger rounded-lg py-3 px-4 font-medium text-[13px] mb-5">
          Rectifica a <b>{rectifies ? invoiceNumberLabel(rectifies) : ""}</b> —{" "}
          {invoice.rectificationType === "full" ? "anulación completa" : "corrección parcial"}.
          Motivo: {invoice.rectificationReason}
        </div>
      )}

      {rectifiedBy && (
        <div className="bg-surface-alt text-ink-soft rounded-lg py-3 px-4 font-medium text-[13px] mb-5">
          Esta factura ha sido rectificada por <b>{invoiceNumberLabel(rectifiedBy)}</b>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-5 items-start">
        <Card className="py-5 px-6">
          <div className="font-bold text-sm mb-3.5">Desglose</div>
          {lines.map((l) => (
            <div
              key={l.id}
              className="flex justify-between py-2 border-b border-border font-normal text-[13.5px]"
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
          {irpfShown && (
            <div className="flex justify-between pt-1 pb-2.5 text-[13.5px] text-ink-soft">
              <span>IRPF ({invoice.irpfRate}%)</span>
              <span className="font-medium font-mono text-[13.5px]">
                -{formatEUR(amounts.irpfAmount)}
              </span>
            </div>
          )}
          <div className="flex justify-between pt-2.5 border-t border-border font-bold text-[15px]">
            <span>Total</span>
            <span className="font-bold text-base font-mono">{formatEUR(amounts.total)}</span>
          </div>
          {invoice.vatNoteText && (
            <div className="mt-4 py-3 px-3.5 bg-surface-alt rounded-lg text-xs text-ink-soft leading-relaxed">
              {invoice.vatNoteText}
            </div>
          )}
        </Card>

        <div className="bg-[#fdfdfc] text-[#1c2430] rounded shadow-[0_4px_24px_rgba(0,0,0,.18)] py-9 px-8.5 font-sans">
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
                {invoice.vatTreatment === "standard" || !invoice.vatTreatment ? (
                  <>
                    {t.taxId}: {invoice.clientNif}
                    <br />
                  </>
                ) : (
                  invoice.clientVatNumber && (
                    <>
                      {t.vatNumber}: {invoice.clientVatNumber}
                      <br />
                    </>
                  )
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
            {irpfShown && (
              <div className="flex justify-between text-xs py-1.5">
                <span>
                  {t.irpf} {invoice.irpfRate}%
                </span>
                <span>-{formatEUR(amounts.irpfAmount)}</span>
              </div>
            )}
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

          <div className="mt-6 bg-[#f1f2f4] rounded-lg p-5">
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
    </div>
  );
}
