import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ErrorText, Select, TextArea, TextInput } from "../components/ui/Field";
import { FormRow } from "../components/ui/FormRow";
import { PageHeader } from "../components/PageHeader";
import { Toast, type ToastTone } from "../components/ui/Toast";
import {
  attachExpenseFile,
  createExpense,
  extractReceiptFields,
  extractReceiptFieldsLlm,
  getExpense,
  pickExpenseFile,
  updateExpense,
} from "../db/expenses";
import type { ExpenseRecord, NewExpense, ReceiptFields } from "../db/expenses";
import { listExpenseCategories } from "../db/expenseCategories";
import type { ExpenseCategoryRecord } from "../db/expenseCategories";
import { activeApiKey, getLlmSettings } from "../db/llmSettings";
import { nextQuarterKey, quarterKeyLabel, quarterKeyOf } from "../lib/dateRange";

interface GastoFormProps {
  mode: "create" | "edit";
  expenseId?: number;
  initialFilePath?: string;
  onSaved: (expense: ExpenseRecord) => void;
  onCancel: () => void;
}

interface FormState {
  date: string;
  category: string;
  description: string;
  amount: string;
  ivaAmount: string;
  deductiblePct: string;
  irpfRate: string;
  irpfAmount: string;
  receiptFilePath: string | null;
  /** "" means declare in the natural quarter of `date`; otherwise a "YYYY-QN" override. */
  declaredPeriod: string;
}

function emptyForm(): FormState {
  return {
    date: "",
    category: "",
    description: "",
    amount: "",
    ivaAmount: "",
    deductiblePct: "100",
    irpfRate: "",
    irpfAmount: "",
    receiptFilePath: null,
    declaredPeriod: "",
  };
}

function toFormState(expense: ExpenseRecord): FormState {
  return {
    date: expense.date,
    category: expense.category ?? "",
    description: expense.description ?? "",
    amount: String(expense.amount),
    ivaAmount: expense.ivaAmount !== null ? String(expense.ivaAmount) : "",
    deductiblePct: String(expense.deductiblePct),
    irpfRate: expense.irpfRate !== null ? String(expense.irpfRate) : "",
    irpfAmount: expense.irpfAmount !== null ? String(expense.irpfAmount) : "",
    receiptFilePath: expense.receiptFilePath,
    declaredPeriod: expense.declaredPeriod ?? "",
  };
}

/** The natural quarter of `date` plus the next three, for the "declare in" override select. */
function declarationQuarterOptions(date: string): string[] {
  const natural = quarterKeyOf(date || new Date().toISOString().slice(0, 10));
  const options: string[] = [];
  let q = nextQuarterKey(natural);
  for (let i = 0; i < 3; i++) {
    options.push(q);
    q = nextQuarterKey(q);
  }
  return options;
}

