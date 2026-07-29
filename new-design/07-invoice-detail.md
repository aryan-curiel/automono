# 07 — Invoice Detail (FacturaDetalle)

Depends on: `00`, `03`, `04` (Sheet, Menu, Badge).

File: `src/screens/FacturaDetalle.tsx` (388 lines — the richest screen in the app: app-chrome header, a mark-paid confirmation, rectification banners, a breakdown card, and a full client-facing PDF preview rendered inline). Treat the **PDF preview block separately from the app chrome around it** — they have different design goals.

## Two zones, two rules

1. **App chrome** (BackLink, title, status badge, action buttons, breakdown card, mark-paid confirmation, rectification banners) — this is *your* UI, redesign it fully per the rest of this spec file.
2. **PDF preview** (lines 265-384, the `bg-[#fdfdfc] ... shadow-[0_4px_24px_...]` block) — this is a **client-facing legal document preview** that must visually match what `pdf.rs` actually generates. Do not apply glass/blur/macOS styling to it. The only change here: keep it exactly as-is, just confirm its surrounding frame (the drop shadow simulating a physical page) still reads correctly against the new page background — bump the shadow to the `shadow-sheet` token from spec 00 for consistency, nothing else.

## App chrome header

Replace the hand-rolled header (lines 134-191) with `PageHeader` (spec 03), moving the status `Badge` into the title row via a `title` that's actually a `ReactNode`... but `PageHeader`'s `title` prop is typed `string` (PageHeader.tsx:5). Two options:
- **(a)** extend `PageHeaderProps.title` to `ReactNode` in spec 03's rewrite (harmless widening, no existing call site passes anything but a string today) — do this, it's the cleaner fix and only needs a one-line type change in `PageHeader.tsx`.
- Then: `title={<>{invoiceNumberLabel(invoice)} <Badge tone={meta.tone}>{meta.label}</Badge></>}`, `subtitle={`${invoice.clientName} · emitida ${formatDate(invoice.issueDate)}`}`.

## Action buttons → collapse into primary + Menu

Current: up to 3 separate buttons plus a hand-rolled split-button-with-dropdown (lines 146-190, its own `useRef`/`useEffect` click-outside handler for `downloadMenuOpen`). This entire manual dropdown implementation is exactly what Radix `DropdownMenu` (spec 04's `Menu`) replaces — delete the `downloadMenuRef`/`useEffect`/`downloadMenuOpen` state entirely.

```tsx
<div className="flex items-center gap-2 shrink-0">
  {canRectify && (
    <Button variant="secondary" onClick={onStartRectification}>Crear rectificativa</Button>
  )}
  {canMarkPaid && (
    <Button variant="secondary" onClick={onOpenMarkPaid}>Marcar como pagada</Button>
  )}
  {invoice.status !== "draft" && (
    <Menu>
      <div className="flex">
        <Button onClick={() => onDownloadPdf(false)} disabled={generatingPdf} className="rounded-r-none">
          {generatingPdf ? "Generando…" : "Descargar PDF"}
        </Button>
        <MenuTrigger asChild>
          <Button disabled={generatingPdf} className="rounded-l-none border-l border-l-white/25 !px-2.5" aria-label="Más opciones de descarga">
            <CaretDown size={12} weight="bold" />
          </Button>
        </MenuTrigger>
      </div>
      <MenuContent>
        <MenuItem onSelect={() => onDownloadPdf(true)} disabled={generatingPdf}>
          Generar y descargar
        </MenuItem>
      </MenuContent>
    </Menu>
  )}
</div>
```

`▾` glyph → `CaretDown` (Phosphor). This is a direct behavior-preserving swap: same two actions, same split-button shape, now with correct focus trapping/keyboard/outside-click handling for free instead of hand-rolled.

## Mark-paid confirmation → Sheet

Current (lines 193-206): an inline `Card` that appears in the page flow when `markingPaid` is true. Replace with spec 04's `Sheet` — this is exactly the confirm-a-destructive/important-action case `Sheet` exists for, and it stops the confirmation from pushing the rest of the page content down:

```tsx
<Sheet open={markingPaid} onOpenChange={(open) => !open && onCancelMarkPaid()} title="Marcar factura como pagada">
  <p className="text-[13px] text-ink-soft mb-4">¿Confirmas que esta factura ha sido pagada?</p>
  <div className="flex gap-2.5 justify-end">
    <Button variant="secondary" onClick={onCancelMarkPaid}>Cancelar</Button>
    <Button onClick={onConfirmMarkPaid}>Confirmar pago</Button>
  </div>
</Sheet>
```

No prop changes needed — `markingPaid`/`onOpenMarkPaid`/`onCancelMarkPaid`/`onConfirmMarkPaid` all keep their exact current meaning and call sites in `App.tsx` (lines 216-221).

## Rectification banners

Lines 208-220: two `bg-danger-soft`/`bg-surface-alt` inline banners. Restyle only (radius token, tighten padding) — these are informational, not interactive, no structural change needed:

```tsx
<div className="flex items-start gap-2.5 bg-danger-soft text-danger rounded-card py-3 px-4 font-medium text-[13px] mb-5">
  <Warning size={16} weight="fill" className="shrink-0 mt-0.5" />
  <span>Rectifica a <b>{...}</b> — {...}. Motivo: {invoice.rectificationReason}</span>
</div>
```

Same treatment for the `rectifiedBy` banner (swap icon to `Info`).

## Breakdown card (left column, lines 222-263)

Restyle only — radius token, tighten line spacing slightly (`py-2` → `py-1.5` on line items) to match the tighter density elsewhere in this redesign. Structure stays identical (this card's grouped totals layout is already close to a native "receipt" look).

## Pre-flight for this file

- [ ] `PageHeader.title` type widened to `ReactNode` (spec 03 amendment).
- [ ] Header rewritten using `PageHeader`, status badge inline with title.
- [ ] Hand-rolled download-menu state/ref/effect deleted, replaced with `Menu` from spec 04.
- [ ] Mark-paid confirmation moved from inline `Card` to `Sheet`.
- [ ] Rectification banners restyled (radius + icon), no structural change.
- [ ] **PDF preview block (lines 265-384) untouched except the drop-shadow token** — verify pixel output still matches `pdf.rs`'s actual generated PDF (this is the one part of the whole redesign where visual drift from the backend output is a real bug, not a style choice).
- [ ] Checked in both light and dark mode (note: the PDF preview block is intentionally light-only/paper-colored in both — that's correct, don't dark-mode it, real paper doesn't invert).
