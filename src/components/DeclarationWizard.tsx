import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Receipt, Wallet, ClipboardText } from "@phosphor-icons/react";
import { Sheet } from "./ui/Sheet";
import { Button } from "./ui/Button";
import { Label } from "./ui/Field";
import { SegmentedControl } from "./ui/SegmentedControl";
import type { ExpenseRecord } from "../db/expenses";
import { createDeclaration } from "../db/declarations";
import { quarterRange } from "../lib/dateRange";
import { DEFAULT_GDJ_RATE } from "../lib/modeloReport";
import {
  buildDeclarationSnapshot,
  expensesForBasis,
  invoicesForBasis,
  type DeclarationBasis,
} from "../lib/quarterlyDeclaration";
import { formatEUR, formatDate } from "../lib/format";
import type { InvoiceListItem } from "../db/invoices";
import { EXIT_SPRING } from "../lib/motion";
import { BasisNote } from "./BasisNote";

type Step = 1 | 2 | 3;
type Quarter = 1 | 2 | 3 | 4;

const STEP_ICON = { 1: Receipt, 2: Wallet, 3: ClipboardText };

type StepVariantCustom = { direction: number; reduceMotion: boolean };

const stepVariants = {
  enter: ({ direction }: StepVariantCustom) => ({ opacity: 0, x: direction * 24 }),
  center: { opacity: 1, x: 0 },
  exit: ({ direction, reduceMotion }: StepVariantCustom) => ({
    opacity: 0,
    x: direction * -24,
    transition: reduceMotion ? { duration: 0 } : EXIT_SPRING,
  }),
};

interface DeclarationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: InvoiceListItem[];
  /** Expenses for `quarterRange(year, quarter)` — lifted from the parent screen, which already
   * queries the same period (#19), rather than re-fetched here. */
  expenses: ExpenseRecord[];
  year: number;
  quarter: Quarter;
  /** Tax basis the parent screen resolved from the `criterioCaja` preference. */
  basis: DeclarationBasis;
  onCreated: () => void;
}

