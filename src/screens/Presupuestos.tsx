import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MagnifyingGlass, FileText, DotsThreeVertical } from "@phosphor-icons/react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/Field";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
import { Sheet } from "../components/ui/Sheet";
import { DataTable, type DataTableColumn } from "../components/ui/DataTable";
import { PageHeader } from "../components/PageHeader";
import { formatDate, formatEUR } from "../lib/format";
import { quoteStatusMeta } from "../lib/status";
import { quoteNumberLabel } from "../features/quotes/numbering";
import {
  convertQuoteToInvoice,
  deleteQuote,
  listQuotes,
  openOrGenerateQuotePdf,
  setQuoteStatus,
  type QuoteListItem,
  type QuoteStatus,
} from "../db/quotes";

const NEXT_STATUS: Partial<Record<QuoteStatus, QuoteStatus[]>> = {
  draft: ["sent"],
  sent: ["accepted", "rejected", "expired"],
  accepted: ["rejected"],
  rejected: ["sent"],
  expired: ["sent"],
};

interface PresupuestosProps {
  onOpenQuote: (id: number) => void;
  onNewQuote: () => void;
  onConverted: (invoiceId: number) => void;
  /** Bumped by App after an in-sheet quote form saves, so this list (which stays
   *  mounted behind the sheet) refetches. */
  refreshToken?: number;
}

export function Presupuestos({
  onOpenQuote,
  onNewQuote,
  onConverted,
  refreshToken,
}: PresupuestosProps) {
  const { t } = useTranslation();
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [deletePending, setDeletePending] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = () => setReloadToken((n) => n + 1);

  useEffect(() => {
    void listQuotes()
      .then(setQuotes)
      .finally(() => setLoading(false));
  }, [reloadToken, refreshToken]);

  const filtered = quotes.filter((q) =>
    `${quoteNumberLabel(q)} ${q.clientName}`.toLowerCase().includes(query.toLowerCase()),
  );

  const columns: DataTableColumn<QuoteListItem>[] = [
    {
      key: "number",
      header: t("quotes.columns.number"),
      width: "1.3fr",
      render: (q) => {
        const meta = quoteStatusMeta(q.status);
        return (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[13.5px] font-mono text-accent">
              {quoteNumberLabel(q)}
            </span>
            <Badge tone={meta.tone}>{t(meta.labelKey)}</Badge>
          </div>
        );
      },
    },
    {
      key: "client",
      header: t("quotes.columns.client"),
      width: "1.4fr",
      render: (q) => <div className="font-medium text-[13.5px]">{q.clientName}</div>,
    },
    {
      key: "validUntil",
      header: t("quotes.columns.validUntil"),
      width: "1fr",
      render: (q) => <div className="text-[13px] text-ink-soft">{formatDate(q.validUntil)}</div>,
    },
    {
      key: "amount",
      header: t("quotes.columns.amount"),
      width: "1fr",
      align: "right",
      render: (q) => (
        <div className="font-semibold text-[13.5px] font-mono text-right">{formatEUR(q.total)}</div>
      ),
    },
  ];

  async function changeStatus(id: number, status: QuoteStatus) {
    await setQuoteStatus(id, status);
    refresh();
  }

  async function convert(id: number) {
    const invoice = await convertQuoteToInvoice(id);
    onConverted(invoice.id);
  }

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title={t("quotes.title")}
        subtitle={t("quotes.subtitleCount", { count: filtered.length })}
        actions={
          <>
            <div className="relative">
              <MagnifyingGlass
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft"
              />
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("quotes.searchPlaceholder")}
                className="w-52 pl-8"
              />
            </div>
            <Button onClick={onNewQuote}>+ {t("quotes.newQuote")}</Button>
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(q) => q.id}
        onRowActivate={(q) => onOpenQuote(q.id)}
        loading={loading}
        padX="px-5.5"
        empty={
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <FileText size={32} className="text-ink-soft/40" />
            <div className="flex flex-col items-center gap-1.5">
              <div className="text-sm font-medium text-ink">
                {quotes.length === 0 ? t("quotes.empty") : t("quotes.noResults")}
              </div>
              {quotes.length === 0 && (
                <p className="max-w-xs text-sm text-ink-soft">{t("quotes.emptyHint")}</p>
              )}
            </div>
            {quotes.length === 0 && (
              <Button variant="secondary" onClick={onNewQuote}>
                + {t("quotes.newQuote")}
              </Button>
            )}
          </div>
        }
        rowMenu={(q) => {
          const transitions = NEXT_STATUS[q.status] ?? [];
          return (
            <Menu>
              <MenuTrigger className="p-1.5 rounded-control hover:bg-border cursor-pointer">
                <DotsThreeVertical size={16} weight="bold" />
              </MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={() => onOpenQuote(q.id)}>{t("common.viewDetail")}</MenuItem>
                <MenuItem onSelect={() => void openOrGenerateQuotePdf(q.id, true)}>
                  {t("quotes.actions.downloadPdf")}
                </MenuItem>
                {q.status === "accepted" && (
                  <MenuItem onSelect={() => void convert(q.id)}>
                    {t("quotes.actions.convert")}
                  </MenuItem>
                )}
                {transitions.map((s) => (
                  <MenuItem key={s} onSelect={() => void changeStatus(q.id, s)}>
                    {t("quotes.actions.markAs", { status: t(`quotes.status.${s}`) })}
                  </MenuItem>
                ))}
                {q.status !== "converted" && (
                  <MenuItem danger onSelect={() => setDeletePending(q.id)}>
                    {t("quotes.actions.delete")}
                  </MenuItem>
                )}
              </MenuContent>
            </Menu>
          );
        }}
      />

      <Sheet
        open={deletePending !== null}
        onOpenChange={(open) => !open && setDeletePending(null)}
        title={t("quotes.actions.delete")}
      >
        <p className="text-[13px] text-ink-soft mb-4">{t("quotes.actions.confirmDelete")}</p>
        <div className="flex gap-2.5 justify-end">
          <Button variant="secondary" onClick={() => setDeletePending(null)}>
            {t("invoices.detail.cancel")}
          </Button>
          <Button
            variant="ghost-danger"
            onClick={() => {
              if (deletePending !== null) void deleteQuote(deletePending).then(refresh);
              setDeletePending(null);
            }}
          >
            {t("quotes.actions.delete")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
