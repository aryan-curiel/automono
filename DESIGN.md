---
name: AutoMono
description: Native macOS-styled Tauri app for Spanish freelancer invoicing, contracts, and quarterly tax filing
colors:
  accent: "#c2632c"
  accent-dark: "#e08a4f"
  bg: "#f7f5f1"
  bg-dark: "#14181f"
  surface: "#ffffff"
  surface-dark: "#1c222b"
  surface-alt: "#f2efe9"
  surface-alt-dark: "#232a35"
  border: "#e6e1d6"
  border-dark: "#2c333f"
  ink: "#1c2430"
  ink-dark: "#eef1f5"
  ink-soft: "#5b6472"
  ink-soft-dark: "#93a0af"
  sidebar-bg: "#1c2430"
  sidebar-bg-dark: "#10131a"
  success: "#2f7a4f"
  success-dark: "#5ec98d"
  warn: "#8a6612"
  warn-dark: "#e0b45c"
  info: "#2c568f"
  info-dark: "#6ea6e0"
  danger: "#b3402c"
  danger-dark: "#e0836a"
typography:
  title:
    fontFamily: "Public Sans, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Public Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "Public Sans, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  mono:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "13px"
    fontWeight: 500
rounded:
  control: "8px"
  card: "12px"
  sheet: "16px"
  pill: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  badge:
    rounded: "{rounded.pill}"
    padding: "4px 10px"
---

# Design System: AutoMono

## 1. Overview

**Creative North Star: "The Native Panel"**

AutoMono is built to feel like it shipped inside macOS itself, a System Settings pane or a Mail/Notes-caliber first-party app, not a web dashboard wearing a rounded-corner costume. Every material decision asks one question: would this exist in a real `NSView`? Glass is honest (it only blurs where content actually scrolls beneath it), the sidebar is opaque exactly like Mail's, motion is a spring or nothing, and the one terracotta accent stands in for the system's own accent-color picker.

The system explicitly rejects SaaS-dashboard aesthetics: no hero metrics, no gradient accents, no asymmetric landing-page layout, no second accent color competing with the terracotta lock, and no decorative glassmorphism applied where nothing is scrolling behind it. Confidence here comes from restraint and correctness, not visual flourish, because the data on screen is someone's real invoices and tax filings.

**Key Characteristics:**

- One locked accent (terracotta), used identically everywhere, never swapped for system blue
- Honest glass: blur only over scrolling content (toolbar, sheets, menus); flat opaque elsewhere
- Grid-predictable density: dense financial tables, organized rather than cramped
- Springs, never bounce: motion is functional (sliding selection, sheet entrance), fully disabled under `prefers-reduced-motion`

## 2. Colors

Tinted neutrals carrying almost the entire surface, with one warm accent used sparingly and consistently, the Restrained strategy true to a productivity tool where the data itself is the visual interest.

### Primary

- **Burnt Terracotta** (`#c2632c` light / `#e08a4f` dark): the single accent, used identically for primary buttons, active nav state, links, focus rings, and selection highlights. Never introduced a second time in a different hue.

### Neutral

- **Warm Linen** (`#f7f5f1` / `#14181f` dark): app background.
- **Paper White** (`#ffffff` / `#1c222b` dark): card and surface background.
- **Warm Linen Alt** (`#f2efe9` / `#232a35` dark): secondary surface (hover states, alt rows, grouped-section backgrounds).
- **Dry Hairline** (`#e6e1d6` / `#2c333f` dark): borders and dividers.
- **Deep Slate Ink** (`#1c2430` / `#eef1f5` dark): primary text.
- **Soft Slate** (`#5b6472` / `#93a0af` dark): secondary/muted text, labels, timestamps.
- **Charcoal Panel** (`#1c2430` light / `#10131a` dark): sidebar background, deliberately dark in both themes, matching native sidebar convention.

### Semantic (status)

- **Success** (`#2f7a4f` / `#5ec98d` dark, soft bg `#e3f2e8` / `#1e3327`): paid, active, confirmed states.
- **Warn** (`#8a6612` / `#e0b45c` dark, soft bg `#f3ead0` / `#3a2f14`): pending, due-soon states.
- **Info** (`#2c568f` / `#6ea6e0` dark, soft bg `#dde8f7` / `#1c2a3d`): informational badges.
- **Danger** (`#b3402c` / `#e0836a` dark, soft bg `#f7e2dc` / `#3a201a`): overdue, destructive actions.

### Named Rules

**The Color Consistency Lock.** The accent is terracotta, everywhere, in both themes. It is never replaced with system blue and never joined by a second accent hue — one accent, one meaning (primary action / active state), used identically across every screen.

**The Honest Glass Rule.** `backdrop-filter` glass tokens (`toolbar-glass`, `sheet-glass`) only apply to elements that sit over genuinely scrolling content: the sticky toolbar, sheets, menus, popovers, toast. The sidebar and in-flow cards stay flat, opaque materials, glass with nothing behind it to blur is a translucency artifact, not glass.

## 3. Typography

**Body Font:** Public Sans (with system sans-serif fallback)
**Label/Mono Font:** IBM Plex Mono (with monospace fallback)

**Character:** A humanist grotesque paired with a technical mono for numbers, money, and fiscal codes, legible at small sizes and never decorative. No display serif, no swapped fonts from the prior iteration: the pairing was already correct, only scale and weight discipline changed.

### Hierarchy

- **Title** (700, 17px, tracking-tight): page/toolbar titles in `PageHeader`. Large-title weight without going extrabold.
- **Section header** (700, 14px / text-sm): grouped-card section labels (Ajustes-style).
- **Body** (400, 13px): default UI text, form values, table cells.
- **Label** (500, 12px): field labels, table column headers (column headers additionally `uppercase tracking-wide text-ink-soft`).
- **Mono** (500, 13px, IBM Plex Mono): money amounts, invoice numbers, NIF/CIF/VAT codes, any fiscal identifier.