function fileNameOf(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

/** Placeholder shown in place of an extractable field's input while extraction is running, so
 * the form doesn't look empty/broken during the 1-3s it takes — it reads as "loading," not
 * "nothing found." */
function FieldSkeleton({ className = "h-9" }: { className?: string }) {
  return <div className={`${className} rounded-control bg-surface-alt animate-pulse`} />;
}

function computedIrpfAmount(form: FormState, autoManaged: boolean): string {
  if (!autoManaged || !form.irpfRate.trim()) return form.irpfAmount;
  const rate = Number(form.irpfRate);
  const base = Number(form.amount);
  if (Number.isNaN(rate) || Number.isNaN(base)) return form.irpfAmount;
  return ((base * rate) / 100).toFixed(2);
}

type FieldErrors = Partial<Record<"date" | "amount", string>>;

export function GastoForm({ mode, expenseId, initialFilePath, onSaved, onCancel }: GastoFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(mode === "edit");
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [categories, setCategories] = useState<ExpenseCategoryRecord[]>([]);
  const [declared, setDeclared] = useState(false);
  // Tracks whether irpfAmount should keep auto-recomputing from rate × amount, or has been
  // taken over by a manual/OCR-extracted value it shouldn't clobber. State, not a ref: its
  // value feeds a render-time derived value (irpfAmountDisplay below), and refs can't be
  // read during render.
  const [irpfAutoManaged, setIrpfAutoManaged] = useState(true);
  const irpfAmountDisplay = computedIrpfAmount(form, irpfAutoManaged);
  const [extractionToast, setExtractionToast] = useState<{ tone: ToastTone; message: string } | null>(
    null,
  );

  useEffect(() => {
    listExpenseCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (mode !== "edit" || expenseId === undefined) return;
    let cancelled = false;
    getExpense(expenseId)
      .then((expense) => {
        if (cancelled) return;
        if (expense) {
          setIrpfAutoManaged(expense.irpfAmount === null);
          setDeclared(expense.declared);
          setForm(toFormState(expense));
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, expenseId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const attachFromPath = useCallback(
    async (source: string) => {
      setAttaching(true);
      setSaveError(null);
      try {
        // Best-effort field extraction, run before attaching so a real receipt date (not today's
        // fallback) is available for the attach-time filename below. Prefer the LLM-based
        // extractor when the configured provider has an API key set — it works for images too,
        // and also matches a category. Fall back to the regex PDF extractor if no key is set, or
        // the LLM call fails.
        const llmSettings = await getLlmSettings().catch(() => null);
        const apiKey = llmSettings ? activeApiKey(llmSettings) : null;
        let extracted: (ReceiptFields & { category?: string | null }) | null = null;
        let llmFailed = false;
        if (llmSettings && apiKey) {
          // Fetched fresh here rather than reading the `categories` state: this can run from the
          // initial-file-attach effect on mount (drag-and-drop), which races the effect that
          // populates `categories` — a stale empty array would tell the LLM there's nothing to
          // match against, so every extraction would come back with no category.
          const categoryNames = (await listExpenseCategories()).map((c) => c.name);
          extracted = await extractReceiptFieldsLlm(
            source,
            llmSettings.provider,
            apiKey,
            llmSettings.openrouterModel,
            categoryNames,
          ).catch((err) => {
            // Falls back to the regex extractor below, which has no concept of category at all
            // — so a silent LLM failure here would otherwise look identical to "the model
            // couldn't determine a category." Logged instead of shown inline since this is a
            // best-effort enhancement, not a blocking error.
            console.error("LLM receipt extraction failed, falling back to regex extraction:", err);
            llmFailed = true;
            return null;
          });
        }
        if (!extracted && source.toLowerCase().endsWith(".pdf")) {
          extracted = await extractReceiptFields(source).catch(() => null);
        }

        // Tells the user what actually happened, since the form auto-fills silently otherwise
        // and a bad or missing extraction would look identical to "nothing to check."
        if (llmFailed) {
          setExtractionToast({
            tone: "warning",
            message: extracted ? t("expenses.extraction.fallback") : t("expenses.extraction.none"),
          });
        } else if (llmSettings && apiKey) {
          setExtractionToast({ tone: "success", message: t("expenses.extraction.llm") });
        } else if (extracted) {
          setExtractionToast({ tone: "info", message: t("expenses.extraction.basic") });
        } else {
          setExtractionToast({ tone: "warning", message: t("expenses.extraction.none") });
        }

        // ponytail: falls back to today's date and a generic note when the form has nothing
        // typed yet and extraction found nothing either.
        const date = form.date || extracted?.date || new Date().toISOString().slice(0, 10);
        const note =
          form.description.trim() || form.category.trim() || extracted?.vendorGuess || "gasto";
        const stored = await attachExpenseFile(source, date, note);

        // An OCR-extracted retention amount is authoritative (it's read off the vendor's own
        // printed figure), so stop the rate×amount auto-compute effect from overwriting it later.
        if (extracted?.irpfAmount != null && !form.irpfAmount) {
          setIrpfAutoManaged(false);
        }

        setForm((f) => ({
          ...f,
          receiptFilePath: stored,
          date: f.date || extracted?.date || f.date,
          amount: f.amount || (extracted?.amount != null ? String(extracted.amount) : f.amount),
          ivaAmount:
            f.ivaAmount ||
            (extracted?.ivaAmount != null ? String(extracted.ivaAmount) : f.ivaAmount),
          irpfRate:
            f.irpfRate || (extracted?.irpfRate != null ? String(extracted.irpfRate) : f.irpfRate),
          irpfAmount:
            f.irpfAmount ||
            (extracted?.irpfAmount != null ? String(extracted.irpfAmount) : f.irpfAmount),
          description: f.description || extracted?.vendorGuess || f.description,
          category: f.category || extracted?.category || f.category,
        }));
      } catch {
        setSaveError(t("expenses.errors.attachFailed"));
      } finally {
        setAttaching(false);
      }
    },
    [form, t],
  );

  async function handleAttachFile() {
    const source = await pickExpenseFile();
    if (!source) return;
    await attachFromPath(source);
  }

  // Guards against React StrictMode's dev-only double-invoke re-running the file copy twice;
  // a ref survives the double-mount because it's the same component instance.
  const initialFileHandledRef = useRef(false);
  useEffect(() => {
    if (!initialFilePath || initialFileHandledRef.current) return;
    initialFileHandledRef.current = true;
    void attachFromPath(initialFilePath);
  }, [initialFilePath, attachFromPath]);

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!form.date) next.date = t("expenses.errors.dateRequired");
    if (!form.amount.trim() || Number.isNaN(Number(form.amount))) {
      next.amount = t("expenses.errors.amountRequired");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    setSaveError(null);
    if (!validate()) return;

    const payload: NewExpense = {
      date: form.date,
      category: form.category.trim() || null,
      description: form.description.trim() || null,
      amount: Number(form.amount),
      ivaAmount: form.ivaAmount.trim() ? Number(form.ivaAmount) : null,
      deductiblePct: form.deductiblePct.trim() ? Number(form.deductiblePct) : 100,
      irpfRate: form.irpfRate.trim() ? Number(form.irpfRate) : null,
      irpfAmount: irpfAmountDisplay.trim() ? Number(irpfAmountDisplay) : null,
      receiptFilePath: form.receiptFilePath,
      declaredPeriod: form.declaredPeriod || null,
      declared,
    };

    setSaving(true);
    try {
      if (mode === "create") {
        const created = await createExpense(payload);
        onSaved(created);
      } else {
        await updateExpense(expenseId!, payload);
        const updated = await getExpense(expenseId!);
        if (updated) onSaved(updated);
      }
    } catch {
      setSaveError(t("expenses.errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="px-8 pb-15">
        <div className="text-sm text-ink-soft">{t("expenses.loading")}</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-8 pb-15">
        <div className="text-sm text-danger">{t("expenses.errors.loadFailed")}</div>
      </div>
    );
  }

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title={mode === "create" ? t("expenses.newExpense") : t("expenses.editExpense")}
        backLabel={t("expenses.title")}
        onBack={onCancel}
      />

      <Card className="px-5 max-w-[640px]">
        <FormRow label={t("expenses.fields.date")} error={errors.date}>
          {attaching ? (
            <FieldSkeleton />
          ) : (
            <TextInput
              type="date"
              value={form.date}
              error={!!errors.date}
              onChange={(e) => set("date", e.target.value)}
            />
          )}
        </FormRow>

        <FormRow label={t("expenses.fields.declaredPeriod")}>
          <Select
            value={form.declaredPeriod}
            onChange={(e) => set("declaredPeriod", e.target.value)}
          >
            <option value="">
              {t("expenses.fields.declaredPeriodAuto", {
                quarter: quarterKeyLabel(
                  quarterKeyOf(form.date || new Date().toISOString().slice(0, 10)),
                ),
              })}
            </option>
            {declarationQuarterOptions(form.date).map((key) => (
              <option key={key} value={key}>
                {quarterKeyLabel(key)}
              </option>
            ))}
          </Select>
        </FormRow>

        <FormRow label={t("expenses.fields.category")}>
          {attaching ? (
            <FieldSkeleton />
          ) : (
            <Select value={form.category} onChange={(e) => set("category", e.target.value)}>
              <option value="">{t("expenses.fields.noCategory")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </FormRow>

        <FormRow label={t("expenses.fields.description")}>
          {attaching ? (
            <FieldSkeleton className="h-[60px]" />
          ) : (
            <TextArea
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          )}
        </FormRow>

        <FormRow label={t("expenses.fields.amount")} error={errors.amount}>
          {attaching ? (
            <FieldSkeleton />
          ) : (
            <TextInput
              type="number"
              step="0.01"
              mono
              value={form.amount}
              error={!!errors.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          )}
        </FormRow>

        <FormRow label={t("expenses.fields.ivaAmount")}>
          {attaching ? (
            <FieldSkeleton />
          ) : (
            <TextInput
              type="number"
              step="0.01"
              mono
              value={form.ivaAmount}
              onChange={(e) => set("ivaAmount", e.target.value)}
            />
          )}
        </FormRow>

        <FormRow label={t("expenses.fields.deductiblePct")}>
          <TextInput
            type="number"
            step="1"
            min="0"
            max="100"
            mono
            value={form.deductiblePct}
            onChange={(e) => set("deductiblePct", e.target.value)}
          />
        </FormRow>

        <FormRow label={t("expenses.fields.irpfRate")}>
          {attaching ? (
            <FieldSkeleton />
          ) : (
            <TextInput
              type="number"
              step="0.01"
              mono
              value={form.irpfRate}
              onChange={(e) => set("irpfRate", e.target.value)}
            />
          )}
        </FormRow>

        <FormRow label={t("expenses.fields.irpfAmount")}>
          {attaching ? (
            <FieldSkeleton />
          ) : (
            <TextInput
              type="number"
              step="0.01"
              mono
              value={irpfAmountDisplay}
              onChange={(e) => {
                setIrpfAutoManaged(e.target.value === "");
                set("irpfAmount", e.target.value);
              }}
            />
          )}
        </FormRow>

        <FormRow label={t("expenses.fields.file")}>
          <div className="flex items-center gap-2.5">
            <Button variant="secondary" onClick={handleAttachFile} disabled={attaching}>
              {attaching ? t("expenses.actions.attaching") : t("expenses.actions.attachFile")}
            </Button>
            {form.receiptFilePath && (
              <span className="text-[13px] text-ink-soft truncate">
                {fileNameOf(form.receiptFilePath)}
              </span>
            )}
          </div>
        </FormRow>
      </Card>

      {saveError && <ErrorText>{saveError}</ErrorText>}
      <Toast
        message={extractionToast?.message ?? null}
        tone={extractionToast?.tone}
        onDismiss={() => setExtractionToast(null)}
      />
      <div className="flex gap-2.5 justify-end mt-5">
        <Button variant="secondary" onClick={onCancel} disabled={saving || attaching}>
          {t("expenses.actions.cancel")}
        </Button>
        <Button onClick={handleSubmit} disabled={saving || attaching}>
          {saving ? t("expenses.actions.saving") : t("expenses.actions.save")}
        </Button>
      </div>
    </div>
  );
}
