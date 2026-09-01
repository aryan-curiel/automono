# Modelo 130 Cumulative YTD Pago Fraccionado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans / subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the Modelo 130 "Calculado" column in the Modelo Review comparison a real cumulative year-to-date pago fraccionado, so a correct filing stops flagging as a mismatch.

**Architecture:** Add one pure function `cumulativeModelo130()` in `src/lib/modeloReport.ts` that recomputes the AEAT box logic across Q1..Qn of the tax year from the existing invoice/expense data (no new DB state — the declaration store is *not* extended; YTD is derived from raw records the same accrual way snapshots already are). `expectedCasillas`/`buildModeloReport` take an optional precomputed `ytd130` result for the "130" case. `ResumenTrimestral` computes it (it already holds every invoice) and passes it to `ModeloReviewModal`.

**Tech Stack:** TypeScript, Vitest, existing `buildDeclarationSnapshot` / `invoicesInPeriod` / `expensesInPeriod` helpers.

**Spec:** GitHub issue #4 ( + `REPORT.md` §2.3 / §8.2 ).

## Global Constraints

- Tax math stays in `src/lib/` — never Rust.
- No new migration, no DB schema change.
- One accent color, no responsive breakpoints — but this change is logic + one prop, no new UI surface.
- `bun` is the package manager.

## Scope

**In scope (issue option a — the root-cause fix):**
- Compute Modelo 130 pago fraccionado cumulatively: rendimiento neto YTD × 20%, minus a "gastos de difícil justificación" reduction, minus retenciones YTD, minus prior quarters' own (positive) pagos fraccionados, floored at 0.
- The "Rendimiento neto" row for 130 becomes the YTD figure (AEAT box [03] is YTD, not per-quarter).
- Keep the match/mismatch badge for 130 — it's meaningful once the value is correct.