export function DeclarationWizard({
  open,
  onOpenChange,
  invoices,
  expenses,
  year,
  quarter,
  basis,
  onCreated,
}: DeclarationWizardProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState(1);
  const [excludedExpenseIds, setExcludedExpenseIds] = useState<Set<number>>(new Set());
  const [gdjRate, setGdjRate] = useState<number>(DEFAULT_GDJ_RATE);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Tracks the Sheet's open state so a closed->open transition resets the flow to step 1 with
  // fresh selections, instead of resuming wherever the user last left off (the Sheet itself stays
  // mounted across opens/closes, so this can't rely on fresh useState initializers).
  const [wasOpen, setWasOpen] = useState(open);
  if (open && !wasOpen) {
    setWasOpen(true);
    setStep(1);
    setDirection(1);
    setExcludedExpenseIds(new Set());
    setGdjRate(DEFAULT_GDJ_RATE);
    setCreateError(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const period = quarterRange(year, quarter);

  function goTo(next: Step) {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  }

  function toggleExpense(id: number) {
    setExcludedExpenseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const periodInvoices = invoicesForBasis(invoices, period, basis);
  const includedExpenses = expensesForBasis(expenses, period, basis).filter(
    (e) => !excludedExpenseIds.has(e.id),
  );
  const snapshot = buildDeclarationSnapshot(periodInvoices, includedExpenses, basis);

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      await createDeclaration(year, quarter, snapshot, gdjRate);
      onCreated();
      onOpenChange(false);
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setCreating(false);
    }
  }

  const StepIcon = STEP_ICON[step];
  const slideTransition = reduceMotion
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 380, damping: 34 } as const);
  const progressTransition = reduceMotion
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 300, damping: 30 } as const);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("declarations.wizard.title")}
      maxWidthClassName="max-w-xl"
    >
      <div className="h-1.5 rounded-pill bg-surface-alt mb-5 overflow-hidden">
        <motion.div
          className="h-full rounded-pill bg-accent"
          initial={false}
          animate={{ width: `${(step / 3) * 100}%` }}
          transition={progressTransition}
        />
      </div>

      <AnimatePresence mode="wait" custom={{ direction, reduceMotion }} initial={false}>
        <motion.div
          key={step}
          custom={{ direction, reduceMotion }}
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={slideTransition}
        >
          <div className="flex items-center gap-2 mb-3.5">
            <StepIcon size={18} weight="bold" className="text-accent" />
            <div className="font-bold text-sm">
              {step === 1 && t("declarations.wizard.step2.title")}
              {step === 2 && t("declarations.wizard.step3.title")}
              {step === 3 && t("declarations.wizard.step4.title")}
            </div>
          </div>

          {step === 1 && (
            <>
              <div className="mb-3">
                <BasisNote basis={basis} />
              </div>
              <div className="max-h-80 overflow-y-auto">
                {periodInvoices.length === 0 && (
                  <p className="text-[13px] text-ink-soft py-4">
                    {t("declarations.wizard.step2.empty")}
                  </p>
                )}
                {periodInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex justify-between py-2 border-b border-border last:border-b-0 text-[13px]"
                  >
                    <span>
                      {formatDate(inv.issueDate)} · {inv.clientName}
                    </span>
                    <span className="font-mono font-medium">{formatEUR(inv.total)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-border font-semibold text-[13px]">
                <span>{t("declarations.wizard.step2.total")}</span>
                <span className="font-mono">{formatEUR(snapshot.totals.invoicedBase)}</span>
              </div>
              <div className="flex justify-end mt-5">
                <Button onClick={() => goTo(2)}>{t("declarations.wizard.actions.continue")}</Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="max-h-80 overflow-y-auto">
                {expenses.length === 0 && (
                  <p className="text-[13px] text-ink-soft py-4">
                    {t("declarations.wizard.step3.empty")}
                  </p>
                )}
                {expenses.map((e) => (
                  <label
                    key={e.id}
                    className="flex items-center gap-2.5 py-2 border-b border-border last:border-b-0 text-[13px] cursor-pointer hover:bg-surface-alt transition-colors duration-150"
                  >
                    <input
                      type="checkbox"
                      className="accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                      checked={!excludedExpenseIds.has(e.id)}
                      onChange={() => toggleExpense(e.id)}
                    />
                    <span className="flex-1">
                      {formatDate(e.date)} · {e.description || e.category || "—"}
                    </span>
                    <span className="font-mono font-medium">{formatEUR(e.amount)}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-between mt-5">
                <Button variant="secondary" onClick={() => goTo(1)}>
                  {t("declarations.wizard.actions.back")}
                </Button>
                <Button onClick={() => goTo(3)}>{t("declarations.wizard.actions.continue")}</Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="text-[13px] space-y-2">
                <div className="flex justify-between">
                  <span>{t("declarations.wizard.step4.invoices")}</span>
                  <span className="font-mono font-medium">
                    {periodInvoices.length} · {formatEUR(snapshot.totals.invoicedBase)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t("declarations.wizard.step4.expenses")}</span>
                  <span className="font-mono font-medium">
                    {includedExpenses.length} · {formatEUR(snapshot.totals.expensesDeductibleBase)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t("declarations.wizard.step4.irpfWithheld")}</span>
                  <span className="font-mono font-medium">
                    {formatEUR(snapshot.totals.irpfWithheld)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold pt-2 border-t border-border">
                  <span>{t("declarations.wizard.step4.netIncome")}</span>
                  <span className="font-mono">{formatEUR(snapshot.totals.netIrpfIncome)}</span>
                </div>
              </div>
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
                <p className="text-xs text-ink-soft mt-1.5">
                  {t("declarations.wizard.step4.gdjRateHint")}
                </p>
              </div>
              {createError && <p className="text-danger text-xs mt-3">{createError}</p>}
              <div className="flex justify-between mt-5">
                <Button variant="secondary" onClick={() => goTo(2)}>
                  {t("declarations.wizard.actions.back")}
                </Button>
                <Button onClick={() => void handleCreate()} disabled={creating}>
                  {creating
                    ? t("declarations.wizard.actions.creating")
                    : t("declarations.wizard.actions.create")}
                </Button>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </Sheet>
  );
}
