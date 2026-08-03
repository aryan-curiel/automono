# 04 — Component Library (`src/components/ui/`)

Depends on: `00-design-foundations.md`.

Covers every existing primitive (`Button`, `Card`, `Badge`, `Field.tsx`'s exports, `Toast`) plus new ones the app needs but doesn't have (`Sheet`/`Modal`, `Menu`, `Tooltip`, `SegmentedControl`). Do this file before 05-11 since every screen spec assumes these exist.

## `Button.tsx` — restyle, same API

Current: 4 variants (`primary`/`secondary`/`ghost-danger`/`dashed`), all `rounded-lg`, flat fills, no press feedback (`src/components/ui/Button.tsx`).

macOS button conventions: default buttons have a soft 1px border + very subtle top-highlight (not flat), the "prominent" (primary) button gets a tiny shadow, and every button visibly depresses on click (`:active` scale, Section 4.5 Tactile Feedback). Keep the same 4-variant API and prop shape — only change the class strings:

```tsx
const base =
  "font-semibold text-[13px] rounded-control cursor-pointer whitespace-nowrap " +
  "transition-[transform,background-color,box-shadow] duration-150 " +
  "active:scale-[0.97] disabled:opacity-50 disabled:cursor-default disabled:active:scale-100 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white px-4 py-2 shadow-[0_1px_2px_rgb(0,0,0,0.12)] hover:brightness-105",
  secondary: "bg-surface text-ink border border-border px-4 py-2 hover:bg-surface-alt",
  "ghost-danger": "bg-transparent text-danger px-1 py-2 hover:bg-danger-soft rounded-control",
  dashed:
    "bg-transparent text-accent border border-dashed border-border px-3.5 py-2 hover:bg-surface-alt",
};
```

Padding tightened from `px-5 py-2.5` to `px-4 py-2` and text from `text-sm` to `text-[13px]` — macOS controls run smaller than typical web buttons. `active:scale-[0.97]` is the one micro-interaction every button in the app gets for free (Section 4.5's mandatory tactile-feedback rule) — this is `transform`-only, GPU-cheap, no `motion` needed.

## `Card.tsx` — radius token swap only

`rounded-xl` → `rounded-card`. Nothing else changes — it's already the right flat, bordered, no-shadow pattern for in-flow content (spec 00 explicitly keeps in-flow cards shadow-less).

## `Field.tsx` — restyle, same API

Current `fieldBase` (Field.tsx:12) is `rounded-lg` with a plain 1px border and browser-default focus (the `input:focus { border-color: accent !important }` global rule in `index.css:87-91`). macOS text fields have a subtle inset look and a soft focus _ring_ (glow), not just a border color swap:

```tsx
const fieldBase =
  "w-full box-border text-[13px] px-3 py-2 rounded-control bg-surface text-ink " +
  "border border-border shadow-[inset_0_1px_1px_rgb(0,0,0,0.03)] " +
  "transition-[box-shadow,border-color] duration-150 " +
  "focus:border-accent focus:shadow-[0_0_0_3px_var(--color-focus-ring)] focus:outline-none";
```

Remove the global `!important` focus rule in `index.css:87-91` — Tailwind's `focus:` utilities on the input itself now own this, the global override was a workaround for not having per-component focus styling and actively fights the new ring approach (`!important` would clip the ring's box-shadow layering in some browsers).

`Label` (Field.tsx:8-10): drop `font-semibold` to `font-medium`, keep `text-xs text-ink-soft`.

## `Badge.tsx` — radius token swap only

`rounded-full` → `rounded-pill` (same value, just the semantic token from spec 00 — every pill-shaped element in the app should reference the same token so a future radius change is one edit, not a grep-and-replace).

## `Toast.tsx` — restyle to macOS notification banner

Current toast (Toast.tsx) is a plain bordered box, bottom-right, no entrance animation, error-only (`bg-danger-soft`). Real macOS notification banners: glass background, drop shadow, slide-in from the top-right, rounded-sheet corners.

```tsx
import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { WarningCircle } from "@phosphor-icons/react";

export function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="fixed top-16 right-5 z-50 max-w-sm flex items-start gap-2.5 px-4 py-3
                   rounded-sheet bg-sheet-glass backdrop-blur-xl backdrop-saturate-150
                   border border-glass-border shadow-sheet text-[13px] font-medium text-ink
                   supports-[not(backdrop-filter)]:bg-surface"
      >
        <WarningCircle size={18} weight="fill" className="text-danger shrink-0 mt-0.5" />
        {message}
      </motion.div>
    </AnimatePresence>
  );
}
```

Moved from bottom-right to top-right (macOS Notification Center convention) and now glass since it _floats over_ content — this is one of the legitimate glass use-cases from spec 00. Only requires wrapping the existing two call sites in `App.tsx` (lines 352-353) with `<AnimatePresence>` if you want exit animations on dismiss too — optional, the entrance alone satisfies "motion claimed, motion shown" here since dismiss is a timeout/unmount either way.

## New: `Sheet` (modal dialog) — `src/components/ui/Sheet.tsx`

Nothing in the app currently uses a modal (the restore-backup confirmation in `Ajustes.tsx:186-191` uses a blocking native `window.confirm()`, and the mark-paid flow in `FacturaDetalle` — not yet read in detail, but referenced by `App.tsx`'s `markingPaid` state — likely does something similar inline). Built on Radix `Dialog` (installed in spec 00):

```tsx
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { motion } from "motion/react";
import type { ReactNode } from "react";

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-overlay-scrim"
          />
        </Dialog.Overlay>
        <Dialog.Content asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                       w-full max-w-md rounded-sheet bg-sheet-glass backdrop-blur-xl backdrop-saturate-150
                       border border-glass-border shadow-sheet p-6
                       supports-[not(backdrop-filter)]:bg-surface"
          >
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="font-bold text-[15px]">{title}</Dialog.Title>
              <Dialog.Close className="text-ink-soft hover:text-ink cursor-pointer">
                <X size={16} />
              </Dialog.Close>
            </div>
            {children}
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Use this to replace the mark-paid confirmation (referenced from `App.tsx`'s `markingPaid`/`onOpenMarkPaid`/`onConfirmMarkPaid` props, actual UI lives in `FacturaDetalle.tsx` — see spec 07) and, optionally, the `window.confirm()` in `Ajustes.tsx:186-191` for restore confirmation (native `confirm()` is functionally fine and out of scope to force-replace — flag as optional in spec 11, not required here).

## New: `Menu` (dropdown/context menu) — `src/components/ui/Menu.tsx`

Built on Radix `DropdownMenu`. Needed wherever a row or detail screen needs a secondary-actions affordance (e.g. a `⋯` button on table rows in spec 05, or the invoice actions in spec 07 instead of a row of separate buttons):

```tsx
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
                   data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95
                   data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95"
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
```

`data-[state=open]:animate-in …` classes assume `tailwindcss-animate`-style utilities are **not** installed — if those utility names don't resolve (they're not core Tailwind v4), drop them and rely on Radix's own mount/unmount timing, or add a small `@keyframes` block in `index.css` instead. Don't add a new dependency just for this — CSS-only fallback is one keyframe.

## New: `Tooltip` — `src/components/ui/Tooltip.tsx`

Built on Radix `Tooltip`. Use for truncated table cells (client names, long descriptions) and icon-only buttons that need a text hint:

```tsx
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
          className="z-50 px-2 py-1 rounded-control bg-ink text-bg text-[11px] font-medium shadow-float"
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-ink" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
```

Wrap `<TooltipProvider>` once at the root in `App.tsx` (around the existing top-level `<div>`, App.tsx:136).

## New: `SegmentedControl` — `src/components/ui/SegmentedControl.tsx`

macOS's `NSSegmentedControl` — used to replace `PeriodSelector`'s kind-picker `<Select>` in spec 10 (month/quarter/year is a 3-way exclusive choice, exactly what segmented controls are for, not a dropdown):

```tsx
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex p-0.5 rounded-control bg-surface-alt border border-border">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 text-[12.5px] font-medium rounded-[6px] transition-colors cursor-pointer
            ${value === opt.value ? "bg-surface shadow-[0_1px_2px_rgb(0,0,0,0.08)] text-ink" : "text-ink-soft hover:text-ink"}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

Plain CSS, no Radix needed — it's a controlled button group, no complex a11y beyond what native `<button>` already gives you (ladder rung 3/4: native elements cover it).

## Pre-flight for this file

- [ ] `Button`, `Card`, `Field.tsx`, `Badge` restyled, same exported API/props — no call sites need changes.
- [ ] Global `input:focus { !important }` rule removed from `index.css`, replaced by per-component focus ring.
- [ ] `Toast` restyled + repositioned top-right, entrance animation via `motion`.
- [ ] New `Sheet`, `Menu`, `Tooltip`, `SegmentedControl` components created, none wired into screens yet (that's specs 05-11).
- [ ] `TooltipProvider` mounted once at app root.
- [ ] Checked in both light and dark mode.
