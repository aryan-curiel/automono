# Inicio Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `Dashboard.tsx` (Inicio) so it leads with current-quarter declaration status, adds a 6-quarter historical timeline + invoiced/expenses trend chart, and shows declaration-aware status dots on the tax calendar — while keeping every existing card (KPIs, recurring invoices, recent invoices, upcoming due, aging, revenue by client, expenses by category).

**Architecture:** All new logic lives in `Dashboard.tsx` itself (module-scope pure helpers + one new local component, `DashboardQuarterStrip`) — no new files, no new `src/lib/` functions, per the approved design spec. `ResumenTrimestral.tsx` gains one optional prop (`initialQuarterKey`) so clicking a past quarter in the new strip lands there instead of always resetting to the current quarter. `App.tsx` threads a small `dashboardQuarterKey` state between the two screens and resets it on any other navigation into Resumen Trimestral (currently only the sidebar).

**Tech Stack:** Tauri 2 (Rust, untouched by this plan) + React 19 + TypeScript + SQLite (`@tauri-apps/plugin-sql`), react-i18next.

## Global Constraints

- Read-only + deep-link: the dashboard surfaces status; every actionable card navigates to the screen that owns the action (`resumen-trimestral`, `facturas`, `gastos`). No new inline actions.
- No new `src/lib/` functions — quarter-window generation, bucketing, and date math are inline module-scope helpers in `Dashboard.tsx`, following the same pattern `ResumenTrimestral.tsx` already uses for its own local `parseQuarterKey`/`CURRENT_KEY`.
- No new component files — `DashboardQuarterStrip` is a sibling function defined in `Dashboard.tsx`, above the exported `Dashboard` component (mirrors how `ResumenTrimestral.tsx` defines `LineItemRow`/`Pager` above its own exported component).
- Historical window is fixed at 6 quarters, not configurable.
- i18n via `react-i18next` — every new string goes through `src/locales/{es,en}/common.json` under the existing `dashboard` namespace; reuse `declarations.status.in_progress`/`declarations.status.completed`/`declarations.detail.attached` where they already say the right thing instead of duplicating keys.
- **This codebase has no component-level test harness** (no `@testing-library`, no `.test.tsx` files anywhere — only pure-function tests in `src/lib/`/`src/db/`). Per `CLAUDE.md`, screen/UI changes are verified by typechecking + linting + running the app (`bun run tauri dev`), not by writing a new test framework for this one screen. Do not introduce one.
- Typecheck: `bunx tsc --noEmit`. Lint: `bun run lint`. Full build check: `bun run build`.
- Package manager is `bun`.

---

## File Structure