### Named Rules

**The Numeric Mono Rule.** Any value that is money, a fiscal code, or an invoice/contract number renders in `font-mono`. Plain prose never does, and numbers never render in the body sans font.

## 4. Elevation

Flat by default. In-flow content (cards, list rows, grouped sections) carries a 1px hairline border and zero shadow. Shadows exist only as a structural signal that something is floating above the content plane: the sticky toolbar, sheets/dialogs, menus/popovers, and toasts. Depth is otherwise conveyed through the glass materials and hairline borders, not through shadow.

### Shadow Vocabulary

- **Float** (`box-shadow: 0 1px 2px rgb(28 36 48 / 0.06), 0 8px 24px rgb(28 36 48 / 0.1)`): sticky toolbar/`PageHeader`, anything pinned above scrolling content.
- **Sheet** (`box-shadow: 0 4px 8px rgb(28 36 48 / 0.08), 0 24px 48px rgb(28 36 48 / 0.18)`): modals, sheets, popovers, the toast banner.

### Named Rules

**The Flat-Card Rule.** `Card` and other in-flow containers are shadow-less by design, border only. A shadow appearing on a card in flow is a bug, not a style choice: reserve shadow for the two floating-layer tokens above.

## 5. Components

Precise and quiet: every control reads as native-feeling and restrained, feedback is present (hover tints, focus rings, a slight press-scale) but never showy.

### Buttons

- **Shape:** `rounded-control` (8px).
- **Primary:** solid accent background, white text, `px-4 py-2`, `font-semibold text-[13px]`, subtle `hover:brightness-105`, press feedback via `active:scale-[0.97]`.
- **Secondary:** surface background with a hairline border, `hover:bg-surface-alt`.
- **Ghost-danger:** transparent, danger-colored text, `hover:bg-danger-soft`, for destructive actions inside menus/rows.
- **Dashed:** transparent with a dashed border in accent text, used for "add new" affordances.
- **Focus:** all variants share `focus-visible:ring-2 ring-focus-ring` (accent-tinted ring, never a default blue outline).

### Badges

- **Style:** `rounded-pill`, `text-xs font-semibold`, soft-tinted background matched to a semantic tone (success/warn/info/danger/neutral), never a solid saturated fill.

### Cards / Containers

- **Corner Style:** `rounded-card` (12px).
- **Background:** surface color, hairline border, no shadow (see Elevation).
- **Border:** always present, 1px, `--color-border`.

### Inputs / Fields

- **Style:** surface background, hairline border, subtle inset top shadow (`inset 0 1px 1px rgb(0,0,0,0.03)`) for a recessed native-field feel, `rounded-control`.
- **Focus:** border shifts to accent plus a 3px accent-tinted glow ring (`--color-focus-ring`), no default browser outline.
- **Error:** border and focus ring shift to danger; helper text renders in danger below the field.
- **Select:** native `<select>` with `appearance-none`, a custom bidirectional Phosphor caret (`CaretUpDown`, 12px, bold) positioned absolutely, matching the rest of the field system rather than the browser's native chevron.

### Navigation (Sidebar)

- **Style:** opaque charcoal panel (`--color-sidebar-bg`), never glass, matching native sidebar convention (Mail, Notes, Settings). Active item indicated by a sliding accent-tinted pill (`layoutId`-based shared-layout animation), not a static highlight.

### Toolbar (PageHeader)

- **Style:** sticky, glass material (`toolbar-glass` + `backdrop-blur-xl backdrop-saturate-150`), hairline bottom border, `shadow-float`. This is one of the few places glass is honest, real content scrolls beneath it.

### Sheets / Menus / Popovers

- **Style:** glass material (`sheet-glass` + blur/saturate), `rounded-sheet` (16px), `shadow-sheet`, spring-based entrance (`stiffness: 380, damping: 32`), fully skipped under reduced-motion.

## 6. Do's and Don'ts

### Do:

- **Do** use the terracotta accent (`#c2632c` / `#e08a4f`) identically for every primary action, active state, focus ring, and selection highlight.
- **Do** keep glass (`backdrop-filter`) restricted to elements over scrolling content: toolbar, sheets, menus, popovers, toast.
- **Do** keep in-flow `Card` and list rows flat: hairline border, zero shadow.
- **Do** render money, fiscal codes, and invoice/contract numbers in `font-mono`.
- **Do** disable/shorten all motion under `prefers-reduced-motion`; every spring has a reduced-motion fallback already wired in.
- **Do** use the fixed radius scale exactly: `rounded-control` (8px) for controls, `rounded-card` (12px) for cards, `rounded-sheet` (16px) for floating layers, `rounded-pill` for badges/switches/segmented controls.

### Don't:

- **Don't** replace the terracotta accent with system blue or introduce a second accent color anywhere.
- **Don't** apply glass/blur to the sidebar or to in-flow cards, nothing scrolls behind them, so it reads as a translucency artifact, not glass.
- **Don't** add a shadow to an in-flow card or list row; shadow is reserved for the two floating-layer tokens (`shadow-float`, `shadow-sheet`).
- **Don't** use bounce/elastic easing anywhere; springs are critically damped and functional, never bouncy or cinematic.
- **Don't** design asymmetric, landing-page-style layouts; this is a grid-predictable productivity tool, not a marketing surface.
- **Don't** add responsive breakpoints or mobile navigation; this ships as a real `.app` window, not a browser tab.
