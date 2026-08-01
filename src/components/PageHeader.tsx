import type { ReactNode } from "react";
import { CaretLeft } from "@phosphor-icons/react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div
      data-tauri-drag-region
      className="sticky top-0 z-20 flex items-center justify-between gap-4 h-16 px-8 -mx-8 mb-6
                 bg-toolbar-glass backdrop-blur-xl backdrop-saturate-150
                 border-b border-glass-border-soft
                 supports-[not(backdrop-filter)]:bg-bg"
    >
      <div className="min-w-0">
        <h1 className="font-bold text-[17px] tracking-tight m-0 truncate">{title}</h1>
        {subtitle && <div className="text-[12px] text-ink-soft truncate">{subtitle}</div>}
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 font-medium text-[13px] text-accent cursor-pointer mb-3.5 bg-transparent border-none p-0"
    >
      <CaretLeft size={14} weight="bold" />
      {label}
    </button>
  );
}