| File                                                                | Responsibility                                                                                                                                                                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/screens/ResumenTrimestral.tsx` (modify)                        | New optional `initialQuarterKey` prop seeds `focusedKey` instead of always starting on the current quarter                                                                                                |
| `src/screens/Dashboard.tsx` (modify)                                | The bulk of the work: wider expense fetch + declarations fetch, declaration-status hero card, historical quarter strip + trend chart, declaration-aware tax-calendar dots, new `onNavigateToQuarter` prop |
| `src/App.tsx` (modify)                                              | `dashboardQuarterKey` state threaded between `Dashboard` and `ResumenTrimestral`; Sidebar navigation resets it                                                                                            |
| `src/locales/es/common.json`, `src/locales/en/common.json` (modify) | New keys under `dashboard.declarationStatus`, `dashboard.history`, `dashboard.trend`                                                                                                                      |

---

### Task 1: `ResumenTrimestral` accepts an `initialQuarterKey` prop

**Files:**

- Modify: `src/screens/ResumenTrimestral.tsx:85-89` (props interface), `src/screens/ResumenTrimestral.tsx:242-244` (component signature + initial state)

**Interfaces:**

- Produces: `ResumenTrimestralProps.initialQuarterKey?: string` — when set, `focusedKey`'s initial value is this instead of `CURRENT_KEY`. Later tasks (App.tsx wiring) pass this from a new `dashboardQuarterKey` state.

- [ ] **Step 1: Add the prop to the interface**

In `src/screens/ResumenTrimestral.tsx`, change:

```ts
interface ResumenTrimestralProps {
  invoices: InvoiceListItem[];
  dropPaths?: string[] | null;
  dropToken?: number;
}
```

to:

```ts
interface ResumenTrimestralProps {
  invoices: InvoiceListItem[];
  dropPaths?: string[] | null;
  dropToken?: number;
  /** Seeds the focused quarter (e.g. when arriving from the Inicio historical timeline) —
   * falls back to the current quarter when omitted. */
  initialQuarterKey?: string;
}
```

- [ ] **Step 2: Use it to seed `focusedKey`**

Change:

```ts
export function ResumenTrimestral({ invoices, dropPaths, dropToken }: ResumenTrimestralProps) {
  const { t } = useTranslation();
  const [focusedKey, setFocusedKey] = useState(CURRENT_KEY);
```

to:

```ts
export function ResumenTrimestral({
  invoices,
  dropPaths,
  dropToken,
  initialQuarterKey,
}: ResumenTrimestralProps) {
  const { t } = useTranslation();
  const [focusedKey, setFocusedKey] = useState(initialQuarterKey ?? CURRENT_KEY);
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors (the prop is optional, so the two existing call sites — there's currently only one, in `App.tsx` — still compile unchanged until Task 6 updates it).

- [ ] **Step 4: Commit**

```bash
git add src/screens/ResumenTrimestral.tsx
git commit -m "feat: let ResumenTrimestral open on a specific quarter"
```

---

### Task 2: Dashboard data layer — wider expense fetch + declarations fetch

Rewires `Dashboard.tsx`'s data fetching before any UI changes: replaces the single-current-quarter expense fetch with one 6-quarter fetch (the KPI and expenses-by-category cards derive their current-quarter numbers from it, so their rendered output is unchanged), and adds the `listDeclarations()` fetch every later task needs.

**Files:**

- Modify: `src/screens/Dashboard.tsx` (imports, module-scope consts, component state/effects, derived values)

**Interfaces:**

- Consumes: `listDeclarations(): Promise<DeclarationListItem[]>`, `getDeclaration(id): Promise<DeclarationDetail | null>` from `src/db/declarations.ts` (existing, used by `ResumenTrimestral.tsx` already). `quarterRange`, `quarterKeyOf`, `previousQuarterKey`, `quarterKeyLabel` from `src/lib/dateRange.ts` (existing).
- Produces (module scope, used by Tasks 3-5): `CURRENT_KEY: string`, `CURRENT_YEAR: number`, `CURRENT_QUARTER: number`, `QUARTER_KEYS: string[]` (6 keys, ascending, oldest→newest, ending at `CURRENT_KEY`), `quarterKeyRange(key: string): { from: string; to: string }`, `expenseQuarterKey(expense: ExpenseRecord): string`, `MODELOS: Modelo[]`, `MODELO_PATH_KEY: Record<Modelo, "modelo303Path" | "modelo130Path" | "modelo111Path">`.
- Produces (component scope, used by Tasks 3-5): `declarations: DeclarationListItem[]` state, `currentDeclarationDetail: DeclarationDetail | null` state, `currentDeclaration: DeclarationListItem | undefined`, `invoicedByQuarter: Map<string, number>`, `expensesByQuarter: Map<string, number>`, `maxTrendValue: number`.

- [ ] **Step 1: Update imports**

Change:

```ts
import { defaultQuarterPeriod, quartersInRange } from "../lib/dateRange";
```

to:

```ts
import {
  defaultQuarterPeriod,
  previousQuarterKey,
  quarterKeyLabel,
  quarterKeyOf,
  quarterRange,
} from "../lib/dateRange";
```

(`quartersInRange` is no longer used anywhere in this file once Step 3 below replaces its one call site — dropping it from the import avoids an unused-import lint error.)

Add, right after the existing `import type { InvoiceListItem } from "../db/invoices";` line:

```ts
import { listDeclarations, getDeclaration } from "../db/declarations";
import type {
  DeclarationListItem,
  DeclarationDetail,
  DeclarationStatus,
  Modelo,
} from "../db/declarations";
```

- [ ] **Step 2: Add module-scope consts/helpers**

Right after the imports (before `interface DashboardProps`), add:

```ts
const RECENT_QUARTERS = 6;
const CURRENT_KEY = quarterKeyOf(defaultQuarterPeriod().from);
const [CURRENT_YEAR_STR, CURRENT_QUARTER_STR] = CURRENT_KEY.split("-Q");
const CURRENT_YEAR = Number(CURRENT_YEAR_STR);
const CURRENT_QUARTER = Number(CURRENT_QUARTER_STR);

/** The [from, to] date range of a "YYYY-QN" quarter key. */
function quarterKeyRange(key: string): { from: string; to: string } {
  const [yearStr, q] = key.split("-Q");
  return quarterRange(Number(yearStr), Number(q) as 1 | 2 | 3 | 4);
}

/** `count` quarter keys ending at `currentKey`, ascending (oldest first). */
function recentQuarterKeys(currentKey: string, count: number): string[] {
  const keys = [currentKey];
  for (let i = 1; i < count; i++) keys.unshift(previousQuarterKey(keys[0]));
  return keys;
}

const QUARTER_KEYS = recentQuarterKeys(CURRENT_KEY, RECENT_QUARTERS);
const QUARTER_WINDOW_FROM = quarterKeyRange(QUARTER_KEYS[0]).from;
const QUARTER_WINDOW_TO = quarterKeyRange(QUARTER_KEYS[QUARTER_KEYS.length - 1]).to;

/** The quarter an expense counts toward — its own date's quarter, unless overridden. Mirrors
 * the OR-match `listExpenses({ quarterKeys })` already applies server-side. */
function expenseQuarterKey(expense: ExpenseRecord): string {
  return expense.declaredPeriod ?? quarterKeyOf(expense.date);
}

const MODELOS: Modelo[] = ["303", "130", "111"];
const MODELO_PATH_KEY: Record<Modelo, "modelo303Path" | "modelo130Path" | "modelo111Path"> = {
  "303": "modelo303Path",
  "130": "modelo130Path",
  "111": "modelo111Path",
};
```

- [ ] **Step 3: Replace the expense state/effect**

Change:

```ts
const [clientCount, setClientCount] = useState(0);
const [expensesThisQuarter, setExpensesThisQuarter] = useState(0);
const [quarterExpenses, setQuarterExpenses] = useState<ExpenseRecord[]>([]);
const [generatingFor, setGeneratingFor] = useState<number | null>(null);

useEffect(() => {
  listClients().then((clients) => setClientCount(clients.length));
}, []);

useEffect(() => {
  const { from, to } = defaultQuarterPeriod();
  listExpenses({ from, to, quarterKeys: quartersInRange(from, to) }).then((expenses) => {
    setQuarterExpenses(expenses);
    setExpensesThisQuarter(expenses.reduce((s, e) => s + e.amount * (e.deductiblePct / 100), 0));
  });
}, []);
```

to:

```ts
const [clientCount, setClientCount] = useState(0);
const [recentExpenses, setRecentExpenses] = useState<ExpenseRecord[]>([]);
const [generatingFor, setGeneratingFor] = useState<number | null>(null);
const [declarations, setDeclarations] = useState<DeclarationListItem[]>([]);
const [currentDeclarationDetail, setCurrentDeclarationDetail] = useState<DeclarationDetail | null>(
  null,
);

useEffect(() => {
  listClients().then((clients) => setClientCount(clients.length));
}, []);

useEffect(() => {
  listExpenses({
    from: QUARTER_WINDOW_FROM,
    to: QUARTER_WINDOW_TO,
    quarterKeys: QUARTER_KEYS,
  }).then(setRecentExpenses);
}, []);

useEffect(() => {
  listDeclarations().then(setDeclarations);
}, []);

useEffect(() => {
  const current = declarations.find(
    (d) => d.year === CURRENT_YEAR && d.quarter === CURRENT_QUARTER,
  );
  if (current?.status === "in_progress") {
    getDeclaration(current.id).then(setCurrentDeclarationDetail);
  } else {
    setCurrentDeclarationDetail(null);
  }
}, [declarations]);
```

- [ ] **Step 4: Derive the current-quarter expense subset and the 6-quarter trend maps**

Immediately after the line `const taxDeadlines = nextTaxDeadlines(todayIso, 2);` (which stays where it is), add:

```ts
const quarterExpenses = recentExpenses.filter((e) => expenseQuarterKey(e) === CURRENT_KEY);
const expensesThisQuarter = quarterExpenses.reduce(
  (s, e) => s + e.amount * (e.deductiblePct / 100),
  0,
);

const invoicedByQuarter = new Map(
  QUARTER_KEYS.map((key) => {
    const { from, to } = quarterKeyRange(key);
    const total = invoices
      .filter(
        (inv) =>
          inv.status !== "draft" &&
          inv.issueDate !== null &&
          inv.issueDate >= from &&
          inv.issueDate <= to,
      )
      .reduce((s, inv) => s + inv.total, 0);
    return [key, total] as const;
  }),
);

const expensesByQuarter = new Map(QUARTER_KEYS.map((key) => [key, 0] as const));
for (const expense of recentExpenses) {
  const key = expenseQuarterKey(expense);
  if (expensesByQuarter.has(key)) {
    expensesByQuarter.set(
      key,
      expensesByQuarter.get(key)! + expense.amount * (expense.deductiblePct / 100),
    );
  }
}

const maxTrendValue = Math.max(
  1,
  ...QUARTER_KEYS.flatMap((key) => [
    invoicedByQuarter.get(key) ?? 0,
    expensesByQuarter.get(key) ?? 0,
  ]),
);

const currentDeclaration = declarations.find(
  (d) => d.year === CURRENT_YEAR && d.quarter === CURRENT_QUARTER,
);
```

There should be exactly one declaration each of `expensesThisQuarter` and `quarterExpenses` in the file now — the old `useState` pair was already removed in Step 3, and this step adds their `const`-derived replacements.

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors. (`DeclarationStatus` and `MODELOS`/`MODELO_PATH_KEY` are unused until Tasks 3-5 — TypeScript doesn't flag unused top-level type imports or unused module consts as errors, only `noUnusedLocals`-style lint would; confirm `bun run lint` is clean too before moving on, and if it flags `MODELOS`/`MODELO_PATH_KEY`/`DeclarationStatus` as unused, that's expected to resolve once Tasks 3-5 use them — leave as-is.)

- [ ] **Step 6: Manually verify nothing regressed**

Run: `bun run tauri dev`
Expected: Inicio renders exactly as before this task (same KPI numbers, same expenses-by-category card) — this task only changes how the data is fetched, not what's shown yet.

- [ ] **Step 7: Commit**

```bash
git add src/screens/Dashboard.tsx
git commit -m "refactor: widen Dashboard's expense fetch to 6 quarters, add declarations fetch"
```

---

### Task 3: Declaration status hero card

**Files:**

- Modify: `src/screens/Dashboard.tsx` (JSX, right after `PageHeader`)
- Modify: `src/locales/es/common.json`, `src/locales/en/common.json` (new `dashboard.declarationStatus.*` keys)

**Interfaces:**

- Consumes: `currentDeclaration`, `currentDeclarationDetail`, `MODELOS`, `MODELO_PATH_KEY`, `taxDeadlines`, `totalFacturado`, `expensesThisQuarter`, `CURRENT_KEY` — all produced by Task 2.

- [ ] **Step 1: Add i18n keys**

In `src/locales/es/common.json`, inside the `"dashboard"` object, add a new `"declarationStatus"` key (after `"kpis"`, before `"recurring"`):

```json
    "declarationStatus": {
      "notStarted": "Sin empezar",
      "goToSummary": "Ir a Resumen trimestral",
      "summary": "Facturado {{invoiced}} · Gastos {{expenses}}",
      "nextDeadline": "Próximo vencimiento: {{date}}",
      "missing": "Falta"
    },
```

In `src/locales/en/common.json`, same location, same structure:

```json
    "declarationStatus": {
      "notStarted": "Not started",
      "goToSummary": "Go to Quarterly summary",
      "summary": "Invoiced {{invoiced}} · Expenses {{expenses}}",
      "nextDeadline": "Next deadline: {{date}}",
      "missing": "Missing"
    },
```

- [ ] **Step 2: Add the hero card JSX**

In `src/screens/Dashboard.tsx`, change:

```tsx
      <div className="grid grid-cols-4 gap-4 mb-6">
        {kpis.map((kpi) => (
```

to (adding the hero `Card` immediately before the KPI grid):

```tsx
      <Card className="p-6 mb-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="font-bold text-sm">{quarterKeyLabel(CURRENT_KEY)}</span>
              <Badge
                tone={
                  currentDeclaration?.status === "completed"
                    ? "success"
                    : currentDeclaration?.status === "in_progress"
                      ? "info"
                      : "neutral"
                }
              >
                {currentDeclaration
                  ? t(`declarations.status.${currentDeclaration.status}`)
                  : t("dashboard.declarationStatus.notStarted")}
              </Badge>
            </div>
            <div className="text-xs text-ink-soft">
              {t("dashboard.declarationStatus.summary", {
                invoiced: formatEUR(totalFacturado),
                expenses: formatEUR(expensesThisQuarter),
              })}
            </div>
            {taxDeadlines[0] && (
              <div
                className={`text-xs mt-1 ${
                  taxDeadlines[0].dueDate <=
                  new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
                    ? "text-warn font-medium"
                    : "text-ink-soft"
                }`}
              >
                {t("dashboard.declarationStatus.nextDeadline", {
                  date: formatDate(taxDeadlines[0].dueDate),
                })}
              </div>
            )}
            {currentDeclarationDetail && (
              <div className="flex items-center gap-4 mt-3">
                {MODELOS.map((modelo) => {
                  const attached = !!currentDeclarationDetail[MODELO_PATH_KEY[modelo]];
                  return (
                    <span
                      key={modelo}
                      className="flex items-center gap-1.5 text-xs text-ink-soft"
                      title={
                        attached
                          ? t("declarations.detail.attached")
                          : t("dashboard.declarationStatus.missing")
                      }
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          attached ? "bg-success" : "bg-ink-soft/40"
                        }`}
                      />
                      Modelo {modelo}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <Button onClick={() => onNavigate("resumen-trimestral")} className="shrink-0">
            {t("dashboard.declarationStatus.goToSummary")}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {kpis.map((kpi) => (
```

- [ ] **Step 3: Typecheck and lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors.

- [ ] **Step 4: Manually verify all three declaration states**

Run: `bun run tauri dev`, open Inicio.
Expected:

- If the current quarter has no declaration row yet: badge reads "Sin empezar" (neutral tone), no modelo dots.
- If it has an in-progress declaration: badge reads "En curso" (info tone), and the three "Modelo 303/130/111" dots appear, colored green when that PDF is attached and muted grey otherwise (attach one via Resumen Trimestral to see it flip).
- If it's completed: badge reads "Completada" (success tone), no modelo dots (all three are guaranteed attached by `markDeclarationCompleted`'s invariant, so showing them again is redundant here).
- The "Ir a Resumen trimestral" button navigates to Resumen Trimestral.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Dashboard.tsx src/locales/es/common.json src/locales/en/common.json
git commit -m "feat: add declaration status hero card to Inicio"
```

---

### Task 4: Historical quarter strip + trend chart

**Files:**

- Modify: `src/screens/Dashboard.tsx` (new `DashboardQuarterStrip` component, new JSX section, `DashboardProps`/`onNavigate` wiring)
- Modify: `src/locales/es/common.json`, `src/locales/en/common.json` (new `dashboard.history`/`dashboard.trend` keys)

**Interfaces:**

- Consumes: `QUARTER_KEYS`, `declarations`, `invoicedByQuarter`, `expensesByQuarter`, `maxTrendValue`, `quarterKeyLabel` — all from Task 2.
- Produces: `DashboardProps.onNavigateToQuarter: (quarterKey: string) => void` (new required prop — Task 6 wires it from `App.tsx`). `DashboardQuarterStrip({ quarterKeys, declarations, onSelect })` — local component, not exported.

- [ ] **Step 1: Add i18n keys**

In `src/locales/es/common.json`, inside `"dashboard"`, after the `"expensesByCategory"` key (the last one before the closing `}` of the `dashboard` object), add:

```json
    "expensesByCategory": {
      "title": "Gastos por categoría ({{period}})"
    },
    "history": {
      "title": "Declaraciones por trimestre"
    },
    "trend": {
      "title": "Facturado vs. gastos"
    }
```

(note the added trailing comma after `expensesByCategory`'s closing brace). In `src/locales/en/common.json`, same location:

```json
    "expensesByCategory": {
      "title": "Expenses by category ({{period}})"
    },
    "history": {
      "title": "Declarations by quarter"
    },
    "trend": {
      "title": "Invoiced vs. expenses"
    }
```

- [ ] **Step 2: Add the `onNavigateToQuarter` prop**

Change:

```ts
interface DashboardProps {
  invoices: InvoiceListItem[];
  onNavigate: (screen: Screen) => void;
  onOpenInvoice: (id: number) => void;
  onDuplicateInvoice: (id: number) => Promise<void>;
}

export function Dashboard({
  invoices,
  onNavigate,
  onOpenInvoice,
  onDuplicateInvoice,
}: DashboardProps) {
```

to:

```ts
interface DashboardProps {
  invoices: InvoiceListItem[];
  onNavigate: (screen: Screen) => void;
  onNavigateToQuarter: (quarterKey: string) => void;
  onOpenInvoice: (id: number) => void;
  onDuplicateInvoice: (id: number) => Promise<void>;
}

export function Dashboard({
  invoices,
  onNavigate,
  onNavigateToQuarter,
  onOpenInvoice,
  onDuplicateInvoice,
}: DashboardProps) {
```

- [ ] **Step 3: Add the `DashboardQuarterStrip` component**

In `src/screens/Dashboard.tsx`, right before `export function Dashboard(`, add:

```tsx
/** A fixed, non-paginated 6-quarter status strip — unlike `QuarterTimeline`, there's no
 * focus/page window here, just the same quarters `Dashboard` already computed. */
function DashboardQuarterStrip({
  quarterKeys,
  declarations,
  onSelect,
}: {
  quarterKeys: string[];
  declarations: DeclarationListItem[];
  onSelect: (key: string) => void;
}) {
  const statusByKey = new Map<string, DeclarationStatus>(
    declarations.map((d) => [`${d.year}-Q${d.quarter}`, d.status]),
  );
  return (
    <div className="flex items-center gap-1 p-1 rounded-control bg-surface-alt border border-border">
      {quarterKeys.map((key) => {
        const status = statusByKey.get(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className="relative flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium
                       rounded-control cursor-pointer text-ink-soft hover:text-ink hover:bg-surface
                       transition-colors ease-[var(--ease-out)]
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                status === "completed"
                  ? "bg-success"
                  : status === "in_progress"
                    ? "bg-info"
                    : "bg-ink-soft/40"
              }`}
            />
            {quarterKeyLabel(key)}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Add the history + trend JSX section**

Change:

```tsx
      {recurring.length > 0 && (
```

to (adding the new grid immediately before it):

```tsx
      <div className="grid grid-cols-[1fr_1fr] gap-4 mb-4">
        <Card className="p-6">
          <div className="font-bold text-sm mb-4">{t("dashboard.history.title")}</div>
          <DashboardQuarterStrip
            quarterKeys={QUARTER_KEYS}
            declarations={declarations}
            onSelect={onNavigateToQuarter}
          />
        </Card>

        <Card className="p-6">
          <div className="font-bold text-sm mb-4">{t("dashboard.trend.title")}</div>
          {QUARTER_KEYS.map((key) => {
            const invoiced = invoicedByQuarter.get(key) ?? 0;
            const expenses = expensesByQuarter.get(key) ?? 0;
            return (
              <div key={key} className="py-2 border-b border-border last:border-b-0">
                <div className="text-xs font-medium mb-1.5">{quarterKeyLabel(key)}</div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-alt overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(invoiced / maxTrendValue) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] w-20 text-right shrink-0">
                    {formatEUR(invoiced)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-alt overflow-hidden">
                    <div
                      className="h-full rounded-full bg-warn"
                      style={{ width: `${(expenses / maxTrendValue) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] w-20 text-right shrink-0">
                    {formatEUR(expenses)}
                  </span>
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {recurring.length > 0 && (
```

- [ ] **Step 5: Typecheck and lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors. (This is also where `bun run lint` should stop complaining about `MODELOS`/`MODELO_PATH_KEY`/`DeclarationStatus` being unused, if it did after Task 2 — `DashboardQuarterStrip` now uses `DeclarationStatus`, and Task 3 already used `MODELOS`/`MODELO_PATH_KEY`.)

- [ ] **Step 6: Manually verify**

Run: `bun run tauri dev` (this task's prop change means `App.tsx` won't compile again until Task 6 — skip live verification here if `App.tsx` isn't updated yet, and instead confirm via `bunx tsc --noEmit` that the only new error is `App.tsx`'s `<Dashboard>` call site missing `onNavigateToQuarter`; that's expected and fixed in Task 6).

- [ ] **Step 7: Commit**

```bash
git add src/screens/Dashboard.tsx src/locales/es/common.json src/locales/en/common.json
git commit -m "feat: add historical quarter strip and trend chart to Inicio"
```

---

### Task 5: Declaration-aware dots on the tax calendar card

**Files:**

- Modify: `src/screens/Dashboard.tsx` (tax calendar card JSX + one module-scope helper)

**Interfaces:**

- Consumes: `declarations`, `taxDeadlines` — from Task 2/existing code.
- Produces: `deadlineQuarterKey(dueDate: string): string` (module-scope helper, local to this file).

- [ ] **Step 1: Add the reverse date→quarter-key helper**

Right after the `expenseQuarterKey` helper added in Task 2, add:

```ts
/** Recovers the "YYYY-QN" quarter a 130/303 deadline reports on, from its due date (the 20th
 * of the month after that quarter ends — see `nextTaxDeadlines` in `lib/taxCalendar.ts`). */
function deadlineQuarterKey(dueDate: string): string {
  const [yearStr, monthStr] = dueDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (month === 1) return `${year - 1}-Q4`;
  const quarter = (month - 4) / 3 + 1;
  return `${year}-Q${quarter}`;
}
```

- [ ] **Step 2: Add the dot to each quarterly deadline row**

Change:

```tsx
{
  taxDeadlines.map((d) => (
    <div
      key={d.dueDate}
      className="flex items-center justify-between py-2.5 border-b border-border last:border-b-0"
    >
      <div className="flex items-center gap-2.5">
        <CalendarCheck size={16} weight="bold" className="text-ink-soft" />
        <span className="font-medium text-[13.5px]">{d.label}</span>
      </div>
      <span className="font-semibold text-[13.5px] font-mono">{formatDate(d.dueDate)}</span>
    </div>
  ));
}
```

to:

```tsx
{
  taxDeadlines.map((d) => {
    const declarationStatus =
      d.model === "130/303"
        ? (() => {
            const key = deadlineQuarterKey(d.dueDate);
            const [yearStr, q] = key.split("-Q");
            return declarations.find(
              (dec) => dec.year === Number(yearStr) && dec.quarter === Number(q),
            )?.status;
          })()
        : undefined;
    return (
      <div
        key={d.dueDate}
        className="flex items-center justify-between py-2.5 border-b border-border last:border-b-0"
      >
        <div className="flex items-center gap-2.5">
          <CalendarCheck size={16} weight="bold" className="text-ink-soft" />
          <span className="font-medium text-[13.5px]">{d.label}</span>
        </div>
        <span className="flex items-center gap-2 font-semibold text-[13.5px] font-mono">
          {d.model === "130/303" && (
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                declarationStatus === "completed"
                  ? "bg-success"
                  : declarationStatus === "in_progress"
                    ? "bg-info"
                    : "bg-ink-soft/40"
              }`}
            />
          )}
          {formatDate(d.dueDate)}
        </span>
      </div>
    );
  });
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/Dashboard.tsx
git commit -m "feat: show declaration status dots on Inicio's tax calendar deadlines"
```

---

### Task 6: Wire `App.tsx`

**Files:**

- Modify: `src/App.tsx`

**Interfaces:**

- Consumes: `DashboardProps.onNavigateToQuarter` (Task 4), `ResumenTrimestralProps.initialQuarterKey` (Task 1).

- [ ] **Step 1: Add `dashboardQuarterKey` state**

Near the other `useState` declarations at the top of the `App` component (e.g. right after `const [selectedClientId, setSelectedClientId] = useState<number | null>(null);`), add:

```ts
const [dashboardQuarterKey, setDashboardQuarterKey] = useState<string | null>(null);
```

- [ ] **Step 2: Wire the `Dashboard` call site**

Change:

```tsx
{
  screen === "dashboard" && (
    <Dashboard
      invoices={invoices}
      onNavigate={navigateFromDashboard}
      onOpenInvoice={openInvoice}
      onDuplicateInvoice={handleDuplicateInvoice}
    />
  );
}
```

to:

```tsx
{
  screen === "dashboard" && (
    <Dashboard
      invoices={invoices}
      onNavigate={navigateFromDashboard}
      onNavigateToQuarter={(key) => {
        setDashboardQuarterKey(key);
        setScreen("resumen-trimestral");
      }}
      onOpenInvoice={openInvoice}
      onDuplicateInvoice={handleDuplicateInvoice}
    />
  );
}
```

- [ ] **Step 3: Wire the `ResumenTrimestral` call site**

Change:

```tsx
{
  screen === "resumen-trimestral" && (
    <ResumenTrimestral
      invoices={invoices}
      dropPaths={declarationDropPaths}
      dropToken={declarationDropToken}
    />
  );
}
```

to:

```tsx
{
  screen === "resumen-trimestral" && (
    <ResumenTrimestral
      invoices={invoices}
      dropPaths={declarationDropPaths}
      dropToken={declarationDropToken}
      initialQuarterKey={dashboardQuarterKey ?? undefined}
    />
  );
}
```

- [ ] **Step 4: Reset `dashboardQuarterKey` on sidebar navigation**

The sidebar is the only other entry point into `resumen-trimestral` (confirmed: no other `setScreen("resumen-trimestral")` call site exists outside `Dashboard`'s new callback). Without this reset, navigating dashboard → a past quarter → sidebar → Resumen Trimestral would incorrectly reopen on that stale past quarter instead of the current one.

Change:

```tsx
<Sidebar screen={screen} onNavigate={setScreen} />
```

to:

```tsx
<Sidebar
  screen={screen}
  onNavigate={(next) => {
    setDashboardQuarterKey(null);
    setScreen(next);
  }}
/>
```

- [ ] **Step 5: Typecheck, lint, and build**

Run: `bunx tsc --noEmit && bun run lint && bun run build`
Expected: all three succeed with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: thread dashboardQuarterKey between Inicio and Resumen Trimestral"
```

---

### Task 7: Full manual verification pass

**Files:** none (verification only)

- [ ] **Step 1: Start the app**

Run: `bun run tauri dev`

- [ ] **Step 2: Verify the hero card end-to-end**

On Inicio: confirm the hero card's quarter label matches the actual current quarter, its status badge/summary numbers match what Resumen Trimestral shows for that quarter, and clicking "Ir a Resumen trimestral" navigates there on the current quarter.

- [ ] **Step 3: Verify the historical strip**

Click on 2-3 different past quarters in the strip. Confirm each click navigates to Resumen Trimestral opened on that specific quarter (not the current one), and that the dot colors (green/blue/grey) match each quarter's actual declaration status as seen inside Resumen Trimestral's own `QuarterTimeline`.

- [ ] **Step 4: Verify the trend chart**

Confirm the bar lengths and €amounts for each of the 6 quarters look plausible relative to the actual invoices/expenses in those periods (spot-check one quarter's numbers against Facturas/Gastos filtered to that period).

- [ ] **Step 5: Verify the tax calendar dots**

Confirm the upcoming 130/303 deadlines show a dot whose color matches that quarter's declaration status, and that the annual 190/390 deadline (if visible) shows no dot.

- [ ] **Step 6: Verify the sidebar-reset fix**

From Inicio, click a past quarter in the strip (lands on that quarter in Resumen Trimestral). Then click "Inicio" in the sidebar, then click "Resumen trimestral" in the sidebar directly. Confirm it opens on the _current_ quarter, not the stale past one.

- [ ] **Step 7: Verify nothing else regressed**

Confirm the KPI row, recurring invoices card (if any recurring candidates exist), recent invoices, upcoming due, aging, revenue-by-client, and expenses-by-category cards all still render with the same data and behavior as before this plan.

- [ ] **Step 8: Check both themes**

Toggle light/dark in Ajustes; confirm the hero card, strip, and trend chart read correctly in both (no low-contrast text, dot colors still distinguishable).

- [ ] **Step 9: Final commit (if any fixups were needed)**

If Steps 2-8 surfaced any issue requiring a code change, fix it, re-run the relevant verification step, then:

```bash
git add -A
git commit -m "fix: address issues found in Inicio redesign manual verification"
```

If no fixups were needed, no commit here — the plan is complete as of Task 6's commit.
