# 01 — Window Chrome & Title Bar

Depends on: `00-design-foundations.md`.

## Why this matters most for "feels native"

Right now the app runs in a plain OS-default title bar (`src-tauri/tauri.conf.json` sets only `title`/`width`/`height` — no `titleBarStyle`, no `decorations` override). Every native macOS app that wants the modern look (Mail, Notes, Settings, Music) uses an **overlay title bar**: traffic lights float over the sidebar, no separate gray title strip, content starts at true y=0. This single change does more for "looks like a real Mac app" than any component restyle.

This touches `src-tauri/tauri.conf.json` only — window chrome configuration, not business logic, not the Rust command layer. Safe to change per the brief.

## Change 1 (required): overlay title bar

`src-tauri/tauri.conf.json`, inside `app.windows[0]`:

```jsonc
{
  "title": "AutoMono",
  "width": 1280,
  "height": 800,
  "minWidth": 960,
  "minHeight": 600,
  "titleBarStyle": "Overlay", // macOS only — traffic lights overlay content, no title strip
  "hiddenTitle": true, // macOS only — don't show the window title text next to traffic lights
}
```

`minWidth`/`minHeight` are new too — the app currently has no floor, so the sidebar + table grids can break at very small window sizes. 960×600 keeps the 230px sidebar plus a usable content pane.

`titleBarStyle: "Overlay"` and `hiddenTitle` are no-ops on Windows/Linux (Tauri ignores them there), so this is safe cross-platform — Windows/Linux keep their native decorated title bar automatically, no extra config needed.

## Change 2 (required): reserve space for the traffic lights + make top bar draggable

With `Overlay`, the OS still draws the three traffic-light buttons in the top-left, but _your_ content now extends underneath them — you must inset your own layout so nothing sits behind the buttons, and mark a drag region so the window can still be moved.

In `src/components/Sidebar.tsx`, the top logo row (currently `pt-1.5 pb-5.5`, line 61) needs its top padding increased to clear the traffic lights (~28px tall, macOS convention is ~52px total top inset including the buttons' vertical centering) and a `data-tauri-drag-region` attribute so the empty space above the logo remains window-draggable:

```tsx
<div data-tauri-drag-region className="h-13 shrink-0" />
<div className="flex items-center gap-2.5 px-2.5 pb-5.5">
  {/* existing logo row, pt- removed since the drag spacer above replaces it */}
</div>
```

`h-13` (52px) matches the standard macOS traffic-light vertical center. Adjust by eye once running — this is the one value in the whole redesign worth pixel-checking against a real macOS app (Notes.app is a good reference, same overlay-sidebar shape).

The main content pane (spec 03's toolbar) also needs top clearance since it has no sidebar-style logo row to absorb the inset — the sticky toolbar itself becomes the drag region instead (covered in spec 03).

## Change 3 (optional, follow-up, not required to ship this redesign): real native vibrancy

`window-vibrancy` (Rust crate) applies a true `NSVisualEffectView` material to the window background, blurring whatever is behind the _entire window_ (desktop, other apps) — not just scrolling content like the CSS approximation in spec 00. This is the most authentic possible version of "liquid glass" but is a genuine native/Rust change:

```toml
# src-tauri/Cargo.toml — only if pursuing this optional step
[target.'cfg(target_os = "macos")'.dependencies]
window-vibrancy = "0.6"
```

```rust
// src-tauri/src/lib.rs, in the setup() closure, macOS-only
#[cfg(target_os = "macos")]
{
    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
    let window = app.get_webview_window("main").unwrap();
    apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None)
        .expect("vibrancy requires macOS 10.14+");
}
```

Leave this for a later pass. The CSS approximation from spec 00/02/04 gets visually close without touching the Rust build at all — do that first, revisit native vibrancy only if the CSS version still looks flat once the whole redesign is running.

## Pre-flight for this file

- [ ] `titleBarStyle: "Overlay"`, `hiddenTitle: true`, `minWidth`/`minHeight` added to `tauri.conf.json`.
- [ ] Sidebar top inset + `data-tauri-drag-region` spacer added so traffic lights don't overlap the logo.
- [ ] App still launches and is draggable/resizable/closable on macOS (`bun run tauri dev`).
- [ ] Windows/Linux build unaffected (these keys are macOS-only, verify no config error on other platforms if you have a way to check).
