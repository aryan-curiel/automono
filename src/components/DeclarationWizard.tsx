import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarBlank, Receipt, Wallet, ClipboardText } from "@phosphor-icons/react";
import { Sheet } from "./ui/Sheet";
import { Button } from "./ui/Button";
import { FormRow } from "./ui/FormRow";
import { Select } from "./ui/Field";
import { listExpenses } from "../db/expenses";
import type { ExpenseRecord } from "../db/expenses";
import { createDeclaration } from "../db/declarations";
import { quarterRange, quartersInRange } from "../lib/dateRange";
import { buildDeclarationSnapshot, paidInvoicesInPeriod } from "../lib/quarterlyDeclaration";
import { formatEUR, formatDate } from "../lib/format";
import type { InvoiceListItem } from "../db/invoices";
import { EXIT_SPRING } from "../lib/motion";

type Step = 1 | 2 | 3 | 4;
type Quarter = 1 | 2 | 3 | 4;

const STEP_ICON = { 1: CalendarBlank, 2: Receipt, 3: Wallet, 4: ClipboardText };

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

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

interface DeclarationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: InvoiceListItem[];
  initialYear: number;
  initialQuarter: Quarter;
  onCreated: () => void;
}

export function DeclarationWizard({
  open,
  onOpenChange,
  invoices,
  initialYear,
  initialQuarter,
  onCreated,
}: DeclarationWizardProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState(1);
  const [year, setYear] = useState(initialYear);
  const [quarter, setQuarter] = useState<Quarter>(initialQuarter);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [excludedExpenseIds, setExcludedExpenseIds] = useState<Set<number>>(new Set());
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
    setYear(initialYear);
    setQuarter(initialQuarter);
    setExcludedExpenseIds(new Set());
    setCreateError(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const period = quarterRange(year, quarter);

  useEffect(() => {
    if (!open) return;
    listExpenses({
      from: period.from,
      to: period.to,
      quarterKeys: quartersInRange(period.from, period.to),
    }).then(setExpenses);
  }, [open, period.from, period.to]);

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

  const paidInvoices = paidInvoicesInPeriod(invoices, period);
  const includedExpenses = expenses.filter((e) => !excludedExpenseIds.has(e.id));
  const snapshot = buildDeclarationSnapshot(paidInvoices, includedExpenses);

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      await createDeclaration(year, quarter, snapshot);
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
          animate={{ width: `${(step / 4) * 100}%` }}
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
              {step === 1 && t("declarations.wizard.step1.title")}
              {step === 2 && t("declarations.wizard.step2.title")}
              {step === 3 && t("declarations.wizard.step3.title")}
              {step === 4 && t("declarations.wizard.step4.title")}
            </div>
          </div>

          {step === 1 && (
            <>
              <FormRow label={t("declarations.wizard.step1.year")}>
                <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                  {YEAR_OPTIONS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </FormRow>
              <FormRow label={t("declarations.wizard.step1.quarter")}>
                <Select
                  value={quarter}
                  onChange={(e) => setQuarter(Number(e.target.value) as Quarter)}
                >
                  {([1, 2, 3, 4] as Quarter[]).map((q) => (
                    <option key={q} value={q}>
                      Q{q}
                    </option>
                  ))}
                </Select>
              </FormRow>
              <div className="flex justify-end mt-5">
                <Button onClick={() => goTo(2)}>{t("declarations.wizard.actions.continue")}</Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="max-h-80 overflow-y-auto">
                {paidInvoices.length === 0 && (
                  <p className="text-[13px] text-ink-soft py-4">
                    {t("declarations.wizard.step2.empty")}
                  </p>
                )}
                {paidInvoices.map((inv) => (
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
                <Button variant="secondary" onClick={() => goTo(2)}>
                  {t("declarations.wizard.actions.back")}
                </Button>
                <Button onClick={() => goTo(4)}>{t("declarations.wizard.actions.continue")}</Button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="text-[13px] space-y-2">
                <div className="flex justify-between">
                  <span>{t("declarations.wizard.step4.invoices")}</span>
                  <span className="font-mono font-medium">
                    {paidInvoices.length} · {formatEUR(snapshot.totals.invoicedBase)}
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
              {createError && <p className="text-danger text-xs mt-3">{createError}</p>}
              <div className="flex justify-between mt-5">
                <Button variant="secondary" onClick={() => goTo(3)}>
                  {t("declarations.wizard.actions.back")}
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
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
