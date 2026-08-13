import type { ReactNode } from "react";

export type Tone = "success" | "warning" | "info" | "danger" | "neutral";

const tones: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warn-soft text-warn",
  info: "bg-info-soft text-info",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-surface-alt text-ink-soft",
};

export function Badge({
  tone,
  children,
  className = "",
  title,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-block text-xs font-semibold rounded-pill px-2.5 py-1 ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
