import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { HandCoins, DotsThreeVertical } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Sheet } from "../components/ui/Sheet";
import { TextInput, TextArea, Label } from "../components/ui/Field";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
import { ListRow } from "../components/ui/ListRow";
import { PageHeader } from "../components/PageHeader";
import { formatDate, formatEUR } from "../lib/format";
import { invoiceNumberLabel } from "../lib/invoice";
import { agingReport, outstandingAmount, type AgingBucket } from "../lib/analytics";
import { daysOverdue } from "../lib/lateInterest";
import { paymentReminder, lateInterestLetter, type CollectionsLocale } from "../lib/collections";
import { recordPayment, type InvoiceListItem } from "../db/invoices";
import type { BusinessProfileRecord } from "../db/businessProfile";

// Ley 3/2004: ECB reference + 8 points, republished by the BOE twice a year — a starting
// point the user corrects to the current published figure. Mirrors FacturaDetalle.
const DEFAULT_LATE_INTEREST_RATE_PCT = 8;

const BUCKET_LABEL_KEYS: Record<AgingBucket, string> = {
  current: "collections.buckets.current",
  "0-30": "collections.buckets.d0_30",
  "30-60": "collections.buckets.d30_60",
  "60+": "collections.buckets.d60_plus",
};

interface CobrosProps {
  invoices: InvoiceListItem[];
  loading: boolean;
  businessProfile: BusinessProfileRecord;
  onOpenInvoice: (id: number) => void;
  onPaymentRecorded: () => void;
  /** Rendered as the "Cobros" tab inside Facturas — Facturas owns the PageHeader. */
  embedded?: boolean;
}

type DocKind = "reminder" | "letter";

