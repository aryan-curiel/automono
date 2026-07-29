import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ErrorText, Label, TextArea, TextInput } from "../components/ui/Field";
import { BackLink } from "../components/PageHeader";
import {
  attachExpenseFile,
  createExpense,
  getExpense,
  pickExpenseFile,
  updateExpense,
} from "../db/expenses";
import type { ExpenseRecord, NewExpense } from "../db/expenses";

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
  receiptFilePath: string | null;
}

const CATEGORY_SUGGESTIONS = [
  "Suministros",
  "Material",
  "Software",
  "Alquiler",
  "Transporte",
  "Otros",
];

function emptyForm(): FormState {
  return {
    date: "",
    category: "",
    description: "",
    amount: "",
    ivaAmount: "",
    deductiblePct: "100",
    receiptFilePath: null,
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
    receiptFilePath: expense.receiptFilePath,
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
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "edit" || expenseId === undefined) return;
    let cancelled = false;
    getExpense(expenseId)
      .then((expense) => {
        if (cancelled) return;
        if (expense) setForm(toFormState(expense));
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

  async function handleAttachFile() {
    const source = await pickExpenseFile();
    if (!source) return;
    setAttaching(true);
    setSaveError(null);
    try {
      const stored = await attachExpenseFile(source);
      set("receiptFilePath", stored);
    } catch {
      setSaveError(t("expenses.errors.attachFailed"));
    } finally {
      setAttaching(false);
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
      receiptFilePath: form.receiptFilePath,
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
      <div className="px-10 pt-8 pb-15">
        <div className="text-sm text-ink-soft">{t("expenses.loading")}</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-10 pt-8 pb-15">
        <div className="text-sm text-danger">{t("expenses.errors.loadFailed")}</div>
      </div>
    );
  }

  return (
    <div className="px-10 pt-8 pb-15">
      <BackLink label={t("expenses.title")} onClick={onCancel} />
      <h1 className="font-extrabold text-2xl tracking-tight m-0 mb-5.5">
        {mode === "create" ? t("expenses.newExpense") : t("expenses.editExpense")}
      </h1>

      <Card className="p-5.5 max-w-[640px]">
        <div className="grid grid-cols-2 gap-3.5 mb-3.5">
          <div>
            <Label>{t("expenses.fields.date")}</Label>
            <TextInput
              type="date"
              value={form.date}
              error={!!errors.date}
              onChange={(e) => set("date", e.target.value)}
            />
            {errors.date && <ErrorText>{errors.date}</ErrorText>}
          </div>
          <div>
            <Label>{t("expenses.fields.category")}</Label>
            <TextInput
              list="expense-categories"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            />
            <datalist id="expense-categories">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="mb-3.5">
          <Label>{t("expenses.fields.description")}</Label>
          <TextArea
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-3 gap-3.5 mb-3.5">
          <div>
            <Label>{t("expenses.fields.amount")}</Label>
            <TextInput
              type="number"
              step="0.01"
              mono
              value={form.amount}
              error={!!errors.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
            {errors.amount && <ErrorText>{errors.amount}</ErrorText>}
          </div>
          <div>
            <Label>{t("expenses.fields.ivaAmount")}</Label>
            <TextInput
              type="number"
              step="0.01"
              mono
              value={form.ivaAmount}
              onChange={(e) => set("ivaAmount", e.target.value)}
            />
          </div>
          <div>
            <Label>{t("expenses.fields.deductiblePct")}</Label>
            <TextInput
              type="number"
              step="1"
              min="0"
              max="100"
              mono
              value={form.deductiblePct}
              onChange={(e) => set("deductiblePct", e.target.value)}
            />
          </div>
        </div>

        <div className="mb-4.5">
          <Label>{t("expenses.fields.file")}</Label>
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
        </div>

        {saveError && <ErrorText>{saveError}</ErrorText>}

        <div className="flex gap-2.5 mt-4.5">
          <Button onClick={handleSubmit} disabled={saving}>
            {t("expenses.actions.save")}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            {t("expenses.actions.cancel")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