**Out of scope:**
- Modelo 303 prior-period compensation (issue #2.4 — separate issue).
- Storing "what was actually declared/paid" per quarter. We use AutoMono's own consistent recomputation as the baseline — a `ponytail:` comment marks this ceiling.
- Cash-basis (criterio de caja) — declarations are accrual (issue #47, already merged).
- The interim relabel (option b) — superseded by doing option a.

**Assumption needing your confirmation:** the "gastos de difícil justificación" reduction rate. Issue #4 and `REPORT.md` §2.3 both say **2%**, capped **€2,000/yr**. Estimación directa simplificada is more commonly 5% (7% in 2023) — I'll implement it as a single named constant `GDJ_RATE = 0.02` / `GDJ_ANNUAL_CAP = 2000` so it's a one-line change if that's wrong. **Confirm 2% or tell me the rate.**

## File Structure

- `src/lib/modeloReport.ts` — MODIFY. Add `Modelo130Ytd` type + `cumulativeModelo130()`. `expectedCasillas` and `buildModeloReport` gain an optional trailing `ytd130?: Modelo130Ytd` param used only for the `"130"` branch.
- `src/lib/modeloReport.test.ts` — MODIFY. New `cumulativeModelo130` describe block; update the existing "clamped at zero" 130 test to the new signature.
- `src/components/ModeloReviewModal.tsx` — MODIFY. New optional prop `modelo130Ytd?: Modelo130Ytd`, passed into `buildModeloReport`.
- `src/screens/ResumenTrimestral.tsx` — MODIFY. Fetch YTD expenses for the focused year; compute `cumulativeModelo130(invoices, ytdExpenses, year, quarter)`; pass as `modelo130Ytd` prop.

No i18n JSON change — the 130 row labels are literal strings in `expectedCasillas` today; the "Rendimiento neto" label gains " (acumulado)" inline, matching the existing Spanish style.

---

### Task 1: `cumulativeModelo130` pure function + tests

**Files:**
- Modify: `src/lib/modeloReport.ts`
- Test: `src/lib/modeloReport.test.ts`

**Interfaces:**
- Consumes: `buildDeclarationSnapshot`, `invoicesInPeriod`, `expensesInPeriod` from `./quarterlyDeclaration`; `quarterRange`, `iso`-equivalent via `quarterRange(year,1).from` for the year start; `roundCents as round2` from `./invoice`.
- Produces:
  ```ts
  export interface Modelo130Ytd {
    /** AEAT box [03]: ingresos YTD − gastos deducibles YTD (accrual). */
    rendimientoNetoYtd: number;
    /** The "gastos de difícil justificación" reduction actually applied YTD (capped). */
    gastosDificilJustificacion: number;
    /** Sum of prior quarters' own positive pagos fraccionados. */
    priorPagosFraccionados: number;
    /** AEAT box result for THIS quarter: max(0, 0.2·([03]−GDJ) − retYTD − priorPagos). */
    pagoFraccionado: number;
  }
  export function cumulativeModelo130(
    invoices: InvoiceListItem[],
    expenses: ExpenseRecord[],
    year: number,
    quarter: 1 | 2 | 3 | 4,
  ): Modelo130Ytd;
  ```

- [ ] **Step 1: Write failing tests** in `src/lib/modeloReport.test.ts`:

```ts
import { cumulativeModelo130 } from "./modeloReport";
// reuse existing invoice()/expense() factories

describe("cumulativeModelo130", () => {
  it("Q1: 20% of YTD rendimiento neto minus retenciones", () => {
    // Q1 invoice base 10000, irpf 1500; Q1 expense 2000 -> net 8000
    const r = cumulativeModelo130(
      [invoice({ issueDate: "2026-02-01", subtotal: 10000, irpfAmount: 1500 })],
      [expense({ date: "2026-02-01", amount: 2000, deductiblePct: 100 })],
      2026,
      1,
    );
    // net 8000; GDJ = min(2000, 0.02*8000=160) = 160; base 7840
    // 0.2*7840 = 1568; minus ret 1500; minus prior 0 -> 68
    expect(r.rendimientoNetoYtd).toBe(8000);
    expect(r.gastosDificilJustificacion).toBe(160);
    expect(r.priorPagosFraccionados).toBe(0);
    expect(r.pagoFraccionado).toBe(68);
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
    const r = cumulativeModelo130(invoices, expenses, 2026, 2);
    // YTD net 16000; GDJ min(2000, 320) = 320; base 15680
    // 0.2*15680 = 3136; minus retYTD 3000; minus priorPago (Q1 = 68) -> 68
    expect(r.rendimientoNetoYtd).toBe(16000);
    expect(r.priorPagosFraccionados).toBe(68);
    expect(r.pagoFraccionado).toBe(68);
  });

  it("negative quarter result is floored at 0 and does NOT reduce prior pagos", () => {
    // Q1 heavy retenciones -> negative -> pago 0, priorPagos stays 0
    const r = cumulativeModelo130(
      [invoice({ issueDate: "2026-02-01", subtotal: 1000, irpfAmount: 250 })],
      [expense({ date: "2026-02-01", amount: 200, deductiblePct: 100 })],
      2026,
      1,
    );
    // net 800; GDJ 16; base 784; 0.2*784=156.8; minus 250 -> negative -> 0
    expect(r.pagoFraccionado).toBe(0);
  });

  it("GDJ reduction is capped at €2,000/yr", () => {
    const r = cumulativeModelo130(
      [invoice({ issueDate: "2026-02-01", subtotal: 200000, irpfAmount: 0 })],
      [],
      2026,
      1,
    );
    expect(r.gastosDificilJustificacion).toBe(2000); // 0.02*200000 = 4000, capped
  });
});
```

- [ ] **Step 2: Run — expect fail** (`cumulativeModelo130` not exported):

```
bun run test src/lib/modeloReport.test.ts
```

- [ ] **Step 3: Implement** in `src/lib/modeloReport.ts` (add imports for `InvoiceListItem`, `ExpenseRecord`, `invoicesInPeriod`, `expensesInPeriod`, `buildDeclarationSnapshot`, `quarterRange`):

```ts
// ponytail: Spanish EDS "gastos de difícil justificación" — issue #4 / REPORT §2.3 specify
// 2% capped €2,000/yr. Single knob: bump if the rate is wrong for this autónomo's régimen.
const GDJ_RATE = 0.02;
const GDJ_ANNUAL_CAP = 2000;

/**
 * Real Modelo 130 box logic, recomputed cumulatively across Q1..`quarter` of `year` from the
 * (accrual) invoice/expense records — AutoMono doesn't persist per-quarter declared figures, so
 * prior quarters' pagos fraccionados are its own consistent recomputation, not the filed values.
 * ponytail: recompute-from-raw instead of storing YTD declaration state; revisit if the app ever
 * needs to reconcile against what was actually filed.
 */
export function cumulativeModelo130(
  invoices: InvoiceListItem[],
  expenses: ExpenseRecord[],
  year: number,
  quarter: 1 | 2 | 3 | 4,
): Modelo130Ytd {
  const yearStart = quarterRange(year, 1).from;
  let priorPagos = 0;
  let last: Omit<Modelo130Ytd, "priorPagosFraccionados"> & { pagoFraccionado: number } = {
    rendimientoNetoYtd: 0,
    gastosDificilJustificacion: 0,
    pagoFraccionado: 0,
  };

  for (let q = 1 as 1 | 2 | 3 | 4; q <= quarter; q++) {
    const ytd = { from: yearStart, to: quarterRange(year, q).to, label: "" };
    const snap = buildDeclarationSnapshot(
      invoicesInPeriod(invoices, ytd),
      expensesInPeriod(expenses, ytd),
    );
    const netYtd = snap.totals.netIrpfIncome;
    const retYtd = snap.totals.irpfWithheld;
    const gdj = Math.min(GDJ_ANNUAL_CAP, round2(GDJ_RATE * Math.max(0, netYtd)));
    const pago = Math.max(0, round2(0.2 * (netYtd - gdj) - retYtd - priorPagos));
    last = { rendimientoNetoYtd: netYtd, gastosDificilJustificacion: gdj, pagoFraccionado: pago };
    if (q < quarter) priorPagos = round2(priorPagos + pago);
  }

  return { ...last, priorPagosFraccionados: priorPagos };
}
```

(`for (let q = 1 as ...; q <= quarter; q++)` — if the `as` cast in a for-loop is awkward for eslint, use a plain `number` local and cast at the `quarterRange` call.)

- [ ] **Step 4: Run — expect pass.**

```
bun run test src/lib/modeloReport.test.ts
```

- [ ] **Step 5: Commit** `feat: add cumulative Modelo 130 YTD pago fraccionado calc (#4)`

---

### Task 2: Thread `ytd130` through `expectedCasillas` / `buildModeloReport`

**Files:**
- Modify: `src/lib/modeloReport.ts:34-76` (`expectedCasillas`), `:98-130` (`buildModeloReport`)
- Test: `src/lib/modeloReport.test.ts` (update existing 130 test)

**Interfaces:**
- Consumes: `Modelo130Ytd` from Task 1.
- Produces: `expectedCasillas(modelo, snapshot, ytd130?: Modelo130Ytd)` and `buildModeloReport(modelo, snapshot, extracted, period, ytd130?: Modelo130Ytd)`.

- [ ] **Step 1: Update the existing 130 test** "computes 130 rendimiento neto and pago fraccionado, clamped at zero" — it now must pass a `ytd130` and assert the rows echo it:

```ts
it("130 rows come from the cumulative ytd result when provided", () => {
  const snapshot = buildDeclarationSnapshot([invoice({ subtotal: 1000 })], []);
  const ytd130 = {
    rendimientoNetoYtd: 12345,
    gastosDificilJustificacion: 247,
    priorPagosFraccionados: 100,
    pagoFraccionado: 321,
  };
  const rows = expectedCasillas("130", snapshot, ytd130);
  expect(rows).toEqual([
    { key: "rendimientoNeto", label: "Rendimiento neto (acumulado)", expected: 12345 },
    { key: "pagoFraccionado", label: "Pago fraccionado", expected: 321 },
  ]);
});

it("130 falls back to the isolated-quarter estimate when no ytd result is passed", () => {
  const snapshot = buildDeclarationSnapshot(
    [invoice({ subtotal: 1000, irpfAmount: 250 })],
    [expense({ amount: 200, deductiblePct: 100 })],
  );
  const rows = expectedCasillas("130", snapshot);
  expect(rows.find((r) => r.key === "pagoFraccionado")?.expected).toBe(0);
});
```

- [ ] **Step 2: Run — expect fail.**

- [ ] **Step 3: Implement.** In `expectedCasillas`, add `ytd130?: Modelo130Ytd` param; the `"130"` branch:

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
  // ponytail: no YTD context (shouldn't happen from the modal) — isolated-quarter estimate.
  const pagoFraccionado = Math.max(0, totals.netIrpfIncome * 0.2 - totals.irpfWithheld);
  return [
    { key: "rendimientoNeto", label: "Rendimiento neto", expected: round2(totals.netIrpfIncome) },
    { key: "pagoFraccionado", label: "Pago fraccionado (estimación aislada)", expected: round2(pagoFraccionado) },
  ];
}
```

In `buildModeloReport`, add `ytd130?: Modelo130Ytd` as the last param and pass it: `expectedCasillas(modelo, snapshot, ytd130)`.

- [ ] **Step 4: Run — expect pass** (`bun run test src/lib/modeloReport.test.ts`).

- [ ] **Step 5: Commit** `feat: use cumulative 130 result in expectedCasillas/buildModeloReport (#4)`

---

### Task 3: Wire it through the modal + screen

**Files:**
- Modify: `src/components/ModeloReviewModal.tsx` (props interface ~`:54-63`, `buildModeloReport` call ~`:134`)
- Modify: `src/screens/ResumenTrimestral.tsx` (expense fetch ~`:330-345`, modal render ~`:627-636`)

**Interfaces:**
- Consumes: `cumulativeModelo130`, `Modelo130Ytd` from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Modal** — add to `ModeloReviewModalProps`:

```ts
modelo130Ytd?: Modelo130Ytd;
```

import `type { Modelo130Ytd }` from `../lib/modeloReport`, destructure `modelo130Ytd` in the component signature, and pass it as the 5th arg to `buildModeloReport(detection.modelo, snapshot, fields, { ... }, modelo130Ytd)`. Add `modelo130Ytd` to the effect's dep list is **not** needed (same rationale as the existing eslint-disable comment — it's stable for one declaration screen); leave the disable comment as-is.

- [ ] **Step 2: Screen** — in `ResumenTrimestral.tsx`, add a YTD-expenses fetch alongside the existing quarter/prior fetches:

```ts
const ytdPeriod = { from: quarterRange(year, 1).from, to: period.to, label: "" };
const [ytdExpenses, setYtdExpenses] = useState<ExpenseRecord[]>([]);
useEffect(() => {
  void listExpenses({
    from: ytdPeriod.from,
    to: ytdPeriod.to,
    quarterKeys: quartersInRange(ytdPeriod.from, ytdPeriod.to),
  }).then(setYtdExpenses);
}, [ytdPeriod.from, ytdPeriod.to]);
```

(`quarterRange` is already imported? check imports — add if missing.)

Then compute, guarded on there being a focused declaration:

```ts
const modelo130Ytd =
  declaration != null
    ? cumulativeModelo130(invoices, ytdExpenses, declaration.year, declaration.quarter as 1 | 2 | 3 | 4)
    : undefined;
```

and pass `modelo130Ytd={modelo130Ytd}` to `<ModeloReviewModal ... />`.

- [ ] **Step 3: Typecheck + lint.**

```
bun run build
bun run lint
```

- [ ] **Step 4: Commit** `feat: pass cumulative 130 YTD into Modelo Review modal (#4)`

---

### Task 4: Full gate + manual check

- [ ] **Step 1:** `bun run lint`
- [ ] **Step 2:** `bun run test` (whole suite — `modeloReport.test.ts` + anything importing `expectedCasillas`)
- [ ] **Step 3:** `bun run build`
- [ ] **Step 4 (manual, needs `bun run tauri dev` — flag to user if unavailable):** open a quarter with a locked declaration + a prior locked quarter in the same year, drop a real Modelo 130 PDF, confirm the "Calculado" column shows the YTD rendimiento neto and the pago fraccionado nets prior quarters, and a correct form now badges **Coincide** not **No coincide**.
- [ ] **Step 5: Commit** any lint/format fixups.

## Validation

- `bun run lint` · `bun run test src/lib/modeloReport.test.ts` · `bun run test` · `bun run build`
- No Rust touched → no `cargo test`.
- Manual: `bun run tauri dev` per Task 4 Step 4 — **I can't run this headless; you'll need to exercise it.**

## Risks / Rollback

- **No migration, no schema, no Rust** — none of the migration/`lib.rs`/app-identifier hazards apply.
- **Tax-math correctness:** the GDJ rate (2% assumed) and whether prior pagos should be AutoMono's recomputation vs. filed values are the two judgement calls — both are single-constant / documented-ceiling and marked with `ponytail:` comments. Wrong rate = one-line fix.
- **Behaviour change:** the 130 "Calculado" numbers in the review modal will change for every user with multi-quarter activity. This is the intended fix, but it's why Task 4 Step 4 matters.
- Rollback = revert the branch; nothing persisted, nothing migrated.
