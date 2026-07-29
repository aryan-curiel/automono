# 00 — Design Foundations

**Read this first.** Every other spec file in this folder assumes the tokens, materials, and primitives defined here already exist. Execute this one first.

## Design read

Redesign-overhaul of AutoMono, a Tauri desktop app for Spanish freelancers (invoicing, expenses, quarterly tax summaries). Target: as close to native macOS as CSS + Tailwind + a couple of headless primitives can honestly get. This ships as a real `.app`, not a browser tab — lean into that (no responsive breakpoints, no mobile nav, a real title bar).

Dials: `VARIANCE 3` (native apps are grid-predictable, not asymmetric-landing-page), `MOTION 4` (fluid, a few real springs, never cinematic), `DENSITY 6` (financial tables stay dense, just organized).

**Brand lock:** keep the terracotta accent (`#c2632c` light / `#e08a4f` dark). It already reads as a deliberate "accent tint" choice, exactly like macOS's own System Settings → Appearance accent-color picker (which ships an orange option). Do not replace it with system blue. One accent, used identically everywhere (Section 4.2 Color Consistency Lock).

## What "Liquid Glass" honestly means here

There is no official web CSS for Apple's Liquid Glass — see Appendix C of the design-taste skill. We approximate with `backdrop-filter` + layered borders + highlight overlays, and we label it as an approximation in code comments where it matters. Two tiers:

1. **CSS approximation (default, do this first)** — `backdrop-filter: blur() saturate()` on toolbars/sheets/popovers that sit *over scrolling content*. This only reads as "glass" where there's something moving underneath to blur, so use it exclusively on elements that overlap scrollable content: the sticky toolbar (spec 03), modals/sheets (spec 04), popovers/menus (spec 04).
2. **Real native vibrancy (optional upgrade, separate spec)** — the `window-vibrancy` Rust crate can apply true `NSVisualEffectView` materials to the actual Tauri window, blurring whatever is *behind the window* (other apps, desktop). This is the authentic version but touches `src-tauri/Cargo.toml` and `lib.rs`. Left as an optional follow-up in `01-window-chrome-and-titlebar.md` — do the CSS version first, it gets you 90% of the way with zero Rust changes.

The sidebar itself is **not** glass — real macOS sidebars (Mail, Notes, Settings) sit at a flat opaque-ish tint with no content behind them to blur. Giving it `backdrop-filter` with nothing behind it is just a translucency effect with a color-mixing artifact, not glass. Keep it a solid material (see below).

## Color tokens

Extend `src/index.css` `:root` / `.dark` blocks — keep the existing custom-property + `@theme` re-export pattern, do not switch strategies. New tokens only, existing ones (`--color-bg`, `--color-accent`, etc.) stay as-is.

```css
:root {
  /* existing tokens unchanged */

  /* new: materials */
  --color-toolbar-glass: rgb(247 245 241 / 0.72);   /* bg tinted, translucent */
  --color-sheet-glass: rgb(255 255 255 / 0.82);
  --color-glass-border: rgb(255 255 255 / 0.5);      /* inner highlight edge */
  --color-glass-border-soft: rgb(28 36 48 / 0.06);   /* outer hairline */
  --color-overlay-scrim: rgb(28 36 48 / 0.25);        /* behind modals/sheets */

  /* new: sidebar material (opaque, not glass) */
  --color-sidebar-selection: rgb(194 99 44 / 0.16);   /* accent-tinted selection pill */

  /* new: focus ring, matches accent */
  --color-focus-ring: rgb(194 99 44 / 0.35);
}

.dark {
  --color-toolbar-glass: rgb(20 24 31 / 0.72);
  --color-sheet-glass: rgb(28 34 43 / 0.82);
  --color-glass-border: rgb(255 255 255 / 0.08);
  --color-glass-border-soft: rgb(0 0 0 / 0.35);
  --color-overlay-scrim: rgb(0 0 0 / 0.5);
  --color-sidebar-selection: rgb(224 138 79 / 0.22);
  --color-focus-ring: rgb(224 138 79 / 0.4);
}
```

Add matching entries to the `@theme` block so these are usable as Tailwind utilities (`bg-toolbar-glass`, `border-glass-border`, etc.) — follow the exact pattern already used for the other 15 tokens.

## Radius scale (Shape Consistency Lock)

macOS uses continuous "squircle" corners that CSS can't produce natively — we approximate with a slightly larger, consistent radius scale than the current app uses. Pick these and use them everywhere, no exceptions:

| Token | Value | Use |
|---|---|---|
| `--radius-control` | `8px` | buttons, inputs, select, nav rows, table row hover |
| `--radius-card` | `12px` | Card, grouped-form sections, KPI tiles |
| `--radius-sheet` | `16px` | modals, sheets, popovers, menus |
| `--radius-pill` | `9999px` | badges, toggle switches, avatar, segmented control |

