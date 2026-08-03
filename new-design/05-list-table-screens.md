# 05 — List Screens (Clientes, Facturas, Contratos, Gastos)

Depends on: `00`, `03` (Toolbar), `04` (Menu, Tooltip, Card).

Files: `src/screens/Clientes.tsx`, `Facturas.tsx`, `Contratos.tsx`, `Gastos.tsx`. All four hand-roll the same CSS-grid table pattern independently (confirmed in `Clientes.tsx:42-74`) — treat this spec as one recipe applied four times, not four separate designs.

## Target: macOS list view (Mail message list / Finder list view)

Two changes from the current pattern: (1) a real inline search field in the toolbar instead of no filtering at all, (2) row styling that matches a native list — hover highlight, no zebra striping, a trailing `⋯` menu instead of the whole row just being one giant click target with no secondary actions.

```
┌ Toolbar: "Clientes" · 12 clientes  ⌕ [search........]  [+ Nuevo cliente] ┐
├────────────────────────────────────────────────────────────────────────┤
│ CLIENTE              NIF/CIF      PREFIJO   IVA         IDIOMA      ⋯  │
├────────────────────────────────────────────────────────────────────────┤
│ Marta Ibáñez SL       B12345678    MI        Exento       ES        ⋯  │  ← hover: bg-surface-alt
│ marta@...                                                               │
├────────────────────────────────────────────────────────────────────────┤
│ ...
```

## Row styling

Current row (`Clientes.tsx:51-72`): `border-t border-border`, no hover state, `cursor-pointer` on the whole row, `rounded-md` prefix badge. Change to:

```tsx
<div
  key={c.id}
  onClick={() => onOpenClient(c.id)}
  className="group grid grid-cols-[1.6fr_1fr_.9fr_1fr_1fr_32px] py-3 px-5.5
             border-t border-border items-center cursor-pointer
             transition-colors hover:bg-surface-alt"
>
  {/* existing 5 columns unchanged */}
  <div
    className="opacity-0 group-hover:opacity-100 transition-opacity"
    onClick={(e) => e.stopPropagation()}
  >
    <Menu>
      <MenuTrigger className="p-1.5 rounded-control hover:bg-border cursor-pointer">
        <DotsThreeVertical size={16} weight="bold" />
      </MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={() => onOpenClient(c.id)}>Ver detalle</MenuItem>
        {/* add per-screen relevant actions here, e.g. "Nueva factura" for a client row */}
      </MenuContent>
    </Menu>
  </div>
</div>
```

Row height/padding: `py-3` (down from `py-4`) — macOS list rows are tighter than the current app. Prefix badge (`Clientes.tsx:61-64`, `rounded-md` → `rounded-control` per spec 00's token).

Apply the same `group`/hover/trailing-menu treatment to `Facturas.tsx`, `Contratos.tsx`, `Gastos.tsx` — each screen's menu items differ (invoice rows might get "Marcar pagada"/"Descargar PDF", expense rows might get "Editar"/"Eliminar") but the structural recipe (grid columns unchanged, append one `32px` column, wrap in `group`) is identical across all four.

## Search field in toolbar

None of the four list screens currently support filtering client-side — this is new functionality, but it's presentation-layer (filtering an already-loaded in-memory array), not a change to any DB query or business rule, so it's in-scope for a visual redesign that's allowed to "move things around."

```tsx
import { MagnifyingGlass } from "@phosphor-icons/react";

const [query, setQuery] = useState("");
const filtered = clients.filter((c) =>
  `${c.name} ${c.nifCif} ${c.email}`.toLowerCase().includes(query.toLowerCase()),
);
```

```tsx
<PageHeader
  title={t("clients.title")}
  subtitle={t("clients.subtitleCount", { count: filtered.length })}
  actions={
    <>
      <div className="relative">
        <MagnifyingGlass
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar"
          className="w-52 pl-8 pr-3 py-1.5 text-[13px] rounded-control bg-surface-alt border border-transparent
                     focus:border-accent focus:bg-surface focus:outline-none transition-colors"
        />
      </div>
      <Button onClick={onNewClient}>+ {t("clients.newClient")}</Button>
    </>
  }
/>
```

Use `filtered` instead of `clients` in the render below. Repeat for `Facturas`/`Contratos`/`Gastos` with fields relevant to each (invoice number + client name for Facturas, etc). Skip this for any list that's realistically always short (if `Contratos`/`Gastos` tend to have under ~15 rows for a single freelancer, the search field is optional polish — add it if you want visual consistency across all four toolbars, but it's not load-bearing the way it is for a growing Clientes/Facturas list).

## Column header row

Current (`Clientes.tsx:43-49`): `bg-surface-alt` background block. Keep as-is structurally, just extend the grid template by one `32px` column to match the row change above, and drop the trailing header cell (leave it empty — no "Actions" label needed, matches Section 4.9's logo-wall-style restraint: the icon in each row already communicates its own purpose).

## Loading / empty / error states

Currently plain text (`Clientes.tsx:36-40`: `"Cargando…"`, `"No se pudieron cargar..."`, empty message). Section 4.5 requires real skeletal loaders instead of a bare string. Minimal version, not a new dependency:

```tsx
{loading ? (
  <Card className="overflow-hidden">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="grid grid-cols-[1.6fr_1fr_.9fr_1fr_1fr_32px] py-3 px-5.5 border-t border-border first:border-t-0">
        <div className="h-4 w-32 rounded bg-surface-alt animate-pulse" />
        <div className="h-4 w-20 rounded bg-surface-alt animate-pulse" />
        <div className="h-4 w-12 rounded bg-surface-alt animate-pulse" />
        <div className="h-4 w-16 rounded bg-surface-alt animate-pulse" />
        <div className="h-4 w-10 rounded bg-surface-alt animate-pulse" />
      </div>
    ))}
  </Card>
) : ...}
```

Plain Tailwind `animate-pulse` — no shimmer library needed (ladder: native CSS covers it). Empty state gets an icon + one-line hint instead of bare text, e.g.:

```tsx
<div className="flex flex-col items-center justify-center py-20 text-center gap-3">
  <UsersThree size={32} className="text-ink-soft/40" />
  <div className="text-sm text-ink-soft">{t("clients.empty")}</div>
  <Button variant="secondary" onClick={onNewClient}>
    + {t("clients.newClient")}
  </Button>
</div>
```

## Pre-flight for this file

- [ ] All four list screens (Clientes, Facturas, Contratos, Gastos) get: hover row highlight, trailing `⋯` menu, tightened row padding, `rounded-control` badges.
- [ ] Search field added to each toolbar (or explicitly skipped for short lists, per your judgment).
- [ ] Skeleton loading state replaces bare "Cargando…" text on all four.
- [ ] Empty state gets an icon + CTA instead of bare text on all four.
- [ ] No change to `listClients()`/`listInvoices()`/etc. data-fetching calls or the `onOpenClient`/`onNewClient` callback contracts — verify by checking `App.tsx`'s routing props for each screen still match.
- [ ] Checked in both light and dark mode.
