import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={400}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="z-50 px-2 py-1 rounded-control bg-ink text-bg text-[11px] font-medium shadow-float
                     [transform-origin:var(--radix-tooltip-content-transform-origin)]
                     data-[state=delayed-open]:animate-[popover-in_125ms_var(--ease-out)]
                     data-[state=closed]:animate-[popover-out_100ms_var(--ease-out)]"
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-ink" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
