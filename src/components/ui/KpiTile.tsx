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
}: {
  label: string;
  value: string;
  icon: PhosphorIcon;
  tone?: Tone;
}) {
  return (
    <Card className="py-4 px-4.5 relative overflow-hidden">
      <Icon size={16} weight="bold" className={`${toneClass[tone]} mb-2.5`} />
      <div className="font-medium text-xs text-ink-soft mb-1">{label}</div>
      <div className="font-bold text-[22px] font-mono tracking-tight">{value}</div>
    </Card>
  );
}
