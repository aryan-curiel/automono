import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-5.5">
      <div>
        <h1 className="font-extrabold text-2xl tracking-tight m-0 mb-1">{title}</h1>
        {subtitle && <div className="text-sm text-ink-soft">{subtitle}</div>}
      </div>
      {actions && <div className="flex gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
}

export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div onClick={onClick} className="font-semibold text-[13px] text-accent cursor-pointer mb-3.5">
      &larr; {label}
    </div>
  );
}
