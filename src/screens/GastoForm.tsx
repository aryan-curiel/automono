import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ErrorText, Select, TextArea, TextInput } from "../components/ui/Field";
import { FormRow } from "../components/ui/FormRow";
import { PageHeader } from "../components/PageHeader";
import {
  attachExpenseFile,
  attachExpensePaymentProof,
  createExpense,
  extractReceiptFields,
  getExpense,
  pickExpenseFile,
  updateExpense,
} from "../db/expenses";
import type { ExpenseRecord, NewExpense } from "../db/expenses";
import { listExpenseCategories } from "../db/expenseCategories";
import type { ExpenseCategoryRecord } from "../db/expenseCategories";

interface GastoFormProps {
  mode: "create" | "edit";
  expenseId?: number;
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
  paymentProofFilePath: string | null;
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
    paymentProofFilePath: null,
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
    paymentProofFilePath: expense.paymentProofFilePath,
  };
}

function fileNameOf(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

type FieldErrors = Partial<Record<"date" | "amount", string>>;

export function GastoForm({ mode, expenseId, onSaved, onCancel }: GastoFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(mode === "edit");
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [attachingProof, setAttachingProof] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [categories, setCategories] = useState<ExpenseCategoryRecord[]>([]);
  // Tracks whether irpfAmount should keep auto-recomputing from rate × amount, or has been
  // taken over by a manual/OCR-extracted value it shouldn't clobber.
  const irpfAutoManaged = useRef(true);

  useEffect(() => {
    listExpenseCategories().then(setCategories);
  }, []);

  useEffect(() => {
    if (mode !== "edit" || expenseId === undefined) return;
    let cancelled = false;
    getExpense(expenseId)
      .then((expense) => {
        if (cancelled) return;
        if (expense) {
          irpfAutoManaged.current = expense.irpfAmount === null;
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

  useEffect(() => {
    if (!irpfAutoManaged.current) return;
    const rate = Number(form.irpfRate);
    const base = Number(form.amount);
    if (!form.irpfRate.trim() || Number.isNaN(rate) || Number.isNaN(base)) return;
    const computed = ((base * rate) / 100).toFixed(2);
    setForm((f) => (f.irpfAmount === computed ? f : { ...f, irpfAmount: computed }));
  }, [form.amount, form.irpfRate]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleAttachFile() {
    const source = await pickExpenseFile();
    if (!source) return;
    setAttaching(true);
    setSaveError(null);
    try {
      // Best-effort PDF text extraction, run before attaching so a real receipt date (not
      // today's fallback) is available for the attach-time filename below.
      const extracted = source.toLowerCase().endsWith(".pdf")
        ? await extractReceiptFields(source).catch(() => null)
        : null;

      // ponytail: falls back to today's date and a generic note when the form has nothing
      // typed yet and extraction found nothing either.
      const date = form.date || extracted?.date || new Date().toISOString().slice(0, 10);
      const note =
        form.description.trim() || form.category.trim() || extracted?.vendorGuess || "gasto";
      const stored = await attachExpenseFile(source, date, note);

      // An OCR-extracted retention amount is authoritative (it's read off the vendor's own
      // printed figure), so stop the rate×amount auto-compute effect from overwriting it later.
      if (extracted?.irpfAmount != null && !form.irpfAmount) {
        irpfAutoManaged.current = false;
      }

      setForm((f) => ({
        ...f,
        receiptFilePath: stored,
        date: f.date || extracted?.date || f.date,
        amount: f.amount || (extracted?.amount != null ? String(extracted.amount) : f.amount),
        ivaAmount:
          f.ivaAmount || (extracted?.ivaAmount != null ? String(extracted.ivaAmount) : f.ivaAmount),
        irpfRate:
          f.irpfRate || (extracted?.irpfRate != null ? String(extracted.irpfRate) : f.irpfRate),
        irpfAmount:
          f.irpfAmount ||
          (extracted?.irpfAmount != null ? String(extracted.irpfAmount) : f.irpfAmount),
        description: f.description || extracted?.vendorGuess || f.description,
      }));
    } catch {
      setSaveError(t("expenses.errors.attachFailed"));
    } finally {
      setAttaching(false);
    }
  }

  async function handleAttachPaymentProof() {
    const source = await pickExpenseFile();
    if (!source) return;
    setAttachingProof(true);
    setSaveError(null);
    try {
      const date = form.date || new Date().toISOString().slice(0, 10);
      const note = form.description.trim() || form.category.trim() || "gasto";
      const stored = await attachExpensePaymentProof(source, date, note);
      set("paymentProofFilePath", stored);
    } catch {
      setSaveError(t("expenses.errors.attachFailed"));
    } finally {
      setAttachingProof(false);
    }
  }

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
      irpfAmount: form.irpfAmount.trim() ? Number(form.irpfAmount) : null,
      receiptFilePath: form.receiptFilePath,
      paymentProofFilePath: form.paymentProofFilePath,
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
          <TextInput
            type="date"
            value={form.date}
            error={!!errors.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </FormRow>

        <FormRow label={t("expenses.fields.category")}>
          <Select value={form.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">{t("expenses.fields.noCategory")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormRow>

        <FormRow label={t("expenses.fields.description")}>
          <TextArea
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </FormRow>

        <FormRow label={t("expenses.fields.amount")} error={errors.amount}>
          <TextInput
            type="number"
            step="0.01"
            mono
            value={form.amount}
            error={!!errors.amount}
            onChange={(e) => set("amount", e.target.value)}
          />
        </FormRow>

        <FormRow label={t("expenses.fields.ivaAmount")}>
          <TextInput
            type="number"
            step="0.01"
            mono
            value={form.ivaAmount}
            onChange={(e) => set("ivaAmount", e.target.value)}
          />
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
          <TextInput
            type="number"
            step="0.01"
            mono
            value={form.irpfRate}
            onChange={(e) => set("irpfRate", e.target.value)}
          />
        </FormRow>

        <FormRow label={t("expenses.fields.irpfAmount")}>
          <TextInput
            type="number"
            step="0.01"
            mono
            value={form.irpfAmount}
            onChange={(e) => {
              irpfAutoManaged.current = e.target.value === "";
              set("irpfAmount", e.target.value);
            }}
          />
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

        <FormRow label={t("expenses.fields.paymentProof")}>
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              onClick={handleAttachPaymentProof}
              disabled={attachingProof}
            >
              {attachingProof
                ? t("expenses.actions.attaching")
                : t("expenses.actions.attachPaymentProof")}
            </Button>
            {form.paymentProofFilePath && (
              <span className="text-[13px] text-ink-soft truncate">
                {fileNameOf(form.paymentProofFilePath)}
              </span>
            )}
          </div>
        </FormRow>
      </Card>

      {saveError && <ErrorText>{saveError}</ErrorText>}
      <div className="flex gap-2.5 justify-end mt-5">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          {t("expenses.actions.cancel")}
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {t("expenses.actions.save")}
        </Button>
      </div>
    </div>
  );
}
