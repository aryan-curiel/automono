# 10 — Resumen Trimestral (Quarterly Tax Summary)

Depends on: `00`, `03`, `04` (SegmentedControl, Card), `02` (PeriodSelector lives alongside this screen).

Files: `src/screens/ResumenTrimestral.tsx`, `src/components/PeriodSelector.tsx`.

## `PeriodSelector` kind-picker → `SegmentedControl`

Current (`PeriodSelector.tsx:32-43`): a `<Select>` dropdown for choosing month/quarter/year, defaulting via the `defaultKind` prop. This is a 3-way, always-visible, mutually-exclusive choice — the textbook case for `SegmentedControl` (spec 04) instead of a dropdown, and it's also more macOS-native (Calendar.app's day/week/month/year picker is exactly this control).

```tsx
import { SegmentedControl } from "./ui/SegmentedControl";

<div className="flex items-center gap-3">
  <SegmentedControl
    value={kind}
    onChange={(next: Kind) => {
      setKind(next);
      onChange(computePeriod(next, year, month, quarter));
    }}
    options={[
      { value: "month", label: "Mes" },
      { value: "quarter", label: "Trimestre" },
      { value: "year", label: "Año" },
    ]}
  />
  {/* existing conditional month/quarter+year/year TextInput blocks, unchanged */}
</div>;
```

Only the `kind` selector changes — the conditional `TextInput type="month"` / quarter-`Select`+year-`TextInput` / year-`TextInput` blocks (lines 45-96) keep their exact current logic, just restyled automatically via spec 04's `Field.tsx` update (no edits needed there beyond what spec 04 already covers).

The quarter number picker (lines 60-73, currently a `<Select>` with Q1-Q4) is a 4-way exclusive choice too — optionally also convert to `SegmentedControl` for consistency, but a `Select` is defensible here too (4 options with a numeric/positional meaning reads fine as a dropdown). Judgment call, not required.

## Screen layout

Not read in full for this pass (flagged as "incomplete — needs period filtering and CSV export" in prior work, per project memory) — when executing this spec, open `ResumenTrimestral.tsx` and apply the established patterns from the rest of this redesign:

- `PageHeader` for the title, with the `PeriodSelector` living in the toolbar's `actions` slot (it's a control that changes what the whole page displays — toolbar is the right home for it, same as a Finder view's sort/filter controls).
- Report figures (total invoiced by IVA rate, deductible expenses, net IRPF-relevant income) as KPI-tile cards, same visual recipe as spec 09's Dashboard tiles — this screen is functionally "Dashboard, but filtered to a period," so it should look like a sibling of Dashboard, not a distinct design.
- CSV export action: a `Button variant="secondary"` in the toolbar, icon (`Export` or `DownloadSimple` from Phosphor) + label, next to or near the `PeriodSelector`.
- Underlying-rows table (if the screen renders one for the export data): use spec 05's list-row recipe.

## Pre-flight for this file

- [ ] `PeriodSelector`'s kind-picker converted to `SegmentedControl`.
- [ ] Report figures restyled as KPI tiles matching Dashboard's visual language (spec 09).
- [ ] Toolbar hosts `PeriodSelector` + CSV export button via `PageHeader`'s `actions` slot.
- [ ] No change to `computePeriod`/`monthRange`/`quarterRange`/`yearRange`/CSV export logic — this spec is presentation-only.
- [ ] Checked in both light and dark mode.
