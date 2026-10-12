# 12 — Motion & Interaction Polish

Depends on: everything else. Do this last — it's a cross-cutting pass over screen transitions and a few details each individual spec already introduced but is worth double-checking in one sweep.

`MOTION_INTENSITY: 4` for this app (per spec 00) — fluid CSS transitions everywhere, real spring physics only in the handful of places already called out (sidebar selection, sheets, toast). No scroll-hijacking, no parallax, no cinematic choreography — this is a productivity tool, motion here means "feels responsive," not "feels like a launch site."

## Screen transitions (App.tsx's state-machine router)

Currently: `screen === "x" && <X/>` (App.tsx, throughout) — an instant unmount/mount with zero transition, confirmed in the file. Two options, pick based on how much you want to touch `App.tsx`:

**Option A (recommended, minimal risk):** leave routing exactly as-is, add a fade+slight-y entrance to each screen's own root div using `motion.div` with `initial`/`animate` (no `AnimatePresence`, no exit animation, no change to when React unmounts the old screen — purely a per-mount entrance):

```tsx
// at the top of each screen's root return, e.g. Clientes.tsx
<motion.div
  initial={{ opacity: 0, y: 4 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
  className="px-8 pb-15"
>
```

This is a one-line wrapper change per screen (16 files), same content, gives every navigation a subtle settle-in instead of a hard cut. Skip this file-by-file if it feels like too much repetition — it's genuinely optional polish, the app is fully "done" per specs 00-11 without it.

**Option B (more native-feeling, more invasive):** wrap the content pane in `AnimatePresence mode="wait"` keyed by `screen` in `App.tsx` itself (around line 144's `<div className="flex-1 overflow-y-auto min-w-0">`), giving true cross-fade transitions between screens including exit animation of the outgoing screen. This changes `App.tsx`'s JSX structure (still zero business-logic change — purely wrapping the existing conditional render tree) but touches the app's central routing file, so treat it as a separate, careful pass, not something to combine with the Option A per-screen edits (they'd double up the animation).

Recommendation: ship Option A. It's the lazy-correct choice — smaller diff, same felt improvement, zero risk to the routing logic. Only reach for Option B if, after living with Option A, the hard content-swap under the sticky toolbar still feels abrupt.

## Reduced motion

Every `motion` usage introduced across specs 02, 04, 07, and this file must degrade under `prefers-reduced-motion`. `motion/react` respects this automatically for most spring/tween animations when you use `useReducedMotion()` and branch, but the simplest correct approach here (small number of motion call sites, none of them decorative-only) is a single global CSS override rather than auditing each component:

```css
/* index.css, add once */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

This catches every CSS `transition`/`animation` in the app (buttons' `active:scale`, hover states, the skeleton `animate-pulse`) in one place. It does **not** catch `motion/react`'s JS-driven animations (sidebar selection pill, Sheet/Toast spring transitions) — for those three specific call sites, wrap with `useReducedMotion()`:

```tsx
import { useReducedMotion } from "motion/react";
const reduce = useReducedMotion();
// then: transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
```

Three call sites total (Sidebar's `layoutId`, Sheet's enter transition, Toast's enter transition) — apply this pattern to each, per spec 02/04's code.

## Tactile feedback audit

Spec 04's `Button` already gets `active:scale-[0.97]` for free. Sweep for anything else the redesign made clickable that doesn't inherit from `Button`:

- List rows (spec 05, 06, 09) — add `active:bg-surface-alt` isn't necessary since click immediately navigates away, but a quick `active:scale-[0.995]` on the row itself is a nice-to-have, not required (the navigation itself is the feedback).
- `Menu`/`MenuItem` (spec 04) — Radix's `data-[highlighted]` state already covers hover/keyboard-focus feedback, no extra work needed.
- `SegmentedControl` segments (spec 04) — already covered via the `shadow`-based active-segment styling.

## Pre-flight for this file

- [ ] Screen entrance animation applied (Option A) or explicitly skipped as acceptable polish debt.
- [ ] Global `prefers-reduced-motion` CSS override added to `index.css`.
- [ ] The three `motion/react` call sites (Sidebar selection, Sheet, Toast) wrapped with `useReducedMotion()` branching.
- [ ] Full app click-through in both light and dark mode, reduced-motion on and off, to confirm nothing animates when it shouldn't and everything that should animate does ("motion claimed, motion shown" — Section 5).
