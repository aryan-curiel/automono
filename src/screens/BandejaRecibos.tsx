import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Tray } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Select, TextInput } from "../components/ui/Field";
import { PageHeader } from "../components/PageHeader";
import { createExpense, deleteExpenseFiles, openExpenseFile } from "../db/expenses";
import { listExpenseCategories } from "../db/expenseCategories";
import type { ExpenseCategoryRecord } from "../db/expenseCategories";
import { getPreferences } from "../db/preferences";
import {
  deleteReceiptInboxItem,
  listReceiptInbox,
  pickReceiptFiles,
  ingestReceipt,
} from "../db/receiptInbox";
import type { ReceiptInboxItem } from "../db/receiptInbox";

interface BandejaRecibosProps {
  /** Bumped by App after a folder sweep so a mounted queue refetches. */
  refreshToken: number;
  /** Notifies App that the queue changed, so the sidebar badge refreshes. */
  onChanged: () => void;
  onOpenSettings: () => void;
  /** Rendered as the "Bandeja" tab inside Gastos — Gastos owns the PageHeader. */
  embedded?: boolean;
}

const IMAGE_EXT = ["png", "jpg", "jpeg"];

function isImage(path: string): boolean {
  return IMAGE_EXT.includes(path.split(".").pop()?.toLowerCase() ?? "");
}

export function BandejaRecibos({
  refreshToken,
  onChanged,
  onOpenSettings,
  embedded = false,
}: BandejaRecibosProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ReceiptInboxItem[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    void listExpenseCategories().then(setCategories);
    void getPreferences().then((p) => setConfigured(p.receiptInboxEnabled && !!p.receiptInboxPath));
  }, [refreshToken]);

  useEffect(() => {
    let cancelled = false;
    void listReceiptInbox()
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  async function refresh() {
    setItems(await listReceiptInbox());
    onChanged();
  }

  async function handleAdd() {
    const paths = await pickReceiptFiles();
    if (paths.length === 0) return;
    setAdding(true);
    try {
      for (const p of paths) await ingestReceipt(p, false);
      await refresh();
    } finally {
      setAdding(false);
    }
  }

  const addButton = (
    <Button variant="secondary" onClick={() => void handleAdd()} disabled={adding}>
      {adding ? t("receiptInbox.adding") : t("receiptInbox.addReceipt")}
    </Button>
  );

  return (
    <div className={embedded ? "" : "px-8 pb-15"}>
      {embedded ? (
        <div className="flex items-center justify-between mb-4">
          <div className="text-[12px] text-ink-soft">
            {items.length > 0 ? t("receiptInbox.subtitleCount", { count: items.length }) : ""}
          </div>
          {addButton}
        </div>
      ) : (
        <PageHeader
          title={t("receiptInbox.title")}
          subtitle={
            items.length > 0 ? t("receiptInbox.subtitleCount", { count: items.length }) : undefined
          }
          actions={addButton}
        />
      )}

      {!loading && items.length === 0 && (
        <Card className="px-6 py-10 flex flex-col items-center text-center gap-2 max-w-[560px]">
          <Tray size={28} weight="regular" className="text-ink-soft" />
          <div className="text-sm font-semibold">{t("receiptInbox.emptyTitle")}</div>
          <div className="text-[13px] text-ink-soft">
            {configured ? t("receiptInbox.emptyConfigured") : t("receiptInbox.emptyNotConfigured")}
          </div>
          {!configured && (
            <Button variant="secondary" className="mt-1" onClick={onOpenSettings}>
              {t("receiptInbox.goToSettings")}
            </Button>
          )}
        </Card>
      )}

      <div className="flex flex-col gap-4 max-w-[720px]">
        {items.map((item) => (
          <QueueCard
            key={item.id}
            item={item}
            categories={categories}
            onDone={() => void refresh()}
          />
        ))}
      </div>
    </div>
  );
}

interface QueueCardProps {
  item: ReceiptInboxItem;
  categories: ExpenseCategoryRecord[];
  onDone: () => void;
}

function QueueCard({ item, categories, onDone }: QueueCardProps) {
  const { t } = useTranslation();
  const [date, setDate] = useState(item.date ?? "");
  const [amount, setAmount] = useState(item.amount != null ? String(item.amount) : "");
  const [provider, setProvider] = useState(item.vendor ?? "");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState(item.vendor ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = !!date && !!amount.trim() && !Number.isNaN(Number(amount)) && !busy;

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await createExpense({
        date,
        category: category.trim() || null,
        provider: provider.trim() || null,
        description: description.trim() || null,
        amount: Number(amount),
        ivaAmount: item.ivaAmount,
        deductiblePct: 100,
        ivaDeductiblePct: null,
        irpfRate: item.irpfRate,
        irpfAmount: item.irpfAmount,
        receiptFilePath: item.receiptFilePath,
        declaredPeriod: null,
        declared: false,
        paidDate: null,
      });
      await deleteReceiptInboxItem(item.id);
      onDone();
    } catch {
      setError(t("receiptInbox.confirmFailed"));
      setBusy(false);
    }
  }

  async function handleDiscard() {
    setBusy(true);
    setError(null);
    try {
      await deleteExpenseFiles([item.receiptFilePath]);
      await deleteReceiptInboxItem(item.id);
      onDone();
    } catch {
      setError(t("receiptInbox.discardFailed"));
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 flex gap-4">
      <div className="w-[132px] shrink-0">
        {isImage(item.receiptFilePath) ? (
          <img
            src={convertFileSrc(item.receiptFilePath)}
            alt={item.sourceName}
            className="w-full h-[132px] object-cover rounded-control bg-surface-alt border border-border"
          />
        ) : (
          <button
            type="button"
            onClick={() => void openExpenseFile(item.receiptFilePath)}
            className="w-full h-[132px] rounded-control bg-surface-alt border border-border flex flex-col items-center justify-center gap-1.5 cursor-pointer text-ink-soft hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Tray size={22} weight="regular" />
            <span className="text-[11px] font-medium">{t("receiptInbox.openPdf")}</span>
          </button>
        )}
        <div className="text-[11px] text-ink-soft mt-1.5 truncate" title={item.sourceName}>
          {item.sourceName}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <TextInput
            type="number"
            step="0.01"
            mono
            placeholder={t("receiptInbox.amount")}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <TextInput
            placeholder={t("receiptInbox.provider")}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          />
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t("receiptInbox.noCategory")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <TextInput
          placeholder={t("receiptInbox.description")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && <p className="text-danger text-xs">{error}</p>}
        <div className="flex gap-2 mt-1">
          <Button onClick={() => void handleConfirm()} disabled={!canConfirm}>
            {t("receiptInbox.confirm")}
          </Button>
          <Button variant="ghost-danger" onClick={() => void handleDiscard()} disabled={busy}>
            {t("receiptInbox.discard")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
