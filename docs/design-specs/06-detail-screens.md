# 06 — Detail Screens (ClienteDetalle, ContratoDetalle, GastoDetalle)

Depends on: `00`, `03` (Toolbar/BackLink), `04` (Card, Badge, Menu).

Files: `src/screens/ClienteDetalle.tsx`, `ContratoDetalle.tsx`, `GastoDetalle.tsx`. These are the simpler detail views — one record, a handful of grouped fields, maybe a sub-list (ClienteDetalle shows the client's contracts). `FacturaDetalle.tsx` is the richest detail screen in the app and gets its own file, `07-invoice-detail.md` — don't apply this spec to it.

## Target: macOS "info pane" (Contacts card / Finder Get Info panel)

These three screens currently follow the same shape as Ajustes: a `BackLink`, a title, one or more `Card`s with `Label`/value pairs. That shape is already close to native — the fix here is about information density and grouping discipline, not a structural rebuild.

```
← Clientes

Marta Ibáñez SL                                    [Editar]  [⋯]
B12345678 · marta@ejemplo.com

┌ Datos fiscales ──────────────────────────────────┐
│ NIF/CIF          B12345678                        │
│ Dirección        Calle Mayor 4, Madrid             │
│ Trato de IVA     Exento                            │
│ Idioma factura   Español                           │
└────────────────────────────────────────────────────┘

┌ Contratos (3) ─────────────────────── [+ Nuevo] ──┐
│ Consultoría Q1        activo         01/01–31/03   │
│ Soporte anual         activo         01/04–...     │
└──────────────────────────────────────────────────────┘
```

## Header block

Use `PageHeader`'s `title`/`subtitle`/`actions` slots (spec 03) instead of hand-rolling a header — `title` = record's primary label (client name / contract title / expense description), `subtitle` = the secondary identifying line (NIF+email / date range / category+amount), `actions` = primary edit button + a `Menu` (spec 04) for secondary actions (delete, duplicate, etc — whatever each screen currently exposes as separate buttons). `BackLink` goes above the `PageHeader`, unchanged in position, restyled per spec 03.

If a screen currently renders more than one destructive/secondary action as separate visible buttons (delete, etc.), collapse them into the `⋯` `Menu` — keep only the single most common action (typically "Editar") as a visible button, per Section 4.5's general bias toward decluttering repeated primary actions. Do not hide **Editar** itself behind the menu — it's the primary action for a detail view and should stay one click away.

## Grouped info sections

Replace any hand-built `Label`/value row (whatever grid or flex pattern each screen currently uses — check the file before editing, don't assume a specific class string exists) with a consistent macOS System-Settings-style grouped list: a `Card` (now `rounded-card` per spec 00) containing a small caps section header + rows separated by a single hairline, label left / value right:

```tsx
function InfoRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-t border-border first:border-t-0">
      <span className="text-[13px] text-ink-soft">{label}</span>
      <span className={`text-[13px] font-medium text-right ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

<Card className="px-5 py-1">
  <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide pt-4 pb-2">
    Datos fiscales
  </div>
  <InfoRow label="NIF/CIF" value={client.nifCif} mono />
  <InfoRow label="Dirección" value={client.address} />
  <InfoRow label="Trato de IVA" value={t(`clients.vatTreatment.${client.vatTreatment}`)} />
</Card>;
```

This is the **one row pattern to reuse across all three detail screens** — define `InfoRow` once (a small shared component, e.g. `src/components/ui/InfoRow.tsx`) rather than copy-pasting it into each screen file. This directly satisfies Section 4.9's "no `border-t` on every row" concern by using `first:border-t-0` (only interior rows get a divider, not the whole block boxed in) and Section 4.4's Shape Consistency Lock (one `Card`/radius system, reused).

## Sub-lists (ClienteDetalle's contract list)

Reuse the exact row recipe from spec 05 (hover highlight, trailing `Menu`) at a smaller scale — this is functionally a mini list-screen embedded in a detail screen, so it should look like one, not like a third distinct pattern. Section header gets its own small "+" action per spec 04/05's action-button conventions (`+ Nuevo contrato` as a `Button variant="secondary"` in the section's own header row, not the page-level toolbar).

## Status badges

Wherever a status enum renders today (contract `active`/`expired`/`terminated`, etc.) via the existing `Badge` component — no change needed beyond spec 04's radius-token swap, which `Badge` already picks up automatically since it's a shared component.

## Pre-flight for this file

- [ ] All three screens use `PageHeader` (title/subtitle/actions) instead of a hand-rolled header block.
- [ ] Secondary actions collapsed into a `Menu`, with "Editar" (or equivalent) staying as a visible primary button.
- [ ] Shared `InfoRow` component created and used by all three (not copy-pasted three times).
- [ ] ClienteDetalle's contract sub-list restyled to match spec 05's row recipe at a smaller scale.
- [ ] No change to `onBack`/`onEditClient`/`onDeleted`/`onOpenContract`/`onNewContract` callback props or the `clientId`/`contractId`/`expenseId` prop contracts — cross-check against `App.tsx`'s routing block for each.
- [ ] Checked in both light and dark mode.