Add as Tailwind theme values: `--radius-control`, `--radius-card`, `--radius-sheet` in the `@theme` block (Tailwind v4 already namespaces `--radius-*` to `rounded-*` utilities automatically — confirm `rounded-control` / `rounded-card` / `rounded-sheet` resolve after adding).

Replace every current `rounded-lg` → `rounded-control`, `rounded-xl` → `rounded-card` across the codebase as each spec file's screens get touched. Don't do a blanket find/replace up front — let each screen's spec cover its own files so review stays scoped.

## Shadows

Current app has almost none (2 total uses). macOS uses soft, hue-tinted shadows for anything that floats above content (menus, popovers, sheets) and none for flat in-flow cards. Add to `@theme` or as plain utility classes:

```css
--shadow-float: 0 1px 2px rgb(28 36 48 / 0.06), 0 8px 24px rgb(28 36 48 / 0.10);
--shadow-sheet: 0 4px 8px rgb(28 36 48 / 0.08), 0 24px 48px rgb(28 36 48 / 0.18);
```
Dark mode: same shadows, but shadows read as pure darkening in dark UIs — keep the same alpha values, they still work since the shadow sits on top of a lighter scrim in both modes. Do not use pure-black shadows (`rgb(0 0 0 / …)`) — tint toward `--color-ink` (`#1c2430` / `#eef1f5`... actually shadows always tint dark regardless of theme, so tint toward the *light-mode* ink `#1c2430` in both themes).

In-flow `Card` stays shadow-less (flat, `border` only) exactly as today — only floating layers (spec 04's Sheet/Popover/Menu, spec 12's toast) get shadows.

## Typography

Keep Public Sans + IBM Plex Mono — do not swap fonts. Both are legitimate, non-default choices already (not Inter, not a banned serif), and switching risks re-litigating a decision nobody asked to revisit. What changes is **scale and weight discipline**, not the family:

- Page/section titles: macOS uses large-title weight `font-bold` (not `font-extrabold`) at a slightly tighter size. Change `PageHeader` title from `font-extrabold text-2xl` → `font-bold text-[22px] tracking-tight` (see spec 03).
- Section headers inside grouped cards (Ajustes-style): keep `font-bold text-sm`, no change.
- Table column headers: keep `text-xs uppercase tracking-wide text-ink-soft` — this already matches macOS list-header conventions.
- Numbers/money/fiscal codes: keep `font-mono` — correct choice already, macOS Numbers/Finance-adjacent apps do the same.

## Icons

No icon library currently installed (nav uses plain text, buttons use `+`/`←` glyphs). Install **Phosphor** (priority pick per design-taste skill, and its thin/regular weight reads closest to SF Symbols' hairline style):

```bash
bun add @phosphor-icons/react
```

Standardize on the `regular` weight at `size={18}` for nav/toolbar icons, `size={14}` for inline/badge icons, `weight="bold"` reserved for the one or two icons that need emphasis (e.g. a destructive action). One weight family for the whole app — don't mix `thin` and `duotone`.

## New dependencies to install (all justified below, none speculative)

```bash
bun add @phosphor-icons/react
bun add @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tooltip @radix-ui/react-select @radix-ui/react-switch
bun add motion
```

- **Radix primitives**: the app has zero Modal/Dropdown/Tooltip/Select/Switch today (confirmed — every interactive widget is hand-rolled `<div onClick>`). macOS-native patterns (sheets, context menus, tooltips on truncated text, a real toggle switch) are accessibility-sensitive — keyboard nav, focus trap, `aria-*`, portal/z-index handling. This is the textbook case for "don't hand-roll it, a solved primitive exists" (ladder rung 5). Radix ships unstyled — all visual styling stays Tailwind, per spec 04.
- **`motion`** (née Framer Motion): needed for exactly two things — the sliding sidebar-selection indicator (`layoutId`, spec 02) and sheet/popover enter transitions with real spring physics (spec 12). CSS `transition` cannot do shared-layout position animation. Scope usage tightly — do not reach for it for simple hover states, those stay plain CSS `transition-colors`/`transition-transform`.

Do **not** install GSAP, Three.js, or any chart/table library — nothing in this redesign needs scroll-hijacking, WebGL, or a table engine beyond what CSS Grid already does.

## Dark mode

No strategy change — class-based (`.dark` on `<html>`), toggled from Sidebar, stays exactly as implemented. Every new token above already has a `.dark` value. Test every spec's screens in both modes before considering it done (Section 8.D).

## Pre-flight for this file

- [ ] New CSS tokens added to `:root`/`.dark`/`@theme` in `src/index.css`, nothing existing removed or renamed.
- [ ] Radius scale added, no screen touched yet (that happens per-spec).
- [ ] Phosphor, Radix packages, and `motion` installed.
- [ ] Accent color unchanged (`#c2632c` / `#e08a4f`).
