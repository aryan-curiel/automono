import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Card } from "./Card";

type Tone = "neutral" | "warn";

const toneClass: Record<Tone, string> = {
  neutral: "text-ink-soft",
  warn: "text-warn",
};

export function KpiTile({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  subtitle,
  compact = false,
}: {
  label: string;
  value: string;
  icon: PhosphorIcon;
  tone?: Tone;
  subtitle?: string;
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
      {subtitle && <div className="text-[11px] text-ink-soft mt-1 truncate">{subtitle}</div>}
    </Card>
  );
}
