import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ErrorText, Select, TextArea, TextInput } from "../components/ui/Field";
import { FormRow } from "../components/ui/FormRow";
import { PageHeader, BackLink } from "../components/PageHeader";
import { InvoiceLinesEditor } from "../components/InvoiceLinesEditor";
import { listClients } from "../db/clients";
import type { ClientRecord, InvoiceLanguage } from "../db/clients";
import {
  convertQuoteToInvoice,
  createQuote,
  getQuoteWithLines,
  openOrGenerateQuotePdf,
  saveQuote,
  setQuoteStatus,
  type QuoteStatus,
} from "../db/quotes";
import { getPreferences } from "../db/preferences";
import { formatEUR } from "../lib/format";
import { quoteNumberLabel } from "../features/quotes/numbering";
import { irpfApplicable, IRPF_REDUCED_RATE } from "../features/clients";
import { mkLine, useInvoiceLines } from "../features/invoices/lines";

// Statuses the user can pick in the form. 'converted' is never chosen manually — it's set by
// the convert-to-invoice action and then locks the quote.
const EDITABLE_STATUSES: QuoteStatus[] = ["draft", "sent", "accepted", "rejected", "expired"];

interface PresupuestoFormProps {
  editQuoteId?: number;
  onBack: () => void;
  onSaved: (id: number) => void;
  onConverted: (invoiceId: number) => void;
  /** Rendered inside a Sheet by App — drop the page chrome (header + page padding),
   *  actions move to a footer row. */
  embedded?: boolean;
}

