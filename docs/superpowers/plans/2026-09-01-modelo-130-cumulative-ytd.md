# Modelo 130 Cumulative YTD Pago Fraccionado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans / subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the Modelo 130 "Calculado" column in the Modelo Review comparison a real cumulative year-to-date pago fraccionado — with a per-declaration "gastos de difícil justificación" rate the user picks when creating the declaration (default 5%) — so a correct filing stops flagging as a mismatch.

**Architecture:** A per-declaration `gdj_rate` column (new migration) captured in the creation wizard. A pure `cumulativeModelo130()` in `src/lib/modeloReport.ts` recomputes the AEAT box logic across Q1..Qn of the tax year from the existing (accrual) invoice/expense records, applying that rate. `expectedCasillas`/`buildModeloReport` take the precomputed result for the "130" case. `ResumenTrimestral` computes it (it holds every invoice) and passes it to `ModeloReviewModal`.

**Tech Stack:** TypeScript, Vitest, Rust (`tauri-plugin-sql` migration), existing `buildDeclarationSnapshot` / `invoicesInPeriod` / `expensesInPeriod` helpers, `SegmentedControl` / `Field` UI primitives.

**Spec:** GitHub issue #4 ( + `REPORT.md` §2.3 / §8.2 ), plus the user's follow-up: default GDJ rate **5%**, configurable at declaration-creation time.

## Global Constraints

- Tax math stays in `src/lib/` — Rust only gets the migration (schema), nothing computational.
- New migration MUST be registered in `all_migrations()` in `src-tauri/src/lib.rs` and keep `all_sql_files_are_registered_as_migrations` green. File `0033_*.sql` → `Migration { version: 32, ... }` (file number − 1).
- GDJ rate stored as a **percent** (e.g. `5.0`), matching the `iva_rate` / `irpf_rate` convention, not a 0–1 fraction.
- `bun` is the package manager. One accent color, motion respects `prefers-reduced-motion` (the wizard already does).

## Scope

**In scope:**
- New `quarterly_declarations.gdj_rate REAL NOT NULL DEFAULT 5.0`.
- Wizard step 3 gains a GDJ-rate control (SegmentedControl: 0 / 2 / 5 / 7 %); the value flows into `createDeclaration`.
- `cumulativeModelo130(invoices, expenses, year, quarter, gdjRatePct)`: rendimiento neto YTD × 20%, − GDJ reduction (rate × YTD net, capped €2,000/yr), − retenciones YTD, − prior quarters' own positive pagos fraccionados, floored at 0.
- The 130 "Rendimiento neto" row becomes the YTD figure (AEAT box [03] is YTD).
- Keep the match/mismatch badge for 130 — meaningful once the value is correct.

