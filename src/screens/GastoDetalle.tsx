import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DotsThreeVertical } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ErrorText } from "../components/ui/Field";
import { InfoRow } from "../components/ui/InfoRow";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
import { BackLink, PageHeader } from "../components/PageHeader";
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

  async function handleOpenFile(filePath: string | null | undefined) {
    if (!filePath) return;
    setOpenError(null);
    try {
      await openExpenseFile(filePath);
    } catch (err) {
      setOpenError(String(err));
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

  if (!expense) return null;

  const deductibleIva = (expense.ivaAmount ?? 0) * (expense.deductiblePct / 100);

  return (
    <div className="px-8 pb-15">
      <BackLink label={t("expenses.title")} onClick={onBack} />

      <PageHeader
        title={expense.description || expense.category || formatDate(expense.date)}
        subtitle={formatDate(expense.date)}
        actions={
          <>
            <Button variant="secondary" onClick={() => onEditExpense(expense.id)}>
              {t("expenses.actions.edit")}
            </Button>
            <Menu>
              <MenuTrigger className="p-2 rounded-control hover:bg-surface-alt cursor-pointer">
                <DotsThreeVertical size={16} weight="bold" />
              </MenuTrigger>
              <MenuContent>
                <MenuItem danger onSelect={handleDelete}>
                  {t("expenses.actions.delete")}
                </MenuItem>
              </MenuContent>
            </Menu>
          </>
        }
      />

      <Card className="px-5 py-1 max-w-[640px]">
        <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide pt-4 pb-2">
          {t("expenses.detail.dataTitle")}
        </div>
        <InfoRow label={t("expenses.fields.category")} value={expense.category || "—"} />
        <InfoRow label={t("expenses.fields.amount")} value={formatEUR(expense.amount)} mono />
        <InfoRow
          label={t("expenses.fields.ivaAmount")}
          value={formatEUR(expense.ivaAmount ?? 0)}
          mono
        />
        <InfoRow
          label={t("expenses.fields.deductiblePct")}
          value={`${expense.deductiblePct}% (${formatEUR(deductibleIva)})`}
          mono
        />
        {expense.irpfAmount !== null && (
          <InfoRow
            label={t("expenses.fields.irpfRate")}
            value={`${expense.irpfRate ?? 0}% (${formatEUR(expense.irpfAmount)})`}
            mono
          />
        )}
        <InfoRow
          label={t("expenses.fields.file")}
          value={
            <div className="flex items-center gap-2.5">
              <Button
                variant="secondary"
                onClick={() => handleOpenFile(expense.receiptFilePath)}
                disabled={!expense.receiptFilePath}
              >
                {t("expenses.actions.openFile")}
              </Button>
              {!expense.receiptFilePath && (
                <span className="text-xs text-ink-soft">{t("expenses.fields.noFile")}</span>
              )}
            </div>
          }
        />
        <InfoRow
          label={t("expenses.fields.paymentProof")}
          value={
            <div className="flex items-center gap-2.5">
              <Button
                variant="secondary"
                onClick={() => handleOpenFile(expense.paymentProofFilePath)}
                disabled={!expense.paymentProofFilePath}
              >
                {t("expenses.actions.openPaymentProof")}
              </Button>
              {!expense.paymentProofFilePath && (
                <span className="text-xs text-ink-soft">{t("expenses.fields.noPaymentProof")}</span>
              )}
            </div>
          }
        />
      </Card>
      {openError && <ErrorText>{openError}</ErrorText>}
    </div>
  );
}
