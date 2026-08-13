import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ReactNode } from "react";

/** Click-triggered floating bubble (unlike Tooltip, which is hover-only) — for content worth
 * reading rather than a one-line hint, so it wraps within a fixed max width instead of
 * stretching into one long line. */
export function Popover({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={6}
          className="z-50 max-w-64 px-3 py-2 rounded-control bg-ink text-bg text-[12px] font-medium
                     leading-snug shadow-float
                     [transform-origin:var(--radix-popover-content-transform-origin)]
                     data-[state=open]:animate-[popover-in_125ms_var(--ease-out)]
                     data-[state=closed]:animate-[popover-out_100ms_var(--ease-out)]"
        >
          {content}
          <PopoverPrimitive.Arrow className="fill-ink" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
