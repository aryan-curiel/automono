# 08 — Forms (ClienteForm, ContratoForm, GastoForm, FacturaNueva, FacturaRectificar)

Depends on: `00`, `03`, `04` (Field, Button, Card).

Files: `src/screens/ClienteForm.tsx`, `ContratoForm.tsx`, `GastoForm.tsx`, `FacturaNueva.tsx`, `FacturaRectificar.tsx`. All five follow the same shape confirmed in `GastoForm.tsx`: `BackLink` → raw `<h1>` → one `Card` with `grid grid-cols-N` field groups → save/cancel button row. `FacturaNueva`'s line-item editor is the one structurally different piece, called out separately below.

## Target: macOS System-Settings-style form

The current pattern is already close — grouped fields in a bordered card is the right shape. Three concrete changes:

### 1. Use `PageHeader` instead of raw `<h1>`

Every form currently hand-rolls its title (e.g. `GastoForm.tsx:180-182`: `<h1 className="font-extrabold text-2xl ...">`). Replace with `PageHeader` (spec 03) for the sticky-glass-toolbar + consistent sizing, same as every other screen:

```tsx
<BackLink label={t("expenses.title")} onClick={onCancel} />
<PageHeader title={mode === "create" ? t("expenses.newExpense") : t("expenses.editExpense")} />
```

### 2. Field groups: label-left / control-right, not label-above

Current pattern stacks `Label` above `TextInput` inside a 2-3 column grid (`GastoForm.tsx:185-255`). This is a defensible web-form pattern, but macOS System Settings uses **label-left, control-right, single column, hairline between rows** — it reads more like the native macOS forms this redesign is chasing, and it's a better fit once the app window has enough width (already `minWidth: 960` per spec 01). Restructure using a shared `FormRow`:

```tsx
// src/components/ui/FormRow.tsx
export function FormRow({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3 border-t border-border first:border-t-0">
      <label className="text-[13px] text-ink-soft pt-2 w-40 shrink-0">{label}</label>
      <div className="flex-1 max-w-80">
        {children}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </div>
  );
}
```

```tsx
<Card className="px-5 max-w-[560px]">
  <FormRow label={t("expenses.fields.date")} error={errors.date}>
    <TextInput type="date" value={form.date} error={!!errors.date} onChange={(e) => set("date", e.target.value)} />
  </FormRow>
  <FormRow label={t("expenses.fields.category")}>
    <TextInput list="expense-categories" value={form.category} onChange={(e) => set("category", e.target.value)} />
  </FormRow>
  <FormRow label={t("expenses.fields.description")}>
    <TextArea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
  </FormRow>
  <FormRow label={t("expenses.fields.amount")} error={errors.amount}>
    <TextInput type="number" step="0.01" mono value={form.amount} error={!!errors.amount} onChange={(e) => set("amount", e.target.value)} />
  </FormRow>
  <FormRow label={t("expenses.fields.ivaAmount")}>
    <TextInput type="number" step="0.01" mono value={form.ivaAmount} onChange={(e) => set("ivaAmount", e.target.value)} />
  </FormRow>
  <FormRow label={t("expenses.fields.deductiblePct")}>
    <TextInput type="number" step="1" min="0" max="100" mono value={form.deductiblePct} onChange={(e) => set("deductiblePct", e.target.value)} />
  </FormRow>
  <FormRow label={t("expenses.fields.file")}>
    <div className="flex items-center gap-2.5">
      <Button variant="secondary" onClick={handleAttachFile} disabled={attaching}>
        {attaching ? t("expenses.actions.attaching") : t("expenses.actions.attachFile")}
      </Button>
      {form.receiptFilePath && <span className="text-[13px] text-ink-soft truncate">{fileNameOf(form.receiptFilePath)}</span>}
    </div>
  </FormRow>
</Card>
```

`FormRow` is a new shared component (`src/components/ui/FormRow.tsx`) — build it once here, reuse across all five form screens. Every field's `value`/`onChange`/validation logic is untouched, this is purely a layout wrapper swap around existing `TextInput`/`Select`/`TextArea` calls.

**Judgment call, apply per-screen:** where two fields are logically paired and short (e.g. Ajustes' NIF + Número de IVA side-by-side, `ClienteForm`'s likely name+country pairing), it's fine to keep a 2-up grid *inside* a single `FormRow`'s right-hand column rather than forcing every field onto its own full-width row — don't mechanically split every existing 2-column grid pair into two rows if that hurts a genuinely related pair. Use judgment per field group, the single-column form-row is the default, not an absolute rule.

### 3. Save/cancel row

Keep `Button onClick={handleSubmit}` + `Button variant="secondary" onClick={onCancel}` — no structural change, just move it outside the `Card` (macOS forms typically put primary actions below the grouped card, not inside it as the last row) and align right:

```tsx
{saveError && <ErrorText>{saveError}</ErrorText>}
<div className="flex gap-2.5 justify-end mt-5">
  <Button variant="secondary" onClick={onCancel} disabled={saving}>{t("expenses.actions.cancel")}</Button>
  <Button onClick={handleSubmit} disabled={saving}>{t("expenses.actions.save")}</Button>
</div>
```

Note the order flip (Cancelar now first/left, Guardar last/right) — matches macOS's own dialog button convention (default/primary action is the rightmost, and visually emphasized by being solid vs. bordered). Apply consistently across all five forms and the two Ajustes save buttons (spec 11).

## `FacturaNueva.tsx` line-item editor

Not read in full for this pass — when executing this spec, open the file and locate the line-items array editor (add/remove row UI). Apply the same `FormRow` treatment to the invoice-level fields (client picker, dates, VAT rate) above the line items, but leave the line-item repeater as its own mini-table using spec 05's row recipe (hover, not `FormRow` — it's a list of structurally-identical rows, not a set of distinct labeled fields, so the list pattern fits better than the label-left form pattern here).

## `FacturaRectificar.tsx`

Described as "form/wizard-like" in the initial map — apply the same `FormRow` treatment to whatever discrete fields it collects (rectification type, reason), and if it has a multi-step feel, consider `SegmentedControl` (spec 04) for the full/partial rectification-type toggle instead of two separate buttons, since that's exactly a 2-way exclusive choice.

## Pre-flight for this file

- [ ] All five forms use `PageHeader` instead of a raw `<h1>`.
- [ ] Shared `FormRow` component created, used by all five (paired-field exceptions applied by judgment, not mechanically).
- [ ] Save/cancel button row moved below the `Card`, right-aligned, Cancelar-then-Guardar order.
- [ ] `FacturaNueva`'s line-item repeater keeps a list-row pattern (spec 05 style), not `FormRow`.
- [ ] No change to any `onSaved`/`onCancel`/`mode`/`*Id` prop contracts — cross-check `App.tsx`'s routing block for all five.
- [ ] Checked in both light and dark mode.
