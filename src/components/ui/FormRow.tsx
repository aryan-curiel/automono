import type { ReactNode } from "react";
import { ErrorText } from "./Field";

export function FormRow({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3 border-t border-border first:border-t-0">
      <label className="text-[13px] text-ink-soft pt-2 w-40 shrink-0">{label}</label>
      <div className="flex-1 max-w-80">
        {children}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </div>
  );
}
