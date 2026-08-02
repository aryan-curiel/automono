import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align="end"
        sideOffset={4}
        className="z-50 min-w-[180px] rounded-card bg-sheet-glass backdrop-blur-xl backdrop-saturate-150
                   border border-glass-border shadow-sheet p-1
                   supports-[not(backdrop-filter)]:bg-surface
                   [transform-origin:var(--radix-dropdown-menu-content-transform-origin)]
                   data-[state=open]:animate-[popover-in_150ms_var(--ease-out)]
                   data-[state=closed]:animate-[popover-out_100ms_var(--ease-out)]"
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({
  children,
  danger,
  ...props
}: React.ComponentProps<typeof DropdownMenu.Item> & { danger?: boolean }) {
  return (
    <DropdownMenu.Item
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-control text-[13px] cursor-pointer outline-none
                  ${danger ? "text-danger" : "text-ink"} data-[highlighted]:bg-surface-alt`}
      {...props}
    >
      {children}
    </DropdownMenu.Item>
  );
}
