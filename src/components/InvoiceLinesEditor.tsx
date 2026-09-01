import { useTranslation } from "react-i18next";
import { X } from "@phosphor-icons/react";
import { Button } from "./ui/Button";
import { TextInput } from "./ui/Field";
import { formatEUR } from "../lib/format";
import type { DraftLine } from "../features/invoices/lines";

interface InvoiceLinesEditorProps {
  lines: DraftLine[];
  onUpdateLine: (idx: number, field: "description" | "quantity" | "unitPrice", value: string) => void;
  onRemoveLine: (idx: number) => void;
  onAddLine: () => void;
  disabled: boolean;
}

export function InvoiceLinesEditor({
  lines,
  onUpdateLine,
  onRemoveLine,
  onAddLine,
  disabled,
}: InvoiceLinesEditorProps) {
  const { t } = useTranslation();

  return (
    <>
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
            onChange={(e) => onUpdateLine(idx, "description", e.target.value)}
            disabled={disabled}
          />
          <TextInput
            mono
            value={l.quantity}
            onChange={(e) => onUpdateLine(idx, "quantity", e.target.value)}
            disabled={disabled}
          />
          <TextInput
            mono
            className="text-right"
            value={l.unitPrice}
            onChange={(e) => onUpdateLine(idx, "unitPrice", e.target.value)}
            disabled={disabled}
          />
          <div className="font-semibold text-[13px] font-mono py-2 text-right">
            {formatEUR((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))}
          </div>
          <button
            onClick={() => !disabled && onRemoveLine(idx)}
            className="p-1 rounded-control text-ink-soft hover:bg-border cursor-pointer opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label={t("invoices.lines.remove")}
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      ))}
      <Button variant="dashed" className="mt-1.5" onClick={onAddLine} disabled={disabled}>
        {t("invoices.lines.add")}
      </Button>
    </>
  );
}