**Out of scope:**
- Editing the GDJ rate on an already-created declaration (delete + recreate the in-progress one, or a follow-up issue). Noted in Risks.
- Modelo 303 prior-period compensation (issue §2.4 — separate).
- Storing "what was actually declared/paid" per quarter — `cumulativeModelo130` uses AutoMono's own consistent recomputation as the baseline (`ponytail:` comment marks the ceiling).
- Cash-basis (criterio de caja) — declarations are accrual (issue #47, merged).
- Showing the GDJ breakdown row in the review modal — the pago fraccionado row is what the issue is about.

## File Structure

- `src-tauri/migrations/0033_declaration_gdj_rate.sql` — CREATE. `ALTER TABLE ... ADD COLUMN gdj_rate REAL NOT NULL DEFAULT 5.0;`
- `src-tauri/src/lib.rs` — MODIFY. Append the `Migration { version: 32, ... }` entry.
- `src/lib/modeloReport.ts` — MODIFY. `DEFAULT_GDJ_RATE`, `GDJ_ANNUAL_CAP`, `Modelo130Ytd` type, `cumulativeModelo130()`; `expectedCasillas`/`buildModeloReport` gain optional trailing `ytd130?: Modelo130Ytd`.
- `src/lib/modeloReport.test.ts` — MODIFY. New `cumulativeModelo130` block; update the existing 130 `expectedCasillas` test.
- `src/db/declarations.ts` — MODIFY. `DeclarationRow`/`DeclarationDetail` carry `gdj_rate`/`gdjRate`; `createDeclaration` gains a `gdjRate` param.
- `src/components/DeclarationWizard.tsx` — MODIFY. `gdjRate` state (init `DEFAULT_GDJ_RATE`), SegmentedControl on step 3, passed to `createDeclaration`.
- `src/components/ModeloReviewModal.tsx` — MODIFY. Optional `modelo130Ytd?: Modelo130Ytd` prop → `buildModeloReport`.
- `src/screens/ResumenTrimestral.tsx` — MODIFY. YTD-expenses fetch; `cumulativeModelo130(invoices, ytdExpenses, declaration.year, declaration.quarter, declaration.gdjRate)`; pass as prop.
- `src/locales/{es,en}/common.json` — MODIFY. `declarations.wizard.step4.gdjRate` label + a short hint.

---

### Task 1: Migration — `quarterly_declarations.gdj_rate`

**Files:**
- Create: `src-tauri/migrations/0033_declaration_gdj_rate.sql`
- Modify: `src-tauri/src/lib.rs:210-215` (append after the `version: 31` entry, before the closing `]`)

- [ ] **Step 1: Write the migration file:**

```sql
-- Per-declaration "gastos de difícil justificación" rate (%), applied to YTD rendimiento neto
-- when computing the Modelo 130 pago fraccionado (capped €2,000/yr, enforced in TS). Régimen /
-- tax-year dependent (commonly 5%, was 7% in 2023, 2% in some cases) — the user picks it in the
-- new-declaration wizard. 5.0 is the current default; existing rows inherit it.
ALTER TABLE quarterly_declarations ADD COLUMN gdj_rate REAL NOT NULL DEFAULT 5.0;
```

- [ ] **Step 2: Register in `lib.rs`** — add inside `all_migrations()`'s vec, after the `expense_iva_deductible_pct` entry:

```rust
        Migration {
            version: 32,
            description: "declaration_gdj_rate",
            sql: include_str!("../migrations/0033_declaration_gdj_rate.sql"),
            kind: MigrationKind::Up,
        },
```

- [ ] **Step 3: Run Rust tests** — the registration guard + the frontend replay:

```
cd src-tauri && cargo test && cd ..
bun run test src/db/migrations.test.ts
```

Expected: PASS (`all_sql_files_are_registered_as_migrations` green; migration replays cleanly).

- [ ] **Step 4: Commit** `feat: add quarterly_declarations.gdj_rate column (#4)`

---

### Task 2: `cumulativeModelo130` pure function + tests

**Files:**
- Modify: `src/lib/modeloReport.ts`
- Test: `src/lib/modeloReport.test.ts`

**Interfaces:**
- Consumes: `buildDeclarationSnapshot`, `invoicesInPeriod`, `expensesInPeriod` from `./quarterlyDeclaration`; `quarterRange` from `./dateRange`; `roundCents as round2` from `./invoice`; `InvoiceListItem`, `ExpenseRecord` types.
- Produces:
  ```ts
  /** 5% is the estimación directa simplificada default; kept in sync with the SQL column default
   *  in 0033_declaration_gdj_rate.sql. */
  export const DEFAULT_GDJ_RATE = 5;
  export const GDJ_ANNUAL_CAP = 2000;

  export interface Modelo130Ytd {
    rendimientoNetoYtd: number;          // AEAT box [03], YTD, accrual
    gastosDificilJustificacion: number;  // reduction actually applied YTD (capped)
    priorPagosFraccionados: number;      // Σ prior quarters' positive pagos
    pagoFraccionado: number;             // this quarter's box result, floored at 0
  }

  export function cumulativeModelo130(
    invoices: InvoiceListItem[],
    expenses: ExpenseRecord[],
    year: number,
    quarter: 1 | 2 | 3 | 4,
    gdjRatePct: number,
  ): Modelo130Ytd;
  ```

- [ ] **Step 1: Write failing tests** in `src/lib/modeloReport.test.ts` (reuse the existing `invoice()` / `expense()` factories):

```ts
import { cumulativeModelo130, DEFAULT_GDJ_RATE } from "./modeloReport";

describe("cumulativeModelo130", () => {
  it("Q1: 20% of (YTD net − GDJ) minus retenciones", () => {
    const r = cumulativeModelo130(
      [invoice({ issueDate: "2026-02-01", subtotal: 10000, irpfAmount: 1500 })],
      [expense({ date: "2026-02-01", amount: 2000, deductiblePct: 100 })],
      2026, 1, 5,
    );
    // net 8000; GDJ = 5% * 8000 = 400; base 7600; 0.2*7600 = 1520; − ret 1500 − prior 0 = 20
    expect(r.rendimientoNetoYtd).toBe(8000);
    expect(r.gastosDificilJustificacion).toBe(400);
    expect(r.priorPagosFraccionados).toBe(0);
    expect(r.pagoFraccionado).toBe(20);
  });

  it("Q2: YTD figures and prior quarter's positive pago are subtracted", () => {
    const invoices = [
      invoice({ id: 1, issueDate: "2026-02-01", subtotal: 10000, irpfAmount: 1500 }),
      invoice({ id: 2, issueDate: "2026-05-01", subtotal: 10000, irpfAmount: 1500 }),
    ];
    const expenses = [
      expense({ id: 1, date: "2026-02-01", amount: 2000, deductiblePct: 100 }),
      expense({ id: 2, date: "2026-05-01", amount: 2000, deductiblePct: 100 }),
    ];
    const r = cumulativeModelo130(invoices, expenses, 2026, 2, 5);
    // YTD net 16000; GDJ 800; base 15200; 0.2*15200 = 3040; − retYTD 3000 − priorPago(Q1=20) = 20
    expect(r.rendimientoNetoYtd).toBe(16000);
    expect(r.priorPagosFraccionados).toBe(20);
    expect(r.pagoFraccionado).toBe(20);
  });

  it("negative quarter result floors at 0 and does not create a negative prior pago", () => {
    const invoices = [
      invoice({ id: 1, issueDate: "2026-02-01", subtotal: 1000, irpfAmount: 250 }),
      invoice({ id: 2, issueDate: "2026-05-01", subtotal: 20000, irpfAmount: 0 }),
    ];
    const r = cumulativeModelo130(invoices, [], 2026, 2, 5);
    // Q1 net 1000, 0.2*(950) = 190 − 250 -> 0 (priorPagos stays 0)
    // Q2 YTD net 21000, GDJ 1050, 0.2*19950 = 3990 − 250 − 0 = 3740
    expect(r.priorPagosFraccionados).toBe(0);
    expect(r.pagoFraccionado).toBe(3740);
  });

  it("GDJ reduction is capped at €2,000/yr", () => {
    const r = cumulativeModelo130(
      [invoice({ issueDate: "2026-02-01", subtotal: 200000, irpfAmount: 0 })],
      [], 2026, 1, 5,
    );
    expect(r.gastosDificilJustificacion).toBe(2000); // 5% * 200000 = 10000, capped
  });

  it("DEFAULT_GDJ_RATE is 5", () => {
    expect(DEFAULT_GDJ_RATE).toBe(5);
  });
});
```

- [ ] **Step 2: Run — expect fail** (`bun run test src/lib/modeloReport.test.ts`).

- [ ] **Step 3: Implement** in `src/lib/modeloReport.ts` (add the needed imports at the top):

```ts
import type { InvoiceListItem } from "../db/invoices";
import type { ExpenseRecord } from "../db/expenses";
import {
  buildDeclarationSnapshot,
  invoicesInPeriod,
  expensesInPeriod,
} from "./quarterlyDeclaration";
import { quarterRange } from "./dateRange";
```

```ts
export const DEFAULT_GDJ_RATE = 5;
export const GDJ_ANNUAL_CAP = 2000;

export interface Modelo130Ytd {
  rendimientoNetoYtd: number;
  gastosDificilJustificacion: number;
  priorPagosFraccionados: number;
  pagoFraccionado: number;
}

/**
 * Real Modelo 130 box logic, recomputed cumulatively across Q1..`quarter` of `year` from the
 * (accrual) invoice/expense records. `gdjRatePct` (the focused declaration's rate) is applied
 * uniformly YTD — GDJ is a year-to-date figure at the year's régimen rate.
 * ponytail: recompute-from-raw instead of persisting per-quarter declared figures — prior pagos
 * are AutoMono's own consistent recomputation, not the filed values. Revisit if the app ever
 * needs to reconcile against what was actually filed.
 */
export function cumulativeModelo130(
  invoices: InvoiceListItem[],
  expenses: ExpenseRecord[],
  year: number,
  quarter: 1 | 2 | 3 | 4,
  gdjRatePct: number,
): Modelo130Ytd {
  const yearStart = quarterRange(year, 1).from;
  let priorPagos = 0;
  let out: Modelo130Ytd = {
    rendimientoNetoYtd: 0,
    gastosDificilJustificacion: 0,
    priorPagosFraccionados: 0,
    pagoFraccionado: 0,
  };

  for (let q = 1; q <= quarter; q++) {
    const ytd = { from: yearStart, to: quarterRange(year, q as 1 | 2 | 3 | 4).to, label: "" };
    const snap = buildDeclarationSnapshot(
      invoicesInPeriod(invoices, ytd),
      expensesInPeriod(expenses, ytd),
    );
    const netYtd = snap.totals.netIrpfIncome;
    const retYtd = snap.totals.irpfWithheld;
    const gdj = Math.min(GDJ_ANNUAL_CAP, round2((gdjRatePct / 100) * Math.max(0, netYtd)));
    const pago = Math.max(0, round2(0.2 * (netYtd - gdj) - retYtd - priorPagos));
    out = {
      rendimientoNetoYtd: netYtd,
      gastosDificilJustificacion: gdj,
      priorPagosFraccionados: priorPagos,
      pagoFraccionado: pago,
    };
    if (q < quarter) priorPagos = round2(priorPagos + pago);
  }
  return out;
}
```

- [ ] **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit** `feat: add cumulative Modelo 130 YTD pago fraccionado calc (#4)`

---

### Task 3: Thread `ytd130` through `expectedCasillas` / `buildModeloReport`

**Files:**
- Modify: `src/lib/modeloReport.ts` (`expectedCasillas` ~`:34`, `buildModeloReport` ~`:98`)
- Test: `src/lib/modeloReport.test.ts`

**Interfaces:**
- Produces: `expectedCasillas(modelo, snapshot, ytd130?: Modelo130Ytd)`, `buildModeloReport(modelo, snapshot, extracted, period, ytd130?: Modelo130Ytd)`.

- [ ] **Step 1: Replace** the existing 130 test ("computes 130 rendimiento neto and pago fraccionado, clamped at zero") with:

```ts
it("130 rows come from the cumulative ytd result when provided", () => {
  const snapshot = buildDeclarationSnapshot([invoice({ subtotal: 1000 })], []);
  const ytd130 = {
    rendimientoNetoYtd: 12345,
    gastosDificilJustificacion: 617,
    priorPagosFraccionados: 100,
    pagoFraccionado: 321,
  };
  const rows = expectedCasillas("130", snapshot, ytd130);
  expect(rows).toEqual([
    { key: "rendimientoNeto", label: "Rendimiento neto (acumulado)", expected: 12345 },
    { key: "pagoFraccionado", label: "Pago fraccionado", expected: 321 },
  ]);
});

it("130 falls back to the isolated-quarter estimate with no ytd result", () => {
  const snapshot = buildDeclarationSnapshot(
    [invoice({ subtotal: 1000, irpfAmount: 250 })],
    [expense({ amount: 200, deductiblePct: 100 })],
  );
  const rows = expectedCasillas("130", snapshot);
  expect(rows.find((r) => r.key === "pagoFraccionado")?.expected).toBe(0);
});
```

- [ ] **Step 2: Run — expect fail.**

- [ ] **Step 3: Implement.** `expectedCasillas` signature gains `ytd130?: Modelo130Ytd`; the `"130"` branch:

```ts
case "130": {
  if (ytd130) {
    return [
      {
        key: "rendimientoNeto",
        label: "Rendimiento neto (acumulado)",
        expected: round2(ytd130.rendimientoNetoYtd),
      },
      { key: "pagoFraccionado", label: "Pago fraccionado", expected: round2(ytd130.pagoFraccionado) },
    ];
  }
  // ponytail: no YTD context (not expected from the modal) — isolated-quarter estimate.
  const pagoFraccionado = Math.max(0, totals.netIrpfIncome * 0.2 - totals.irpfWithheld);
  return [
    { key: "rendimientoNeto", label: "Rendimiento neto", expected: round2(totals.netIrpfIncome) },
    {
      key: "pagoFraccionado",
      label: "Pago fraccionado (estimación aislada)",
      expected: round2(pagoFraccionado),
    },
  ];
}
```

`buildModeloReport` gains `ytd130?: Modelo130Ytd` as its last param and forwards it: `expectedCasillas(modelo, snapshot, ytd130)`.

- [ ] **Step 4: Run — expect pass** (`bun run test src/lib/modeloReport.test.ts`).

- [ ] **Step 5: Commit** `feat: use cumulative 130 result in expectedCasillas/buildModeloReport (#4)`

---

### Task 4: Persist `gdjRate` on the declaration

**Files:**
- Modify: `src/db/declarations.ts`

**Interfaces:**
- Produces: `DeclarationDetail.gdjRate: number`; `createDeclaration(year, quarter, snapshot, gdjRate: number)`.

- [ ] **Step 1:** Add `gdj_rate: number;` to `DeclarationRow`, `gdjRate: number;` to `DeclarationDetail`, and map it in `mapRow`:

```ts
gdjRate: row.gdj_rate,
```

- [ ] **Step 2:** `createDeclaration` gains a 4th param and inserts it:

```ts
export async function createDeclaration(
  year: number,
  quarter: number,
  snapshot: DeclarationSnapshot,
  gdjRate: number,
): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO quarterly_declarations (year, quarter, snapshot_json, gdj_rate) VALUES ($1, $2, $3, $4)",
    [year, quarter, JSON.stringify(snapshot), gdjRate],
  );
  return result.lastInsertId!;
}
```

(`markDeclarationCompleted` re-selects the row via `getDeclaration` and only updates `status`/`snapshot_json` — `gdj_rate` is untouched, correct.)

- [ ] **Step 3: Typecheck** — `bun run build` will now flag the `createDeclaration` call in `DeclarationWizard.tsx` (fixed in Task 5) and any test. That's expected; proceed to Task 5 before re-running the full gate.

- [ ] **Step 4: Commit** `feat: carry gdj_rate on declaration records (#4)`

---

### Task 5: Wizard GDJ-rate control

**Files:**
- Modify: `src/components/DeclarationWizard.tsx`
- Modify: `src/locales/es/common.json` (`declarations.wizard.step4`), `src/locales/en/common.json` (same path)

- [ ] **Step 1: i18n** — add to `declarations.wizard.step4` in both files:

  es: `"gdjRate": "Gastos de difícil justificación", "gdjRateHint": "5% del rendimiento neto en estimación directa simplificada (7% en 2023)."`
  en: `"gdjRate": "Hard-to-justify expenses", "gdjRateHint": "5% of net income under estimación directa simplificada (7% in 2023)."`

- [ ] **Step 2: Component** — import `SegmentedControl` from `./ui/SegmentedControl`, `Label` from `./ui/Field`, and `DEFAULT_GDJ_RATE` from `../lib/modeloReport`. Add state:

```ts
const [gdjRate, setGdjRate] = useState<number>(DEFAULT_GDJ_RATE);
```

Reset it alongside the other fields in the `open && !wasOpen` block: `setGdjRate(DEFAULT_GDJ_RATE);`

- [ ] **Step 3:** On step 3 (`step === 3`), above the `createError` line, add:

```tsx
<div className="mt-4 pt-3 border-t border-border">
  <Label>{t("declarations.wizard.step4.gdjRate")}</Label>
  <SegmentedControl
    value={String(gdjRate)}
    onChange={(v) => setGdjRate(Number(v))}
    options={[
      { value: "0", label: "0%" },
      { value: "2", label: "2%" },
      { value: "5", label: "5%" },
      { value: "7", label: "7%" },
    ]}
  />
  <p className="text-xs text-ink-soft mt-1.5">{t("declarations.wizard.step4.gdjRateHint")}</p>
</div>
```

- [ ] **Step 4:** Pass it through: `await createDeclaration(year, quarter, snapshot, gdjRate);`

- [ ] **Step 5:** `bun run build` && `bun run lint` — expect PASS now.

- [ ] **Step 6: Commit** `feat: pick gastos-difícil-justificación rate in the declaration wizard (#4)`

---

### Task 6: Wire the cumulative result into the review modal

**Files:**
- Modify: `src/components/ModeloReviewModal.tsx` (props ~`:54-63`, `buildModeloReport` call ~`:134`)
- Modify: `src/screens/ResumenTrimestral.tsx` (expense fetch ~`:330-345`, modal render ~`:627-636`)

- [ ] **Step 1: Modal** — `import type { Modelo130Ytd } from "../lib/modeloReport";`, add `modelo130Ytd?: Modelo130Ytd;` to `ModeloReviewModalProps`, destructure it, and pass as the 5th arg:

```ts
const report = buildModeloReport(
  detection.modelo, snapshot, fields,
  { expectedYear: year, expectedQuarter: quarter, detectedYear: detection.year, detectedQuarter: detection.quarter },
  modelo130Ytd,
);
```

Leave the existing `eslint-disable-next-line react-hooks/exhaustive-deps` / `[open, files]` deps as-is (`modelo130Ytd` is stable for one declaration screen, same rationale as `snapshot`).

- [ ] **Step 2: Screen** — in `ResumenTrimestral.tsx`, confirm `quarterRange` is imported from `../lib/dateRange` (add if not), then add near the other expense fetches:

```ts
const ytdPeriod = { from: quarterRange(year, 1).from, to: period.to };
const [ytdExpenses, setYtdExpenses] = useState<ExpenseRecord[]>([]);
useEffect(() => {
  void listExpenses({
    from: ytdPeriod.from,
    to: ytdPeriod.to,
    quarterKeys: quartersInRange(ytdPeriod.from, ytdPeriod.to),
  }).then(setYtdExpenses);
}, [ytdPeriod.from, ytdPeriod.to]);
```

- [ ] **Step 3:** Compute (only meaningful with a focused declaration), importing `cumulativeModelo130`:

```ts
const modelo130Ytd =
  declaration != null
    ? cumulativeModelo130(
        invoices, ytdExpenses,
        declaration.year, declaration.quarter as 1 | 2 | 3 | 4,
        declaration.gdjRate,
      )
    : undefined;
```

Pass `modelo130Ytd={modelo130Ytd}` on `<ModeloReviewModal … />`.

- [ ] **Step 4:** `bun run build` && `bun run lint` — expect PASS.

- [ ] **Step 5: Commit** `feat: pass cumulative 130 YTD into the Modelo Review modal (#4)`

---

### Task 7: Full gate + manual check

- [ ] **Step 1:** `bun run lint`
- [ ] **Step 2:** `bun run test` (whole suite)
- [ ] **Step 3:** `bun run build`
- [ ] **Step 4:** `cd src-tauri && cargo test && cd ..` (migration guard)
- [ ] **Step 5 (manual — needs `bun run tauri dev`, flag to user if unavailable):** create a Q2 declaration, pick 5% GDJ; ensure a Q1 declaration exists in the same year; drop a real Modelo 130 PDF; verify the "Calculado" column shows YTD rendimiento neto and a pago fraccionado that nets Q1's, and a correct form badges **Coincide**.
- [ ] **Step 6: Commit** any lint/format fixups.

## Validation

- `bun run lint` · `bun run test` (+ `bun run test src/lib/modeloReport.test.ts`, `bun run test src/db/migrations.test.ts`) · `bun run build` · `cd src-tauri && cargo test`
- Manual: `bun run tauri dev` per Task 7 Step 5 — **can't run headless; user exercises it before ready-for-review.**

## Risks / Rollback

- **Migration** (`0033`): additive `ADD COLUMN … NOT NULL DEFAULT 5.0` — SQLite allows this in one step (no table rebuild). Must be registered as `version: 32` in `lib.rs`; `all_sql_files_are_registered_as_migrations` + `src/db/migrations.test.ts` both guard it. App identifier unchanged.
- **Tax-math correctness:** GDJ default 5% per the user; the wizard exposes 0/2/5/7. `cumulativeModelo130` applies the focused declaration's rate uniformly YTD, and prior pagos are AutoMono's recomputation, not filed values — both marked `ponytail:`.
- **No edit path for the rate post-creation** — user deletes + recreates the in-progress declaration, or a follow-up issue adds an inline editor. Flag as a proposed follow-up.
- **Behaviour change:** every user's 130 "Calculado" numbers shift once this ships — intended; Task 7 Step 5 is the guard.
- **Rollback:** revert the branch. The column stays on already-migrated dev DBs but is harmless (defaulted, ignored by old code).
