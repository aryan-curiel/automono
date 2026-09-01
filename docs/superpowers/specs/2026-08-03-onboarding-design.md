# First-launch onboarding

## Problem

The app has no first-run experience. `business_profile` is a singleton row
pre-populated with empty strings by migration `0010_business_profile.sql`, so
a brand-new install silently opens straight to an empty dashboard with no
business name, no NIF/CIF, no bank account. The user has to know to go find
`Ajustes` themselves. There's also no persisted concept of theme or language
at all — `App.tsx` seeds `theme` from a plain `useState("light")` that resets
every launch, and there's no language-switcher UI anywhere despite i18n
already supporting `es`/`en`.

## Goal

On first launch, walk the user through a 3-step wizard collecting their
business profile, bank account, and a small set of preferences (theme,
language, default IVA/IRPF rates), writing them once at the end. Skippable at
any step — skipping (or finishing) marks onboarding done so it never shows
again, independent of whether the fields actually got filled in.

Out of scope (YAGNI for now): a language-switcher UI in `Ajustes` (onboarding
is the only place language is set for now), a generic reusable
Stepper/Wizard component (this is the only multi-step flow in the app),
re-triggering onboarding from Ajustes ("redo setup"), and autosave per step
(nothing is written until the user explicitly finishes or skips).

## Data model

New table, following the exact singleton pattern already used by
`backup_settings` (`0014_backup_settings.sql`):

```sql
CREATE TABLE preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  theme TEXT NOT NULL DEFAULT 'light',
  language TEXT NOT NULL DEFAULT 'es',
  default_iva_rate REAL NOT NULL DEFAULT 21,
  default_irpf_rate REAL NOT NULL DEFAULT 7,
  onboarding_completed INTEGER NOT NULL DEFAULT 0
);
INSERT INTO preferences (id) VALUES (1);
```

Migration file: `src-tauri/migrations/0018_preferences.sql`, registered in
`all_migrations()` in `src-tauri/src/lib.rs` (per CLAUDE.md, this step is easy
to forget and fails silently — the existing
`all_sql_files_are_registered_as_migrations` Rust test guards it).

`src/db/preferences.ts` — new module mirroring `src/db/businessProfile.ts`:

```ts
interface PreferencesRecord {
  theme: "light" | "dark";
  language: "es" | "en";
  defaultIvaRate: number;
  defaultIrpfRate: number;
  onboardingCompleted: boolean;
}

getPreferences(): Promise<PreferencesRecord>
updatePreferences(patch: Partial<PreferencesRecord>): Promise<void>
```

Same singleton-row UPDATE-by-`id=1` shape as `updateBusinessProfile`.

## First-launch detection

Signal is `preferences.onboardingCompleted === false` — not "is
`business_profile` empty." Using emptiness as the signal would make
onboarding reappear every launch after a skip (since skip intentionally
leaves fields blank). `onboardingCompleted` is set to `true` by both the
"finish" and "skip" actions, so skipping means skip-once, not
skip-and-see-it-forever.

## Onboarding flow / UX

New `Screen` union member `"onboarding"` (`src/types.ts`). `App.tsx` fetches
`preferences` alongside the existing `businessProfile` fetch once `dbReady`
(around `App.tsx:124-127`), and if `!preferences.onboardingCompleted`, renders
`Onboarding` instead of the normal screen switch — same shape as today's
`dbReady` loading gate, one condition later. This is a full-screen takeover,
not a dismissible modal, so it does not reuse `Sheet`.

`src/screens/Onboarding.tsx` — single component, local `step` state (1
component, no new generic Stepper primitive — a fixed 3-step wizard doesn't
earn a reusable abstraction). Built from existing primitives: `Card`,
`FormRow`, `Field`/`TextInput`, `Button`, plus a plain 3-dot progress
indicator.

- **Step 1 — Negocio:** name, NIF/CIF, VAT number, address. Validated with
  `isValidNifCif`/`isValidVatNumber` (`src/features/clients`), same as
  `Ajustes`.
- **Step 2 — Cuenta bancaria:** bank name, IBAN, BIC. Validated with
  `isValidIban` (`src/features/settings`), same as `Ajustes`.
- **Step 3 — Preferencias:** theme toggle (light/dark), language (ES/EN,
  applied live via `i18n.changeLanguage` for preview), default IVA %, default
  IRPF %.

Every step shows "Atrás" (steps 2-3) and "Saltar por ahora". Skip calls
`updatePreferences({ onboardingCompleted: true })` only, and returns to the
dashboard — no partial writes. Step 3's primary button is "Finalizar": writes
step 1+2 fields via `updateBusinessProfile`, then step 3 fields plus
`onboardingCompleted: true` via `updatePreferences`, then navigates to the
dashboard.

## Wiring preferences into the rest of the app

- **Theme:** `App.tsx` seeds its `theme` state from `preferences.theme`
  instead of the hardcoded `"light"` once loaded. The existing dark-mode
  toggle in `Ajustes` (`general` tab) starts calling
  `updatePreferences({ theme })` on change instead of only updating local
  state, so both onboarding's choice and later changes persist across
  launches.
- **Language:** `App.tsx` calls `i18n.changeLanguage(preferences.language)`
  once on boot (before the first render past the loading gate). No
  switcher UI is added elsewhere — onboarding is the only place this is set
  for now.
- **Default tax rates:** `src/features/clients/taxDefaults.ts`'s hardcoded
  `IRPF_DEFAULT_RATE = 7` and `FacturaNueva.tsx`'s hardcoded `21` (lines 35, 72) become reads from `preferences.defaultIrpfRate` /
  `defaultIvaRate`, fetched where `FacturaNueva` already loads client data,
  falling back to today's 21/7 if preferences haven't loaded. The existing
  `irpfApplicable(client.country)` gating is unchanged.

## Testing

- `src/db/migrations.test.ts` auto-discovers `0018_preferences.sql` and
  replays it — no new test needed there, just confirm it passes.
- Rust: add `preferences` to the same coverage pattern as
  `backup_settings` if one exists (INSERT default row applies cleanly).
- One `Onboarding.test.tsx`-style test: skip writes only
  `onboardingCompleted: true`; finish writes all three groups of fields;
  first-launch gate in `App.tsx` renders `Onboarding` when
  `onboardingCompleted` is false and skips it otherwise.
