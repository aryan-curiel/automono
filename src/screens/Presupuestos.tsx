import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MagnifyingGlass, FileText, DotsThreeVertical } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/Field";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
import { Sheet } from "../components/ui/Sheet";
import { ListRow } from "../components/ui/ListRow";
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
}

export function Presupuestos({ onOpenQuote, onNewQuote, onConverted }: PresupuestosProps) {
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
  }, [reloadToken]);

  const filtered = quotes.filter((q) =>
    `${quoteNumberLabel(q)} ${q.clientName}`.toLowerCase().includes(query.toLowerCase()),
  );

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

      {loading ? (
        <Card className="overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[1.3fr_1.4fr_1fr_1fr_32px] py-3 px-5.5 border-t border-border first:border-t-0"
            >
              <div className="h-4 w-24 rounded bg-surface-alt animate-pulse" />
              <div className="h-4 w-28 rounded bg-surface-alt animate-pulse" />
              <div className="h-4 w-20 rounded bg-surface-alt animate-pulse" />
              <div className="h-4 w-16 rounded bg-surface-alt animate-pulse" />
            </div>
          ))}
        </Card>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <FileText size={32} className="text-ink-soft/40" />
          <div className="text-sm text-ink-soft">
            {quotes.length === 0 ? t("quotes.empty") : t("quotes.noResults")}
          </div>
          {quotes.length === 0 && (
            <Button variant="secondary" onClick={onNewQuote}>
              + {t("quotes.newQuote")}
            </Button>
          )}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1.3fr_1.4fr_1fr_1fr_32px] py-3 px-5.5 bg-surface-alt font-medium text-xs uppercase tracking-wide text-ink-soft">
            <div>{t("quotes.columns.number")}</div>
            <div>{t("quotes.columns.client")}</div>
            <div>{t("quotes.columns.validUntil")}</div>
            <div className="text-right">{t("quotes.columns.amount")}</div>
            <div />
          </div>
          {filtered.map((q) => {
            const meta = quoteStatusMeta(q.status);
            const transitions = NEXT_STATUS[q.status] ?? [];
            return (
              <ListRow
                key={q.id}
                onActivate={() => onOpenQuote(q.id)}
                className="group grid grid-cols-[1.3fr_1.4fr_1fr_1fr_32px] py-3 px-5.5 border-t border-border items-center"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[13.5px] font-mono text-accent">
                    {quoteNumberLabel(q)}
                  </span>
                  <Badge tone={meta.tone}>{t(meta.labelKey)}</Badge>
                </div>
                <div className="font-medium text-[13.5px]">{q.clientName}</div>
                <div className="text-[13px] text-ink-soft">{formatDate(q.validUntil)}</div>
                <div className="font-semibold text-[13.5px] font-mono text-right">
                  {formatEUR(q.total)}
                </div>
                <div
                  className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Menu>
                    <MenuTrigger className="p-1.5 rounded-control hover:bg-border cursor-pointer">
                      <DotsThreeVertical size={16} weight="bold" />
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => onOpenQuote(q.id)}>
                        {t("common.viewDetail")}
                      </MenuItem>
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
                </div>
              </ListRow>
            );
          })}
        </Card>
      )}

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