export function Cobros({
  invoices,
  loading,
  businessProfile,
  onOpenInvoice,
  onPaymentRecorded,
  embedded = false,
}: CobrosProps) {
  const { t, i18n } = useTranslation();
  const locale: CollectionsLocale = i18n.language === "en" ? "en" : "es";
  const today = new Date().toISOString().slice(0, 10);

  const aging = useMemo(() => agingReport(invoices, today), [invoices, today]);
  const outstanding = useMemo(
    () =>
      invoices
        .filter((inv) => inv.status === "issued" && outstandingAmount(inv) > 0.005 && inv.dueDate)
        .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : 0)),
    [invoices],
  );
  const totalOutstanding = aging.reduce((s, g) => s + g.total, 0);

  const [payFor, setPayFor] = useState<InvoiceListItem | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(today);
  const [paySaving, setPaySaving] = useState(false);

  const [doc, setDoc] = useState<{ kind: DocKind; invoice: InvoiceListItem } | null>(null);
  const [ratePct, setRatePct] = useState(DEFAULT_LATE_INTEREST_RATE_PCT);

  function openPayment(inv: InvoiceListItem) {
    setPayFor(inv);
    setPayAmount(outstandingAmount(inv).toFixed(2));
    setPayDate(today);
  }

  async function confirmPayment() {
    if (!payFor) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setPaySaving(true);
    try {
      await recordPayment(payFor.id, amount, payDate);
      onPaymentRecorded();
      setPayFor(null);
    } finally {
      setPaySaving(false);
    }
  }

  const docText = useMemo(() => {
    if (!doc) return "";
    const inv = doc.invoice;
    const params = {
      businessName: businessProfile.name,
      clientName: inv.clientName,
      invoiceNumber: invoiceNumberLabel(inv),
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      total: inv.total,
      outstanding: outstandingAmount(inv),
      daysOverdue: inv.dueDate ? daysOverdue(inv.dueDate, today) : 0,
      iban: businessProfile.iban,
    };
    return doc.kind === "reminder"
      ? paymentReminder(params, locale)
      : lateInterestLetter({ ...params, annualRatePct: ratePct, today }, locale);
  }, [doc, businessProfile, locale, ratePct, today]);

  const [copied, setCopied] = useState(false);
  async function copyDoc() {
    await navigator.clipboard.writeText(docText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={embedded ? "" : "px-8 pb-15"}>
      {!embedded && (
        <PageHeader
          title={t("collections.title")}
          subtitle={t("collections.subtitle", { amount: formatEUR(totalOutstanding) })}
        />
      )}
      {embedded && (
        <div className="text-[12px] text-ink-soft mb-4">
          {t("collections.subtitle", { amount: formatEUR(totalOutstanding) })}
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 mb-6">
        {aging.map((group) => (
          <Card key={group.bucket} className="p-5">
            <div className="text-xs font-medium text-ink-soft mb-2">
              {t(BUCKET_LABEL_KEYS[group.bucket])}
            </div>
            <div className="font-bold text-[18px] font-mono">{formatEUR(group.total)}</div>
            <div className="text-[12px] text-ink-soft mt-1">
              {t("collections.invoiceCount", { count: group.invoices.length })}
            </div>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-ink-soft py-10 text-center">{t("collections.loading")}</div>
      ) : outstanding.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <HandCoins size={32} className="text-ink-soft/40" />
          <div className="text-sm text-ink-soft">{t("collections.empty")}</div>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1.1fr_1.4fr_1fr_1fr_1fr_32px] py-3 px-5.5 bg-surface-alt font-medium text-xs uppercase tracking-wide text-ink-soft">
            <div>{t("invoices.columns.number")}</div>
            <div>{t("invoices.columns.client")}</div>
            <div>{t("collections.columns.due")}</div>
            <div>{t("collections.columns.overdue")}</div>
            <div className="text-right">{t("collections.columns.outstanding")}</div>
            <div />
          </div>
          {outstanding.map((inv) => {
            const overdue = inv.dueDate ? daysOverdue(inv.dueDate, today) : 0;
            const left = outstandingAmount(inv);
            const partial = left + 0.005 < inv.total;
            return (
              <ListRow
                key={inv.id}
                onActivate={() => onOpenInvoice(inv.id)}
                className="group grid grid-cols-[1.1fr_1.4fr_1fr_1fr_1fr_32px] py-3 px-5.5 border-t border-border items-center"
              >
                <span className="font-semibold text-[13.5px] font-mono text-accent">
                  {invoiceNumberLabel(inv)}
                </span>
                <div className="font-medium text-[13.5px]">{inv.clientName}</div>
                <div className="text-[13px] text-ink-soft">{formatDate(inv.dueDate)}</div>
                <div>
                  {overdue > 0 ? (
                    <Badge tone={overdue > 60 ? "danger" : "warning"}>
                      {t("collections.daysOverdue", { count: overdue })}
                    </Badge>
                  ) : (
                    <span className="text-[13px] text-ink-soft">{t("collections.notDue")}</span>
                  )}
                </div>
                <div className="text-right font-semibold text-[13.5px] font-mono">
                  {formatEUR(left)}
                  {partial && (
                    <div className="text-[11px] font-normal text-ink-soft">
                      {t("collections.ofTotal", { total: formatEUR(inv.total) })}
                    </div>
                  )}
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
                      <MenuItem onSelect={() => openPayment(inv)}>
                        {t("collections.recordPayment")}
                      </MenuItem>
                      <MenuItem onSelect={() => setDoc({ kind: "reminder", invoice: inv })}>
                        {t("collections.copyReminder")}
                      </MenuItem>
                      <MenuItem onSelect={() => setDoc({ kind: "letter", invoice: inv })}>
                        {t("collections.copyLetter")}
                      </MenuItem>
                      <MenuItem onSelect={() => onOpenInvoice(inv.id)}>
                        {t("common.viewDetail")}
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
              </ListRow>
            );
          })}
        </Card>
      )}

      <Sheet
        open={payFor !== null}
        onOpenChange={(open) => !open && setPayFor(null)}
        title={t("collections.recordPaymentTitle")}
      >
        {payFor && (
          <p className="text-[13px] text-ink-soft mb-4">
            {t("collections.recordPaymentFor", {
              number: invoiceNumberLabel(payFor),
              outstanding: formatEUR(outstandingAmount(payFor)),
            })}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div>
            <Label>{t("collections.amount")}</Label>
            <TextInput
              type="number"
              step="0.01"
              min="0"
              mono
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
          </div>
          <div>
            <Label>{t("collections.paymentDate")}</Label>
            <TextInput type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2.5 justify-end">
          <Button variant="secondary" onClick={() => setPayFor(null)}>
            {t("invoices.detail.cancel")}
          </Button>
          <Button onClick={() => void confirmPayment()} disabled={paySaving}>
            {t("collections.savePayment")}
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={doc !== null}
        onOpenChange={(open) => !open && setDoc(null)}
        title={
          doc?.kind === "letter" ? t("collections.letterTitle") : t("collections.reminderTitle")
        }
        maxWidthClassName="max-w-lg"
      >
        {doc?.kind === "letter" && (
          <div className="flex items-center gap-2 mb-3">
            <Label>{t("invoices.detail.annualLabel")}</Label>
            <TextInput
              type="number"
              step="0.01"
              min="0"
              mono
              value={ratePct}
              onChange={(e) => setRatePct(Number(e.target.value))}
              className="w-24"
            />
          </div>
        )}
        <TextArea readOnly value={docText} rows={14} className="font-mono text-[12px] mb-4" />
        <div className="flex gap-2.5 justify-end">
          <Button variant="secondary" onClick={() => setDoc(null)}>
            {t("invoices.detail.cancel")}
          </Button>
          <Button onClick={() => void copyDoc()}>
            {copied ? t("collections.copied") : t("collections.copy")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