export function PresupuestoForm({
  editQuoteId,
  onBack,
  onSaved,
  onConverted,
  embedded,
}: PresupuestoFormProps) {
  const { t } = useTranslation();
  const pad = embedded ? "" : "px-8 pb-15";
  const [clients, setClients] = useState<ClientRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [clientId, setClientId] = useState<number | null>(null);
  const { lines, setLines, updateLine, removeLine, addLine } = useInvoiceLines();
  const [ivaRate, setIvaRate] = useState(21);
  const [irpfRate, setIrpfRate] = useState<number | null>(IRPF_REDUCED_RATE);
  const [defaultIrpfRate, setDefaultIrpfRate] = useState(IRPF_REDUCED_RATE);
  const [language, setLanguage] = useState<InvoiceLanguage>("es");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<QuoteStatus>("draft");
  const [quoteId, setQuoteId] = useState<number | null>(null);
  const [numberLabel, setNumberLabel] = useState<string | null>(null);
  const [irpfDefaultedFor, setIrpfDefaultedFor] = useState<number | null>(null);
  const [languageDefaultedFor, setLanguageDefaultedFor] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<"save" | "pdf" | "convert" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (editQuoteId) return;
    void getPreferences().then((prefs) => {
      setDefaultIrpfRate(prefs.defaultIrpfRate);
      setIvaRate(prefs.defaultIvaRate);
      setIrpfRate(prefs.defaultIrpfRate);
    });
  }, [editQuoteId]);

  useEffect(() => {
    let cancelled = false;
    listClients()
      .then((list) => {
        if (cancelled) return;
        setClients(list);
        if (!editQuoteId && list.length > 0) setClientId(list[0].id);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [editQuoteId]);

  useEffect(() => {
    if (!editQuoteId) return;
    let cancelled = false;
    void getQuoteWithLines(editQuoteId).then((detail) => {
      if (cancelled || !detail) return;
      const { quote, lines: quoteLines } = detail;
      setQuoteId(quote.id);
      setNumberLabel(quoteNumberLabel(quote));
      setClientId(quote.clientId);
      setIvaRate(quote.ivaRate);
      setIrpfRate(quote.irpfRate);
      setLanguage(quote.language);
      setIssueDate(quote.issueDate);
      setValidUntil(quote.validUntil ?? "");
      setNotes(quote.notes);
      setStatus(quote.status);
      setLines(
        quoteLines.length
          ? quoteLines.map((l) => mkLine(l.description, l.quantity, l.unitPrice))
          : [mkLine("", 1, 0)],
      );
      setIrpfDefaultedFor(quote.clientId);
      setLanguageDefaultedFor(quote.clientId);
    });
    return () => {
      cancelled = true;
    };
  }, [editQuoteId, setLines]);

  const client = clients?.find((c) => c.id === clientId) ?? null;
  const ivaSelectable = client?.vatTreatment === "standard";
  const effIvaRate = ivaSelectable ? ivaRate : 0;
  const irpfSelectable = irpfApplicable(client?.country ?? null);
  const converted = status === "converted";
  const locked = converted || busyAction !== null;

  if (client && irpfDefaultedFor !== clientId) {
    setIrpfDefaultedFor(clientId);
    setIrpfRate(irpfSelectable ? defaultIrpfRate : 0);
  }
  if (client && languageDefaultedFor !== clientId) {
    setLanguageDefaultedFor(clientId);
    setLanguage(client.invoiceLanguage);
  }

  const subtotal = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
    0,
  );
  const iva = (subtotal * effIvaRate) / 100;
  const irpf = irpfRate !== null ? (subtotal * irpfRate) / 100 : 0;
  const total = subtotal + iva - irpf;

  async function persist(): Promise<number> {
    if (!client) throw new Error("no client selected");
    let id = quoteId;
    if (id === null) {
      const created = await createQuote(client.id);
      id = created.id;
      setQuoteId(id);
      setNumberLabel(quoteNumberLabel(created));
    }
    await saveQuote(id, {
      clientId: client.id,
      issueDate,
      validUntil: validUntil || null,
      notes,
      ivaRate: effIvaRate,
      irpfRate,
      language,
      lines: lines
        .filter((l) => l.description.trim())
        .map((l) => ({
          description: l.description,
          quantity: Number(l.quantity) || 0,
          unitPrice: Number(l.unitPrice) || 0,
        })),
    });
    // saveQuote deliberately doesn't touch status; keep it in sync with the picker.
    await setQuoteStatus(id, status);
    return id;
  }

  function requireLines(): boolean {
    if (!lines.some((l) => l.description.trim())) {
      setSaveError(t("quotes.errors.linesRequired"));
      return false;
    }
    return true;
  }

  async function handleSave() {
    setSaveError(null);
    if (!requireLines()) return;
    setBusyAction("save");
    try {
      const id = await persist();
      onSaved(id);
    } catch {
      setSaveError(t("quotes.errors.saveFailed"));
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePdf() {
    setSaveError(null);
    if (!requireLines()) return;
    setBusyAction("pdf");
    try {
      const id = await persist();
      await openOrGenerateQuotePdf(id, true);
    } catch {
      setSaveError(t("quotes.errors.pdfFailed"));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConvert() {
    setSaveError(null);
    if (!requireLines()) return;
    setBusyAction("convert");
    try {
      const id = await persist();
      const invoice = await convertQuoteToInvoice(id);
      onConverted(invoice.id);
    } catch {
      setSaveError(t("quotes.errors.convertFailed"));
    } finally {
      setBusyAction(null);
    }
  }

  if (loadError) {
    return (
      <div className={pad}>
        <div className="text-sm text-danger">{t("quotes.errors.loadClientsFailed")}</div>
      </div>
    );
  }
  if (!clients) {
    return (
      <div className={pad}>
        <div className="text-sm text-ink-soft">{t("quotes.loading")}</div>
      </div>
    );
  }
  if (clients.length === 0) {
    return (
      <div className={pad}>
        {!embedded && <BackLink label={t("quotes.title")} onClick={onBack} />}
        <div className="text-sm text-ink-soft">{t("quotes.noClients")}</div>
      </div>
    );
  }

  const actions = (
    <>
      <Button variant="secondary" onClick={() => void handleSave()} disabled={locked}>
        {busyAction === "save" ? t("quotes.actions.saving") : t("quotes.actions.save")}
      </Button>
      <Button variant="secondary" onClick={() => void handlePdf()} disabled={locked || converted}>
        {busyAction === "pdf" ? t("quotes.actions.generatingPdf") : t("quotes.actions.downloadPdf")}
      </Button>
      {status === "accepted" && (
        <Button onClick={() => void handleConvert()} disabled={locked}>
          {busyAction === "convert" ? t("quotes.actions.converting") : t("quotes.actions.convert")}
        </Button>
      )}
    </>
  );

  return (
    <div className={pad}>
      {!embedded && (
        <PageHeader
          title={editQuoteId ? t("quotes.editQuote") : t("quotes.newQuote")}
          backLabel={t("quotes.title")}
          onBack={onBack}
          actions={actions}
        />
      )}

      {converted && (
        <div className="mb-4 py-3 px-3.5 bg-surface-alt rounded-card text-xs text-ink-soft">
          {t("quotes.convertedNotice")}
        </div>
      )}

      <div className="grid grid-cols-[2fr_1fr] gap-5 items-start">
        <Card className="px-5">
          <FormRow label={t("quotes.fields.client")}>
            <Select
              value={clientId ?? ""}
              onChange={(e) => setClientId(Number(e.target.value))}
              disabled={locked}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormRow>
          <FormRow label={t("quotes.fields.number")}>
            <TextInput mono readOnly value={numberLabel ?? t("quotes.fields.numberPending")} />
          </FormRow>
          <FormRow label={t("quotes.fields.issueDate")}>
            <TextInput
              mono
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              disabled={locked}
            />
          </FormRow>
          <FormRow label={t("quotes.fields.validUntil")}>
            <TextInput
              mono
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              disabled={locked}
            />
          </FormRow>
          <FormRow label={t("quotes.fields.status")}>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as QuoteStatus)}
              disabled={locked || converted}
            >
              {(converted ? (["converted"] as QuoteStatus[]) : EDITABLE_STATUSES).map((s) => (
                <option key={s} value={s}>
                  {t(`quotes.status.${s}`)}
                </option>
              ))}
            </Select>
          </FormRow>
          <FormRow label={t("quotes.fields.ivaRate")}>
            {ivaSelectable ? (
              <Select
                value={ivaRate}
                onChange={(e) => setIvaRate(Number(e.target.value))}
                disabled={locked}
              >
                <option value={21}>{t("invoices.ivaOptions.standard")}</option>
                <option value={10}>{t("invoices.ivaOptions.reduced")}</option>
                <option value={4}>{t("invoices.ivaOptions.superReduced")}</option>
              </Select>
            ) : (
              <TextInput mono readOnly value={t("invoices.ivaOptions.specialTreatment")} />
            )}
          </FormRow>
          {irpfSelectable && (
            <FormRow label={t("quotes.fields.irpfRate")}>
              <Select
                value={irpfRate ?? defaultIrpfRate}
                onChange={(e) => setIrpfRate(Number(e.target.value))}
                disabled={locked}
              >
                <option value={15}>{t("invoices.irpfOptions.standard")}</option>
                <option value={7}>{t("invoices.irpfOptions.reduced")}</option>
                <option value={0}>{t("invoices.irpfOptions.none")}</option>
              </Select>
            </FormRow>
          )}
          <FormRow label={t("quotes.fields.language")}>
            <Select
              value={language}
              onChange={(e) => setLanguage(e.target.value as InvoiceLanguage)}
              disabled={locked}
            >
              <option value="es">{t("clients.invoiceLanguage.es")}</option>
              <option value="en">{t("clients.invoiceLanguage.en")}</option>
              <option value="ca">{t("clients.invoiceLanguage.ca")}</option>
            </Select>
          </FormRow>
          <FormRow label={t("quotes.fields.notes")}>
            <TextArea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={locked}
              placeholder={t("quotes.fields.notesPlaceholder")}
            />
          </FormRow>
        </Card>

        <Card className="py-5.5 px-6 sticky top-5">
          <div className="font-bold text-sm mb-4">{t("invoices.totals.title")}</div>
          <div className="flex justify-between py-1.5 text-[13px] text-ink-soft">
            <span>{t("invoices.totals.subtotal")}</span>
            <span className="font-medium font-mono text-[13px] text-ink">{formatEUR(subtotal)}</span>
          </div>
          <div className="flex justify-between py-1.5 text-[13px] text-ink-soft">
            <span>{t("invoices.totals.iva")}</span>
            <span className="font-medium font-mono text-[13px] text-ink">{formatEUR(iva)}</span>
          </div>
          <div className="flex justify-between pt-1.5 pb-3.5 text-[13px] text-ink-soft">
            <span>{t("invoices.totals.irpf")}</span>
            <span className="font-medium font-mono text-[13px] text-ink">{formatEUR(irpf)}</span>
          </div>
          <div className="flex justify-between pt-3.5 border-t border-border font-bold text-[15px]">
            <span>{t("quotes.totals.estimatedTotal")}</span>
            <span className="font-bold text-[17px] font-mono">{formatEUR(total)}</span>
          </div>
          <div className="mt-4.5 py-3 px-3.5 bg-surface-alt rounded-card text-xs text-ink-soft leading-relaxed">
            {t("quotes.totals.notice")}
          </div>
        </Card>
      </div>

      <Card className="py-5 px-6 mt-5">
        <InvoiceLinesEditor
          lines={lines}
          onUpdateLine={updateLine}
          onRemoveLine={removeLine}
          onAddLine={addLine}
          disabled={locked}
        />
      </Card>

      {saveError && <ErrorText>{saveError}</ErrorText>}

      {embedded && <div className="flex gap-2.5 justify-end mt-5">{actions}</div>}
    </div>
  );
}
