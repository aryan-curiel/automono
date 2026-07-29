# 09 — Dashboard

Depends on: `00`, `03`, `04` (Card, Badge).

File: `src/screens/Dashboard.tsx`. Already a reasonable "KPI grid + two list cards" shape (lines 75-128) — this spec is lighter than most since the structure doesn't need to change, just the surface treatment, matching macOS's "Today"/widget-gallery visual language.

## KPI tiles → macOS widget style

Current (lines 76-81): 4 identical flat `Card`s, `font-bold text-2xl font-mono`. Section 9.C bans "3-4 identical cards in a row" as a generic pattern when nothing distinguishes them — here the fix isn't restructuring the grid (4 KPIs is the right shape for this data), it's giving each tile a subtle identity so they don't read as one templated row:

```tsx
const kpis = [
  { label: "Facturado", value: formatEUR(totalFacturado), icon: TrendUp, tone: "neutral" },
  { label: "Pendiente de cobro", value: formatEUR(pendiente), icon: Clock, tone: "warn" },
  { label: "Clientes activos", value: String(clientCount), icon: UsersThree, tone: "neutral" },
  { label: "Gastos (mes)", value: formatEUR(expensesThisMonth), icon: Wallet, tone: "neutral" },
];
```

```tsx
<div className="grid grid-cols-4 gap-3.5 mb-6">
  {kpis.map((kpi) => (
    <Card key={kpi.label} className="py-4 px-4.5 relative overflow-hidden">
      <kpi.icon
        size={16}
        weight="bold"
        className={kpi.tone === "warn" ? "text-warn mb-2.5" : "text-ink-soft mb-2.5"}
      />
      <div className="font-medium text-xs text-ink-soft mb-1">{kpi.label}</div>
      <div className="font-bold text-[22px] font-mono tracking-tight">{kpi.value}</div>
    </Card>
  ))}
</div>
```

The icon-per-tile is the "at least 2-3 cells need real visual variation" fix from Section 4.9's Bento Background Diversity rule, applied at a small scale appropriate to `DENSITY 6` — not a big illustrated background, just enough per-tile identity that four numbers don't look like a copy-pasted template. Keep `warn`-toned "Pendiente de cobro" the one tile that visually flags attention (icon in `text-warn`), same signal the original code intended with its unused `warn: true` flag (current code computes `kpi.warn` but line 78-79 never actually reads it — this fix makes that intent real).

## Recent invoices / upcoming due cards

Structure (lines 84-127) is fine as-is — two side-by-side cards, list rows inside. Apply spec 05's row hover treatment to the recent-invoices rows (they're already clickable via `onOpenInvoice`, lines 90-93) for consistency with every other list in the app:

```tsx
<div
  key={inv.id}
  onClick={() => onOpenInvoice(inv.id)}
  className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-control border-b border-border last:border-b-0
             cursor-pointer transition-colors hover:bg-surface-alt"
>
```

`px-2 -mx-2` gives the hover highlight a touch of horizontal breathing room without changing the card's own padding. "Próximos vencimientos" rows (lines 116-126) aren't currently clickable — leave as-is unless you want to wire `onOpenInvoice` there too (structurally trivial, same `inv.id`, but that's a UX scope decision, not a required part of this visual pass — flag it, don't silently add new navigation behavior).

## Toolbar actions

Update `PageHeader`'s three action buttons (lines 62-71) — no visual change needed beyond what spec 03/04 already give `PageHeader`/`Button` automatically. Consider demoting "+ Cliente" and "+ Gasto" to icon+label `variant="secondary"` (already are) and keeping only "+ Nueva factura" as the sole `primary`-tinted button, since three same-weight action buttons in one toolbar dilutes which one is actually primary — this already matches the current code (only the third button lacks `variant="secondary"`), so no change needed here, just confirming the existing hierarchy is correct and should be preserved.

## Pre-flight for this file

- [ ] KPI tiles get per-tile icons; the existing-but-unused `warn` flag now actually drives a visual difference on the "Pendiente de cobro" tile.
- [ ] Recent-invoices rows get hover highlight matching spec 05's list pattern.
- [ ] No change to `invoices`/`onNavigate`/`onOpenInvoice` prop contract or any data-fetching (`listClients`, `listExpenses`) call.
- [ ] Checked in both light and dark mode.
