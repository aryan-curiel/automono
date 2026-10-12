# 03 — Content Toolbar (replaces PageHeader)

Depends on: `00-design-foundations.md`, `01-window-chrome-and-titlebar.md`.

File: `src/components/PageHeader.tsx`, plus every screen that renders `<PageHeader>` (all 16 screens import it — grep `PageHeader` before editing to get the full call-site list).

## Why PageHeader needs to become a Toolbar

Today `PageHeader` (PageHeader.tsx:9-19) renders an in-flow `<h1>` + actions row at the top of a scrolling page — it scrolls away with the content. Every macOS app (Finder, Mail, Settings) instead has a **sticky toolbar** that stays pinned to the top, gets a frosted-glass background once content scrolls beneath it, and hosts the title, search, and primary actions in one bar. This is also the row that becomes the window's drag region now that the title bar is overlaid (spec 01).

## New component: `Toolbar`

Replace `PageHeader`/`BackLink` in `src/components/PageHeader.tsx` (keep the file name and both export names — every screen's import stays `import { PageHeader, BackLink } from "../components/PageHeader"` so this is a drop-in internal rewrite, zero call-site changes required beyond passing the same props):

```tsx
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div
      data-tauri-drag-region
      className="sticky top-0 z-20 flex items-center justify-between gap-4 h-16 px-8 -mx-8 mb-6
                 bg-toolbar-glass backdrop-blur-xl backdrop-saturate-150
                 border-b border-glass-border-soft
                 supports-[not(backdrop-filter)]:bg-bg"
    >
      <div className="min-w-0">
        <h1 className="font-bold text-[17px] tracking-tight m-0 truncate">{title}</h1>
        {subtitle && <div className="text-[12px] text-ink-soft truncate">{subtitle}</div>}
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 font-medium text-[13px] text-accent cursor-pointer mb-3.5 bg-transparent border-none p-0"
    >
      <CaretLeft size={14} weight="bold" />
      {label}
    </button>
  );
}
```

(`CaretLeft` from `@phosphor-icons/react` — replaces the literal `&larr;` glyph.)

Notes on the recipe:

- `sticky top-0 z-20` pins it while the screen's own container scrolls underneath.
- `-mx-8` cancels the screen container's `px-10`/`px-8` padding so the glass bar spans full-bleed edge-to-edge (macOS toolbars always touch both window edges) — **check each screen's actual container padding before copying this value**, some use `px-10` (see spec 05/06/08 for per-screen container changes).
- `backdrop-blur-xl backdrop-saturate-150` is the glass approximation from spec 00 — this is the one place in the whole app where it's justified, because real content scrolls underneath it.
- `supports-[not(backdrop-filter)]:bg-bg` is the solid-fill fallback for browsers/contexts without `backdrop-filter` support (Section 4.11/Appendix C requirement). Tauri's webview (WKWebView on macOS) supports it, but keep the fallback — it's one utility class, not a maintenance burden.
- `data-tauri-drag-region` — since the title bar is now overlaid (spec 01), this toolbar is the natural drag handle for the content side of the window (mirroring the sidebar's drag spacer). Only add this to the _empty_ background of the bar — Tailwind's `data-tauri-drag-region` on the outer div is fine since the title/actions are separate child elements the OS won't intercept clicks on incorrectly (Tauri only treats mousedown on the exact drag-region element as drag-start, children remain clickable).
- Title size dropped from `text-2xl font-extrabold` to `text-[17px] font-bold` — matches spec 00's typography note and macOS's actual toolbar title size (much smaller than a web "page hero" title; the content itself carries visual weight, not the header).

## Ajustes.tsx doesn't use PageHeader today

`Ajustes.tsx:205` hand-rolls its own `<h1>` instead of using `PageHeader`. Fix this as part of this spec: replace lines 204-205's raw div/h1 with `<PageHeader title="Ajustes" />` so it picks up the sticky glass toolbar like every other screen. This is a one-line change and removes a visual inconsistency that already exists today, independent of the redesign.

## Screen container padding

Every screen currently opens with `<div className="px-10 pt-8 pb-15">` (confirmed in `Clientes.tsx:28`, `Ajustes.tsx:204`, same pattern elsewhere). Once the toolbar is sticky and full-bleed, change the top padding since the toolbar itself now supplies the visual top margin — drop `pt-8` and let the toolbar's own `h-16` + `mb-6` do that job:

```tsx
<div className="px-8 pb-15">
  <PageHeader ... />
  {/* content */}
</div>
```

Apply this container change screen-by-screen as each screen's own spec file (05/06/07/08/09/10/11) is executed — don't do a blanket sweep here, keep this file's scope to the `Toolbar`/`PageHeader` component itself plus the Ajustes fix above.

## Pre-flight for this file

- [ ] `PageHeader` internals rewritten to sticky glass toolbar; export names/props unchanged so no call-site edits needed elsewhere yet.
- [ ] `BackLink` uses `CaretLeft` icon instead of `&larr;`.
- [ ] `Ajustes.tsx` switched to use `<PageHeader>` instead of its own `<h1>`.
- [ ] Verify on one screen (e.g. Clientes) that the toolbar sticks on scroll and blurs content beneath it.
- [ ] Verify traffic lights (spec 01) don't overlap the toolbar's title text at the top of the window.
- [ ] Checked in both light and dark mode.
