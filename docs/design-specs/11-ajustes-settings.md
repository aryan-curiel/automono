# 11 — Ajustes (Settings)

Depends on: `00`, `03`, `04` (Card, Field, Button, Sheet), `08` (FormRow).

File: `src/screens/Ajustes.tsx` (408 lines, largest screen — 4 stacked `Card`s: Datos del negocio, Datos bancarios, Copia de seguridad, DB healthcheck).

This screen is already the closest thing in the app to macOS System Settings' actual layout (grouped cards, each with its own heading) — the redesign here is about applying the tokens/patterns from specs 00/03/04/08 consistently, not restructuring.

## Header

Line 205: raw `<h1 className="font-extrabold text-2xl ...">Ajustes</h1>`. Replace with `<PageHeader title="Ajustes" />` (spec 03) — this was already flagged as a pre-existing inconsistency in spec 03, do it here if not already done.

## Each `Card` section → `FormRow` pattern

Apply spec 08's `FormRow` component to every field in all three form-bearing cards (Datos del negocio: lines 213-259, Datos bancarios: 261-292, Copia de seguridad: 294-398). Example for the "Datos del negocio" card:

```tsx
<Card className="px-5 max-w-[640px] mb-5">
  <div className="font-bold text-sm pt-4 pb-1">Datos del negocio</div>
  <FormRow label="Nombre / Razón social" error={errors.name}>
    <TextInput
      value={form.name}
      error={!!errors.name}
      onChange={(e) => set("name", e.target.value)}
    />
  </FormRow>
  <FormRow label="NIF" error={errors.nifCif}>
    <TextInput
      mono
      value={form.nifCif}
      error={!!errors.nifCif}
      onChange={(e) => handleNifChange(e.target.value)}
    />
  </FormRow>
  <FormRow label="Número de IVA" error={errors.vatNumber}>
    <TextInput
      mono
      value={form.vatNumber}
      error={!!errors.vatNumber}
      onChange={(e) => handleVatNumberChange(e.target.value)}
    />
  </FormRow>
  <FormRow label="Dirección fiscal">
    <TextInput value={form.address} onChange={(e) => set("address", e.target.value)} />
  </FormRow>

  {saveError && <ErrorText>{saveError}</ErrorText>}
  <div className="flex items-center gap-3 py-4 border-t border-border mt-1">
    <Button onClick={handleSave} disabled={saving}>
      Guardar
    </Button>
    {saved && <span className="text-[13px] text-ink-soft">Guardado.</span>}
  </div>
</Card>
```

Same treatment for "Datos bancarios" (Nombre del banco, IBAN, BIC as three `FormRow`s). Both cards share one `handleSave`/`saving`/`saved`/`saveError` — no logic change, this is a pure layout wrapper swap exactly like spec 08.

## "Copia de seguridad" card — the one section with non-form UI

This card mixes: a folder-picker row (`TextInput readOnly` + Button, lines 302-309), two numeric settings (retention/interval days, lines 311-343), a checkbox (345-358), status text (360-364), two action buttons (369-376), and a conditional restore-candidates list (378-397). Map each piece:

- Folder picker, retention days, interval days → `FormRow` (folder picker's `readOnly` input + button pair fits inside one `FormRow`'s right-hand column as a flex row, same as spec 08's file-attach example).
- Checkbox ("Copia de seguridad automática...") → keep as a native `<input type="checkbox">` inside a `FormRow` with an empty label, or better, replace with Radix `Switch` (spec 02 already introduces the pattern for the sidebar's dark-mode toggle — reuse that exact recipe here) for visual consistency with the rest of the app's toggles:

```tsx
<FormRow label="Copia automática">
  <div className="flex items-center gap-2.5">
    <Switch.Root checked={backupSettings?.autoBackupEnabled ?? false} onCheckedChange={...} className="..." >
      <Switch.Thumb className="..." />
    </Switch.Root>
    <span className="text-[13px] text-ink-soft">Al abrir la app</span>
  </div>
</FormRow>
```

- Backup-now / Restore buttons → stay as a `Button` pair below the grouped rows, same right-aligned convention from spec 08.
- Restore-candidates list (lines 378-397, currently plain bordered buttons) → this is a small selection list, restyle using spec 05's row-hover recipe rather than the current flat bordered-button-per-entry look:

```tsx
<div className="flex flex-col gap-0.5 mb-3 -mx-2">
  {restoreCandidates.map((entry) => (
    <button
      key={entry.path}
      onClick={() => handleRestoreSelect(entry)}
      disabled={restoring}
      className="text-left text-[13px] font-mono px-3 py-2 rounded-control hover:bg-surface-alt cursor-pointer transition-colors"
    >
      {entry.folderName}
    </button>
  ))}
</div>
```

- The `window.confirm()` at line 186-191 for restore confirmation: **optional** upgrade to `Sheet` (spec 04), consistent with FacturaDetalle's mark-paid flow (spec 07) — not required, native `confirm()` is functionally correct and this is a genuinely destructive action where a blocking native dialog is arguably _more_ trustworthy to a cautious user than a custom sheet. Judgment call; do it only if you want full visual consistency across every confirmation in the app.

## DB healthcheck card (lines 402-405)

No change needed beyond the `Card` radius token (automatic via spec 04) — it's already a minimal, correct "status line" pattern.

## Pre-flight for this file

- [ ] `PageHeader` used for the title.
- [ ] All four cards use `FormRow` for their field rows.
- [ ] Backup checkbox optionally upgraded to `Switch` for consistency with the sidebar toggle.
- [ ] Restore-candidates list restyled with hover rows instead of individually bordered buttons.
- [ ] No change to `handleSave`/`handleNifChange`/`handleVatNumberChange`/`validate`/`persistBackupSettings`/`handlePickFolder`/`handleBackupNow`/`handleRestore`/`handleRestoreSelect` logic — every function body stays byte-identical, only JSX around them changes.
- [ ] Checked in both light and dark mode.
