# AutoMono → macOS Redesign Specs

13 spec files, meant to be executed **in numeric order**, one at a time, each as its own focused change/commit. Each file has its own pre-flight checklist at the bottom — treat that as the definition of done for that file.

## Design read

Redesign-overhaul of an existing Tauri desktop app (Spanish freelancer invoicing/tax tool) toward a native macOS / Apple Liquid Glass visual language. Preserves: all business logic, the Rust/Tauri backend, routing/IA, i18n keys, DB layer, PDF generation. Changes: everything visual — components, layout, window chrome, typography scale, motion.

Dials: `VARIANCE 3` · `MOTION 4` · `DENSITY 6` — this is a calm, grid-predictable productivity tool, not a marketing page. See `00-design-foundations.md` for the full reasoning.

**Brand lock:** the terracotta accent (`#c2632c` / `#e08a4f`) stays. It already reads as a deliberate macOS-style "accent tint" choice — don't replace it with system blue.

**"Liquid Glass" honesty note:** there's no official web CSS for Apple's Liquid Glass. Every file that uses `backdrop-filter` labels it as an approximation and restricts it to elements that actually have scrolling content behind them (toolbar, sheets, menus, toast) — never the sidebar, which stays an opaque native-feeling material. See `00-design-foundations.md`'s "What Liquid Glass honestly means here" section before touching any glass effect.

## Execution order

| # | File | Touches | New deps introduced |
|---|---|---|---|
| 00 | `00-design-foundations.md` | `src/index.css`, `package.json` | Phosphor, Radix (5 packages), `motion` |
| 01 | `01-window-chrome-and-titlebar.md` | `src-tauri/tauri.conf.json` | — (optional: `window-vibrancy` Rust crate) |
| 02 | `02-sidebar-navigation.md` | `src/components/Sidebar.tsx` | — |
| 03 | `03-toolbar-and-page-header.md` | `src/components/PageHeader.tsx`, `src/screens/Ajustes.tsx` (1-line fix) | — |
| 04 | `04-component-library.md` | `src/components/ui/*.tsx` (all), + new `Sheet.tsx`/`Menu.tsx`/`Tooltip.tsx`/`SegmentedControl.tsx` | — |
| 05 | `05-list-table-screens.md` | `Clientes.tsx`, `Facturas.tsx`, `Contratos.tsx`, `Gastos.tsx` | — |
| 06 | `06-detail-screens.md` | `ClienteDetalle.tsx`, `ContratoDetalle.tsx`, `GastoDetalle.tsx`, + new `InfoRow.tsx` | — |
| 07 | `07-invoice-detail.md` | `FacturaDetalle.tsx` | — |
| 08 | `08-forms.md` | `ClienteForm.tsx`, `ContratoForm.tsx`, `GastoForm.tsx`, `FacturaNueva.tsx`, `FacturaRectificar.tsx`, + new `FormRow.tsx` | — |
| 09 | `09-dashboard.md` | `Dashboard.tsx` | — |
| 10 | `10-resumen-trimestral.md` | `ResumenTrimestral.tsx`, `PeriodSelector.tsx` | — |
| 11 | `11-ajustes-settings.md` | `Ajustes.tsx` | — |
| 12 | `12-motion-and-interactions.md` | all screens (entrance animation), `src/index.css` (reduced-motion) | — |

00 and 04 are load-bearing for everything after — don't skip ahead. 01 is independent (window chrome) and can be done any time after 00. 05-11 can technically be reordered among themselves (they don't depend on each other, only on 00/03/04), but going in order keeps the shared components (`InfoRow`, `FormRow`) built before their first real use.

## What never changes, across every file

- Rust/Tauri command layer (`src-tauri/src/*.rs` except the one optional vibrancy line in spec 01).
- DB schema, migrations, query functions in `src/db/*.ts`.
- Screen component props/callback contracts — cross-checked against `App.tsx`'s routing block in every spec file.
- i18n keys and translation files (`src/locales/`).
- The invoice PDF preview inside `FacturaDetalle.tsx` (spec 07) — it must keep matching `pdf.rs`'s actual output.

## After all 13 are done

Re-run the Pre-Flight Check from the design-taste skill's Section 14 once, end-to-end, against the whole app rather than per-file — in particular: dark mode in every screen, `prefers-reduced-motion`, and a window-resize check down to the new `960×600` floor (spec 01).
