import { useEffect, useState } from "react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ErrorText, Label, TextArea, TextInput } from "../components/ui/Field";
import { BackLink } from "../components/PageHeader";
import { invoiceNumberLabel } from "../lib/invoice";
import { formatEUR } from "../lib/format";
import { getClient } from "../db/clients";
import type { ClientRecord } from "../db/clients";
import { createRectification, getInvoiceWithLines } from "../db/invoices";
import type { InvoiceListItem, InvoiceRecord } from "../db/invoices";
import type { RectificationType } from "../types";

interface FacturaRectificarProps {
  original: InvoiceListItem;
  rectType: RectificationType;
  onSetFull: () => void;
  onSetPartial: () => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  onCancel: () => void;
  onEmit: (invoice: InvoiceRecord) => void;
}

interface DraftLine {
  key: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

function mkLine(description: string, quantity: number, unitPrice: number): DraftLine {
  return { key: `${Date.now()}-${Math.random()}`, description, quantity, unitPrice };
}

export function FacturaRectificar({
  original,
  rectType,
  onSetFull,
  onSetPartial,
  reason,
  onReasonChange,
  onCancel,
  onEmit,
}: FacturaRectificarProps) {
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [originalLines, setOriginalLines] = useState<
    { description: string; quantity: number; unitPrice: number }[] | null
  >(null);
  const [lines, setLines] = useState<DraftLine[]>([mkLine("", 1, 0)]);
  const [linesDerivedFor, setLinesDerivedFor] = useState<RectificationType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getClient(original.clientId), getInvoiceWithLines(original.id)]).then(
      ([c, detail]) => {
        if (cancelled) return;
        setClient(c);
        setOriginalLines(detail?.lines ?? []);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [original.id, original.clientId]);

  // Re-derives the editable lines whenever the rectification type changes (or once the
  // original's lines finish loading): "full" mirrors the original's lines with unitPrice
  // negated so the totals exactly cancel; "partial" starts blank. State update during
  // render, same pattern FacturaNueva uses for its IRPF default, avoids an extra effect.
  if (originalLines !== null && linesDerivedFor !== rectType) {
    setLinesDerivedFor(rectType);
    setLines(
      rectType === "full"
        ? originalLines.length > 0
          ? originalLines.map((l) => mkLine(l.description, l.quantity, -l.unitPrice))
          : [mkLine("", 1, 0)]
        : [mkLine("", 1, 0)],
    );
  }

  const origNumber = invoiceNumberLabel(original);
  const numberPreview = client
    ? `${client.invoicePrefix}-R${String(client.nextRectificationNumber).padStart(3, "0")}`
    : "";
  const helpText =
    rectType === "full"
      ? "La anulación completa generará líneas negativas que igualan y anulan el importe total de la factura original."
      : "La corrección parcial empieza en blanco — añade solo las líneas que corrigen el importe original.";

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const iva = (subtotal * original.ivaRate) / 100;
  const irpfShown = original.irpfRate > 0;
  const irpf = irpfShown ? (subtotal * original.irpfRate) / 100 : 0;
  const total = subtotal + iva - irpf;

  function updateLine(
    idx: number,
    field: "description" | "quantity" | "unitPrice",
    value: string | number,
  ) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  function removeLine(idx: number) {
    setLines((ls) => {
      const next = ls.filter((_, i) => i !== idx);
      return next.length ? next : [mkLine("", 1, 0)];
    });
  }

  async function handleEmit() {
    setSubmitError(null);
    if (!reason.trim()) {
      setSubmitError("El motivo es obligatorio.");
      return;
    }
    const validLines = lines.filter((l) => l.description.trim());
    if (validLines.length === 0) {
      setSubmitError("Añade al menos una línea.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createRectification(
        original.id,
        rectType,
        reason.trim(),
        validLines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      );
      onEmit(created);
    } catch (err) {
      setSubmitError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-10 pt-8 pb-15">
      <BackLink label={origNumber} onClick={onCancel} />
      <div className="flex items-start justify-between mb-5.5">
        <h1 className="font-extrabold text-2xl tracking-tight m-0">
          Rectificativa de {origNumber}
        </h1>
        <Button onClick={handleEmit} disabled={submitting}>
          {submitting ? "Emitiendo…" : "Emitir rectificativa"}
        </Button>
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-5 items-start">
        <Card className="py-5.5 px-6">
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <Label>Nº de rectificativa (previsualización)</Label>
              <TextInput mono readOnly value={numberPreview} />
            </div>
            <div>
              <Label>Tipo</Label>
              <div className="flex gap-2.5">
                <Button
                  variant={rectType === "full" ? "primary" : "secondary"}
                  onClick={onSetFull}
                  disabled={submitting}
                >
                  Anulación completa
                </Button>
                <Button
                  variant={rectType === "partial" ? "primary" : "secondary"}
                  onClick={onSetPartial}
                  disabled={submitting}
                >
                  Corrección parcial
                </Button>
              </div>
            </div>
          </div>

          <div className="mb-4.5">
            <Label>Motivo (obligatorio)</Label>
            <TextArea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Ej. Error en el importe de la línea 2"
              className="h-18 font-sans"
              disabled={submitting}
            />
          </div>
          <div className="mb-5 py-3 px-3.5 bg-surface-alt rounded-lg text-xs text-ink-soft leading-relaxed">
            {helpText}
          </div>

          <div className="font-bold text-[13px] mb-2.5">Líneas</div>
          <div className="grid grid-cols-[2.4fr_.7fr_1fr_1fr_28px] gap-2 font-semibold text-xs uppercase text-ink-soft pb-1.5">
            <div>Descripción</div>
            <div>Cant.</div>
            <div>Precio</div>
            <div>Total</div>
            <div />
          </div>
          {lines.map((l, idx) => (
            <div
              key={l.key}
              className="grid grid-cols-[2.4fr_.7fr_1fr_1fr_28px] gap-2 mb-2 items-center"
            >
              <TextInput
                value={l.description}
                onChange={(e) => updateLine(idx, "description", e.target.value)}
                disabled={submitting}
              />
              <TextInput
                mono
                value={l.quantity}
                onChange={(e) => updateLine(idx, "quantity", Number(e.target.value) || 0)}
                disabled={submitting}
              />
              <TextInput
                mono
                value={l.unitPrice}
                onChange={(e) => updateLine(idx, "unitPrice", Number(e.target.value) || 0)}
                disabled={submitting}
              />
              <div className="font-semibold text-[13px] font-mono py-2.5">
                {formatEUR(l.quantity * l.unitPrice)}
              </div>
              <div
                onClick={() => !submitting && removeLine(idx)}
                className="cursor-pointer text-ink-soft font-semibold text-base text-center"
              >
                &times;
              </div>
            </div>
          ))}
          <button
            onClick={() => setLines((ls) => [...ls, mkLine("", 1, 0)])}
            disabled={submitting}
            className="font-semibold text-[13px] bg-transparent border border-dashed border-border text-accent rounded-lg px-3.5 py-2.5 mt-1 cursor-pointer disabled:opacity-50"
          >
            + Añadir línea
          </button>

          {submitError && <ErrorText>{submitError}</ErrorText>}
        </Card>

        <Card className="py-5.5 px-6 sticky top-5">
          <div className="font-bold text-sm mb-4">Totales</div>
          <div className="flex justify-between py-1.5 text-[13.5px] text-ink-soft">
            <span>Base imponible</span>
            <span className="font-medium font-mono text-[13.5px] text-ink">
              {formatEUR(subtotal)}
            </span>
          </div>
          <div className="flex justify-between py-1.5 text-[13.5px] text-ink-soft">
            <span>IVA ({original.ivaRate}%)</span>
            <span className="font-medium font-mono text-[13.5px] text-ink">{formatEUR(iva)}</span>
          </div>
          {irpfShown && (
            <div className="flex justify-between pt-1.5 pb-3.5 text-[13.5px] text-ink-soft">
              <span>IRPF ({original.irpfRate}%)</span>
              <span className="font-medium font-mono text-[13.5px] text-ink">
                -{formatEUR(irpf)}
              </span>
            </div>
          )}
          <div className="flex justify-between pt-3.5 border-t border-border font-bold text-[15px]">
            <span>Total</span>
            <span className="font-bold text-[17px] font-mono">{formatEUR(total)}</span>
          </div>
          <div className="mt-4.5 py-3 px-3.5 bg-surface-alt rounded-lg text-xs text-ink-soft leading-relaxed">
            El IVA/IRPF se hereda de la factura original y no es editable. La numeración se asigna
            de forma atómica al emitir. Una vez emitida, la rectificativa queda bloqueada.
          </div>
        </Card>
      </div>
    </div>
  );
}
