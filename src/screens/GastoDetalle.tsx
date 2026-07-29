import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ErrorText, Label, TextInput } from "../components/ui/Field";
import { BackLink } from "../components/PageHeader";
import { deleteExpense, getExpense, openExpenseFile } from "../db/expenses";
import type { ExpenseRecord } from "../db/expenses";
import { formatDate, formatEUR } from "../lib/format";

interface GastoDetalleProps {
  expenseId: number;
  onBack: () => void;
  onEditExpense: (id: number) => void;
  onDeleted: () => void;
}

export function GastoDetalle({ expenseId, onBack, onEditExpense, onDeleted }: GastoDetalleProps) {
  const { t } = useTranslation();
  const [expense, setExpense] = useState<ExpenseRecord | null>(null);
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const loading = loadedId !== expenseId && !loadError;

  useEffect(() => {
    let cancelled = false;
    getExpense(expenseId)
      .then((e) => {
        if (cancelled || !e) return;
        setExpense(e);
        setLoadedId(expenseId);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  async function handleDelete() {
    if (!expense) return;
    if (!window.confirm(t("expenses.actions.confirmDelete"))) return;
    await deleteExpense(expense.id);
    onDeleted();
  }

  async function handleOpenFile() {
    if (!expense?.receiptFilePath) return;
    setOpenError(null);
    try {
      await openExpenseFile(expense.receiptFilePath);
    } catch (err) {
      setOpenError(String(err));
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

  if (!expense) return null;

  const deductibleIva = (expense.ivaAmount ?? 0) * (expense.deductiblePct / 100);

  return (
    <div className="px-10 pt-8 pb-15">
      <BackLink label={t("expenses.title")} onClick={onBack} />

      <div className="flex items-start justify-between mb-5.5">
        <div>
          <h1 className="font-extrabold text-2xl tracking-tight m-0 mb-1.5">
            {expense.description || expense.category || formatDate(expense.date)}
          </h1>
          <div className="text-sm text-ink-soft">{formatDate(expense.date)}</div>
        </div>
        <div className="flex gap-2.5 shrink-0">
          <Button variant="secondary" onClick={() => onEditExpense(expense.id)}>
            {t("expenses.actions.edit")}
          </Button>
          <Button variant="ghost-danger" onClick={handleDelete}>
            {t("expenses.actions.delete")}
          </Button>
        </div>
      </div>

      <Card className="p-5.5 max-w-[640px]">
        <div className="font-bold text-sm mb-4">{t("expenses.detail.dataTitle")}</div>

        <div className="grid grid-cols-2 gap-3.5 mb-3.5">
          <div>
            <Label>{t("expenses.fields.category")}</Label>
            <TextInput readOnly value={expense.category ?? ""} />
          </div>
          <div>
            <Label>{t("expenses.fields.amount")}</Label>
            <TextInput readOnly mono value={formatEUR(expense.amount)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3.5 mb-3.5">
          <div>
            <Label>{t("expenses.fields.ivaAmount")}</Label>
            <TextInput readOnly mono value={formatEUR(expense.ivaAmount ?? 0)} />
          </div>
          <div>
            <Label>{t("expenses.fields.deductiblePct")}</Label>
            <TextInput
              readOnly
              mono
              value={`${expense.deductiblePct}% (${formatEUR(deductibleIva)})`}
            />
          </div>
        </div>

        <div>
          <Label>{t("expenses.fields.file")}</Label>
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              onClick={handleOpenFile}
              disabled={!expense.receiptFilePath}
            >
              {t("expenses.actions.openFile")}
            </Button>
            {!expense.receiptFilePath && (
              <span className="text-xs text-ink-soft">{t("expenses.fields.noFile")}</span>
            )}
          </div>
          {openError && <ErrorText>{openError}</ErrorText>}
        </div>
      </Card>
    </div>
  );
}
