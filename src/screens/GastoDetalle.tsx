import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DotsThreeVertical } from "@phosphor-icons/react";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ErrorText } from "../components/ui/Field";
import { InfoRow } from "../components/ui/InfoRow";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
import { Sheet } from "../components/ui/Sheet";
import { BackLink, PageHeader } from "../components/PageHeader";
import {
  deleteExpense,
  deleteExpenseFiles,
  getExpense,
  openExpenseFile,
  updateExpense,
} from "../db/expenses";
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
  const [deletePending, setDeletePending] = useState(false);
  const loading = loadedId !== expenseId && !loadError;

  // Clears a stale error from a previous expenseId as soon as the id changes, so the error
  // screen doesn't flash while the fresh fetch below is in flight — done during render (not in
  // the effect) since it's purely reacting to a changed prop, matching the pattern already used
  // for ModeloReviewModal's per-batch reset.
  const [lastAttemptedId, setLastAttemptedId] = useState(expenseId);
  if (lastAttemptedId !== expenseId) {
    setLastAttemptedId(expenseId);
    setLoadError(false);
  }

  useEffect(() => {
    let cancelled = false;
    getExpense(expenseId)
      .then((e) => {
        if (cancelled) return;
        if (!e) {
          setLoadError(true);
          return;
        }
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

  async function confirmDelete() {
    if (!expense) return;
    try {
      const filePaths = [expense.receiptFilePath].filter((p): p is string => !!p);
      await deleteExpenseFiles(filePaths);
      await deleteExpense(expense.id);
      onDeleted();
    } catch (err) {
      setOpenError(String(err));
      setDeletePending(false);
    }
  }

  async function toggleDeclared() {
    if (!expense) return;
    try {
      await updateExpense(expense.id, { declared: !expense.declared });
      const updated = await getExpense(expense.id);
      if (updated) setExpense(updated);
    } catch (err) {
      setOpenError(String(err));
    }
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
        <BackLink label={t("expenses.title")} onClick={onBack} />
        <div className="text-sm text-ink-soft">{t("expenses.loading")}</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-8 pb-15">
        <BackLink label={t("expenses.title")} onClick={onBack} />
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
        title={
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate min-w-0">
              {expense.description || expense.category || formatDate(expense.date)}
            </span>
            {expense.declared && (
              <span className="shrink-0">
                <Badge tone="success">{t("expenses.declaredBadge")}</Badge>
              </span>
            )}
          </span>
        }
        subtitle={formatDate(expense.date)}
        actions={
          <>
            <Button variant="secondary" onClick={() => onEditExpense(expense.id)}>
              {t("expenses.actions.edit")}
            </Button>
            <Menu>
              <MenuTrigger
                className="p-2 rounded-control hover:bg-surface-alt cursor-pointer"
                aria-label={t("expenses.detail.moreActions")}
              >
                <DotsThreeVertical size={16} weight="bold" />
              </MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={() => void toggleDeclared()}>
                  {expense.declared
                    ? t("expenses.actions.unmarkDeclared")
                    : t("expenses.actions.markDeclared")}
                </MenuItem>
                <MenuItem danger onSelect={() => setDeletePending(true)}>
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
        <InfoRow
          label={t("expenses.fields.category")}
          value={expense.category || t("expenses.fields.noCategory")}
        />
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
                onClick={() => void handleOpenFile(expense.receiptFilePath)}
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
      </Card>
      {openError && <ErrorText>{openError}</ErrorText>}

      <Sheet
        open={deletePending}
        onOpenChange={setDeletePending}
        title={t("expenses.actions.delete")}
      >
        <p className="text-[13px] text-ink-soft mb-4">{t("expenses.actions.confirmDelete")}</p>
        <div className="flex gap-2.5 justify-end">
          <Button variant="secondary" onClick={() => setDeletePending(false)}>
            {t("expenses.actions.cancel")}
          </Button>
          <Button variant="ghost-danger" onClick={() => void confirmDelete()}>
            {t("expenses.actions.delete")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
