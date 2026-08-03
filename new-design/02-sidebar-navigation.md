# 02 — Sidebar Navigation

Depends on: `00-design-foundations.md`, `01-window-chrome-and-titlebar.md` (for the top inset).

File: `src/components/Sidebar.tsx` (full rewrite of the styling, keep all existing logic — `initials()`, `NAV_ITEMS`, `GROUPED_SCREENS`, the `getBusinessProfile` effect, `onNavigate`/`onToggleTheme` props — untouched).

## Target: macOS "source list" (Mail / Notes / Music sidebar)

```
┌─────────────────────┐
│  [drag region / traffic lights]
│  🔶 AutoMono
│
│  󰸉 Resumen
│  󰀄 Clientes
│  󰈙 Facturas          ← selected: pill, accent-tinted
│  📄 Contratos
│  💰 Gastos
│  📊 Resumen trimestral
│
│         (flex-1 spacer)
│
│  Modo oscuro        ⏻
│  ────────────────────
│  (MI)  Marta Ibáñez
│        B12345678
└─────────────────────┘
```

## Icons (required — currently text-only)

Import from `@phosphor-icons/react` (installed in spec 00), `regular` weight, `size={18}`. Map each nav item to a semantically fitting glyph:

| Screen               | Icon                                                              |
| -------------------- | ----------------------------------------------------------------- |
| `dashboard`          | `House`                                                           |
| `clientes`           | `UsersThree`                                                      |
| `facturas`           | `Receipt`                                                         |
| `contratos`          | `FileText`                                                        |
| `gastos`             | `Wallet`                                                          |
| `resumen-trimestral` | `ChartPieSlice`                                                   |
| `ajustes`            | _(moved to a footer gear icon, see below — not in the main list)_ |

Extend the `NAV_ITEMS` array (Sidebar.tsx:11-19) to carry an `icon` component reference alongside `id`/`label`. Keep `ajustes` in `NAV_ITEMS` for now if moving it feels risky — icon-only or icon+label both work, this is a styling call, not a functional one.

## Selection state: sliding pill, not solid block

Current active state (`bg-accent` full block, line 75) is a flat-web pattern. macOS list selection is a rounded pill inset from the row edges, with the _pill itself_ animating between positions when you switch items (this is the one place `motion`'s `layoutId` earns its keep — see spec 00's dependency note and spec 12).

```tsx
import { motion } from "motion/react";

<div className="flex flex-col gap-0.5 px-0">
  {NAV_ITEMS.map((item) => {
    const active = activeGroup === item.id;
    const Icon = item.icon;
    return (
      <div
        key={item.id}
        onClick={() => onNavigate(item.id)}
        className="relative text-[13px] px-3 py-2 cursor-pointer"
      >
        {active && (
          <motion.div
            layoutId="sidebar-selection"
            className="absolute inset-0 rounded-control bg-sidebar-selection"
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        )}
        <div
          className={`relative z-10 flex items-center gap-2.5 ${
            active ? "font-semibold text-white" : "font-medium text-sidebar-text hover:text-white"
          }`}
        >
          <Icon size={18} weight="regular" />
          {item.label}
        </div>
      </div>
    );
  })}
</div>;
```

`--color-sidebar-selection` is the accent-tinted translucent token added in spec 00 — a soft orange wash, not a solid fill. This reads as "selected" without turning the whole row into a saturated block, matching how macOS selection pills look next to a dark sidebar background.

## Sidebar material

Keep it **opaque**, not glass (per spec 00's reasoning — nothing sits behind it to blur). The one native-feeling touch: a 1px inner highlight on the right edge, which is how AppKit sidebars visually separate from content without a heavy border:

```tsx
<div className="w-[230px] shrink-0 bg-sidebar-bg flex flex-col p-3 box-border border-r border-white/[0.04] dark:border-white/[0.03]">
```

Reduce the current `p-3.5` to `p-3` and item `py-2.5` → `py-2` — macOS list rows are tighter than the current spacing (`py-2` ≈ 8px vertical, closer to Mail's ~30px row height once you include the icon).

## Dark-mode toggle → real Switch

Replace the hand-rolled toggle div (lines 89-100) with Radix `Switch` (installed in spec 00), styled to match macOS's System Settings toggle exactly (green-on when on is the macOS system convention, but **keep the accent tint** here per the brand lock in spec 00 — this is a judgment call to preserve brand identity over pixel-matching macOS's default green):

```tsx
import * as Switch from "@radix-ui/react-switch";

<div className="flex items-center justify-between px-2.5 py-2 border-t border-sidebar-border mt-2 mb-2">
  <span className="font-medium text-xs text-sidebar-text">Modo oscuro</span>
  <Switch.Root
    checked={theme === "dark"}
    onCheckedChange={onToggleTheme}
    className="w-9 h-5 rounded-pill relative bg-[#3a4454] data-[state=checked]:bg-accent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
  >
    <Switch.Thumb className="block w-4 h-4 rounded-pill bg-white translate-x-0.5 transition-transform data-[state=checked]:translate-x-[18px]" />
  </Switch.Root>
</div>;
```

Same visual result as today, but now keyboard-operable and with a proper `role="switch"` — the current div has neither.

## Profile footer card

No functional change. Restyle: swap `rounded-lg` → `rounded-control` (spec 00's radius scale), keep everything else (lines 103-115) as-is — this piece already reads reasonably native.

## Pre-flight for this file

- [ ] Icons added for every nav item, one weight family (`regular`), consistent size.
- [ ] Sliding selection pill implemented with `motion`'s `layoutId`, spring transition.
- [ ] Row spacing tightened (`p-3`, `py-2`).
- [ ] Dark-mode toggle replaced with Radix `Switch`, same accent color, now keyboard-accessible.
- [ ] `NAV_ITEMS`/`GROUPED_SCREENS`/`onNavigate`/`onToggleTheme` logic untouched — verify navigation still works for every screen (App.tsx routing unchanged).
- [ ] Checked in both light and dark mode.
