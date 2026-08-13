import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { TrendDown, TrendUp } from "@phosphor-icons/react";
import { Card } from "./Card";

type Tone = "neutral" | "warn";

const toneClass: Record<Tone, string> = {
  neutral: "text-ink-soft",
  warn: "text-warn",
};

export interface KpiDelta {
  /** Already-signed, already-formatted amount, e.g. "+1.234,00 €" or "-45,00 €". */
  formatted: string;
  /** Which way the underlying number moved — picks the trend icon. */
  direction: "up" | "down";
  /** Whether that movement is good or bad news for this particular metric (an expense
   * going up is "down"/danger even though the number itself increased). */
  tone: "success" | "danger";
}

export function KpiTile({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  subtitle,
  delta,
  compact = false,
}: {
  label: string;
  value: string;
  icon: PhosphorIcon;
  tone?: Tone;
  subtitle?: string;
  /** Quarter-over-quarter change, shown as a small colored trend line below the value. */
  delta?: KpiDelta;
  /** Shrinks the value type — use in tight rows (e.g. 5-across KPI grids) to avoid clipping. */
  compact?: boolean;
}) {
  return (
    <Card className={`py-4 ${compact ? "px-3" : "px-4.5"} relative overflow-hidden min-w-0`}>
      <Icon size={16} weight="bold" className={`${toneClass[tone]} mb-2.5`} />
      <div className="font-medium text-xs text-ink-soft mb-1 truncate">{label}</div>
      <div
        className={`font-bold font-mono tracking-tight truncate ${compact ? "text-[19px]" : "text-[22px]"}`}
      >
        {value}
      </div>
      {delta && (
        <div
          className={`flex items-center gap-1 text-[11px] font-medium mt-1 truncate ${
            delta.tone === "success" ? "text-success" : "text-danger"
          }`}
        >
          {delta.direction === "up" ? (
            <TrendUp size={11} weight="bold" />
          ) : (
            <TrendDown size={11} weight="bold" />
          )}
          {delta.formatted}
        </div>
      )}
      {subtitle && <div className="text-[11px] text-ink-soft mt-1 truncate">{subtitle}</div>}
    </Card>
  );
}
