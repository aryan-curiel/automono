import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ErrorText, TextArea, TextInput } from "../components/ui/Field";
import { FormRow } from "../components/ui/FormRow";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { PageHeader } from "../components/PageHeader";
import { invoiceNumberLabel } from "../lib/invoice";
import { formatEUR } from "../lib/format";
import { getClient } from "../db/clients";
import type { ClientRecord } from "../db/clients";
import { createRectification, getInvoiceWithLines } from "../db/invoices";
import type { InvoiceListItem, InvoiceRecord } from "../db/invoices";
import type { RectificationType } from "../types";
import { irpfApplicable } from "../features/clients";

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
  quantity: string;
  unitPrice: string;
}

function mkLine(description: string, quantity: number, unitPrice: number): DraftLine {
  return {
    key: `${Date.now()}-${Math.random()}`,
    description,
    quantity: String(quantity),
    unitPrice: String(unitPrice),
  };
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
  const { t } = useTranslation();
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
    ? `${client.seriesPrefix}-R${String(client.nextRectificationNumber).padStart(3, "0")}`
    : "";
  const helpText =
    rectType === "full" ? t("invoices.help.full") : t("invoices.help.partial");

  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const iva = (subtotal * original.ivaRate) / 100;
  const irpf = (subtotal * original.irpfRate) / 100;
  const irpfForeignClient = !irpfApplicable(original.clientCountry);
  const total = subtotal + iva - irpf;

  function updateLine(idx: number, field: "description" | "quantity" | "unitPrice", value: string) {
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
      setSubmitError(t("invoices.errors.reasonRequired"));
      return;
    }
    const validLines = lines.filter((l) => l.description.trim());
    if (validLines.length === 0) {
      setSubmitError(t("invoices.errors.linesRequired"));
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
          quantity: Number(l.quantity) || 0,
          unitPrice: Number(l.unitPrice) || 0,
        })),
      );
      onEmit(created);
    } catch {
      setSubmitError(t("invoices.errors.rectificationFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  const reasonError =
    submitError && !reason.trim() ? t("invoices.errors.reasonRequired") : undefined;

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title={t("invoices.rectificationOf", { number: origNumber })}
        backLabel={origNumber}
        onBack={onCancel}
        actions={
          <Button onClick={handleEmit} disabled={submitting}>
            {submitting ? t("invoices.actions.issuing") : t("invoices.actions.issueRectification")}
          </Button>
        }
      />

      <div className="grid grid-cols-[2fr_1fr] gap-5 items-start">
        <Card className="px-5">
          <FormRow label={t("invoices.fields.rectificationNumber")}>
            <TextInput mono readOnly value={numberPreview} />
          </FormRow>
          <FormRow label={t("invoices.fields.type")}>
            <SegmentedControl
              options={[
                { value: "full" as RectificationType, label: t("invoices.rectType.full") },
                { value: "partial" as RectificationType, label: t("invoices.rectType.partial") },
              ]}
              value={rectType}
              onChange={(v) => (v === "full" ? onSetFull() : onSetPartial())}
              disabled={submitting}
            />
          </FormRow>
          <FormRow label={t("invoices.fields.reason")} error={reasonError}>
            <TextArea
              value={reason}
              error={!!reasonError}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder={t("invoices.fields.reasonPlaceholder")}
              className="h-18 font-sans"
              disabled={submitting}
            />
          </FormRow>
        </Card>

        <Card className="py-5.5 px-6 sticky top-5">
          <div className="font-bold text-sm mb-4">{t("invoices.totals.title")}</div>
          <div className="flex justify-between py-1.5 text-[13px] text-ink-soft">
            <span>{t("invoices.totals.subtotal")}</span>
            <span className="font-medium font-mono text-[13px] text-ink">
              {formatEUR(subtotal)}
            </span>
          </div>
          <div className="flex justify-between py-1.5 text-[13px] text-ink-soft">
            <span>{t("invoices.totals.ivaWithRate", { rate: original.ivaRate })}</span>
            <span className="font-medium font-mono text-[13px] text-ink">{formatEUR(iva)}</span>
          </div>
          <div className="flex justify-between pt-1.5 pb-3.5 text-[13px] text-ink-soft">
            <span>
              {t("invoices.totals.irpfWithRate", { rate: original.irpfRate })}
              {irpfForeignClient && t("invoices.totals.foreignClientSuffix")}
            </span>
            <span className="font-medium font-mono text-[13px] text-ink">
              -{formatEUR(irpf)}
            </span>
          </div>
          <div className="flex justify-between pt-3.5 border-t border-border font-bold text-[15px]">
            <span>{t("invoices.totals.total")}</span>
            <span className="font-bold text-[17px] font-mono">{formatEUR(total)}</span>
          </div>
          <div className="mt-4.5 py-3 px-3.5 bg-surface-alt rounded-card text-xs text-ink-soft leading-relaxed">
            {t("invoices.totals.lockNoticeRectification")}
          </div>
        </Card>
      </div>

      <Card className="py-5 px-6 mt-5">
        <div className="mb-3.5 py-3 px-3.5 bg-surface-alt rounded-card text-xs text-ink-soft leading-relaxed">
          {helpText}
        </div>
        <div className="font-bold text-[13px] mb-2.5">{t("invoices.lines.title")}</div>
        <div className="grid grid-cols-[2.4fr_.7fr_1fr_1fr_28px] gap-2 font-semibold text-xs uppercase text-ink-soft pb-1.5">
          <div>{t("invoices.lines.description")}</div>
          <div>{t("invoices.lines.quantity")}</div>
          <div className="text-right">{t("invoices.lines.price")}</div>
          <div className="text-right">{t("invoices.lines.total")}</div>
          <div />
        </div>
        {lines.map((l, idx) => (
          <div
            key={l.key}
            className="group grid grid-cols-[2.4fr_.7fr_1fr_1fr_28px] gap-2 items-center rounded-control -mx-2 px-2 py-1 transition-colors hover:bg-surface-alt"
          >
            <TextInput
              value={l.description}
              onChange={(e) => updateLine(idx, "description", e.target.value)}
              disabled={submitting}
            />
            <TextInput
              mono
              value={l.quantity}
              onChange={(e) => updateLine(idx, "quantity", e.target.value)}
              disabled={submitting}
            />
            <TextInput
              mono
              className="text-right"
              value={l.unitPrice}
              onChange={(e) => updateLine(idx, "unitPrice", e.target.value)}
              disabled={submitting}
            />
            <div className="font-semibold text-[13px] font-mono py-2 text-right">
              {formatEUR((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))}
            </div>
            <button
              onClick={() => !submitting && removeLine(idx)}
              className="p-1 rounded-control text-ink-soft hover:bg-border cursor-pointer opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              aria-label={t("invoices.lines.remove")}
            >
              <X size={14} weight="bold" />
            </button>
          </div>
        ))}
        <Button
          variant="dashed"
          className="mt-1.5"
          onClick={() => setLines((ls) => [...ls, mkLine("", 1, 0)])}
          disabled={submitting}
        >
          {t("invoices.lines.add")}
        </Button>

        {submitError && !reasonError && <ErrorText>{submitError}</ErrorText>}
      </Card>
    </div>
  );
}
