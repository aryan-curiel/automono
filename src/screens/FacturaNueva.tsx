import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ErrorText, Select, TextInput } from "../components/ui/Field";
import { FormRow } from "../components/ui/FormRow";
import { BackLink, PageHeader } from "../components/PageHeader";
import { InvoiceLinesEditor } from "../components/InvoiceLinesEditor";
import { listClients } from "../db/clients";
import type { ClientRecord, InvoiceLanguage } from "../db/clients";
import { createDraftInvoice, getInvoiceWithLines, issueInvoice, saveDraft } from "../db/invoices";
import { getPreferences } from "../db/preferences";
import { formatEUR } from "../lib/format";
import { irpfApplicable, IRPF_REDUCED_RATE } from "../features/clients";
import { mkLine, useInvoiceLines } from "../features/invoices/lines";

interface FacturaNuevaProps {
  editInvoiceId?: number;
  onBack: () => void;
  onSaved: (id: number) => void;
}

export function FacturaNueva({ editInvoiceId, onBack, onSaved }: FacturaNuevaProps) {
  const { t } = useTranslation();
  const [clients, setClients] = useState<ClientRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [clientId, setClientId] = useState<number | null>(null);
  const { lines, setLines, updateLine, removeLine, addLine } = useInvoiceLines();
  const [ivaRate, setIvaRate] = useState(21);
  const [irpfRate, setIrpfRate] = useState<number | null>(IRPF_REDUCED_RATE);
  const [defaultIrpfRate, setDefaultIrpfRate] = useState(IRPF_REDUCED_RATE);
  const [language, setLanguage] = useState<InvoiceLanguage>("es");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [irpfDefaultedFor, setIrpfDefaultedFor] = useState<number | null>(null);
  const [languageDefaultedFor, setLanguageDefaultedFor] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seeds the IVA/IRPF defaults from Ajustes for a brand-new invoice; an invoice being edited
  // keeps whatever rates it was saved with, loaded separately below.
  useEffect(() => {
    if (editInvoiceId) return;
    void getPreferences().then((prefs) => {
      setDefaultIrpfRate(prefs.defaultIrpfRate);
      setIvaRate(prefs.defaultIvaRate);
      setIrpfRate(prefs.defaultIrpfRate);
    });
  }, [editInvoiceId]);

  useEffect(() => {
    let cancelled = false;
    listClients()
      .then((list) => {
        if (cancelled) return;
        setClients(list);
        if (!editInvoiceId && list.length > 0) setClientId(list[0].id);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [editInvoiceId]);

  // Loads an existing draft (e.g. one just created by "duplicate") into the form instead of
  // starting blank. irpfDefaultedFor/languageDefaultedFor are set to match so the client-change
  // defaulting below doesn't immediately overwrite the values we just loaded.
  useEffect(() => {
    if (!editInvoiceId) return;
    let cancelled = false;
    void getInvoiceWithLines(editInvoiceId).then((detail) => {
      if (cancelled || !detail) return;
      const { invoice, lines: invoiceLines } = detail;
      setInvoiceId(invoice.id);
      setClientId(invoice.clientId);
      setIvaRate(invoice.ivaRate ?? 21);
      setIrpfRate(invoice.irpfRate);
      setLanguage(invoice.language ?? "es");
      setIssueDate(invoice.issueDate ?? new Date().toISOString().slice(0, 10));
      setLines(
        invoiceLines.length
          ? invoiceLines.map((l) => mkLine(l.description, l.quantity, l.unitPrice))
          : [mkLine("", 1, 0)],
      );
      setIrpfDefaultedFor(invoice.clientId);
      setLanguageDefaultedFor(invoice.clientId);
    });
    return () => {
      cancelled = true;
    };
  }, [editInvoiceId, setLines]);

  const client = clients?.find((c) => c.id === clientId) ?? null;
  const ivaSelectable = client?.vatTreatment === "standard";
  const effIvaRate = ivaSelectable ? ivaRate : 0;
  const irpfSelectable = irpfApplicable(client?.country ?? null);
  const irpfForeignClient = !irpfSelectable;

  // Resets the IRPF default whenever the selected client changes, following React's
  // "adjusting state when a prop changes" pattern (state update during render) rather
  // than an effect, so switching clients doesn't leave a stale rate from the previous one.
  // Foreign clients get an explicit 0 (not null) so the totals breakdown can still show the
  // IRPF line, annotated as not applicable, instead of hiding it.
  if (client && irpfDefaultedFor !== clientId) {
    setIrpfDefaultedFor(clientId);
    setIrpfRate(irpfSelectable ? defaultIrpfRate : 0);
  }

  // Same pattern for the invoice language: default it from the selected client's preference
  // whenever the client changes, rather than leaving it stuck at the initial "es".
  if (client && languageDefaultedFor !== clientId) {
    setLanguageDefaultedFor(clientId);
    setLanguage(client.invoiceLanguage);
  }

  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const iva = (subtotal * effIvaRate) / 100;
  const irpf = irpfRate !== null ? (subtotal * irpfRate) / 100 : 0;
  const total = subtotal + iva - irpf;

  const numberPreview = client
    ? `${client.seriesPrefix}-${String(client.nextInvoiceNumber).padStart(3, "0")}`
    : "";

  // Persists the current form state as a draft (creating the row on first
  // save), returning its id. Both "Guardar borrador" and "Emitir factura"
  // go through this so the issue step always locks in what's on screen.
  async function persistDraft(): Promise<number> {
    if (!client) throw new Error("no client selected");
    let id = invoiceId;
    if (id === null) {
      const created = await createDraftInvoice(client.id);
      id = created.id;
      setInvoiceId(id);
    }
    await saveDraft(id, {
      ivaRate: effIvaRate,
      irpfRate,
      language,
      issueDate,
      lines: lines
        .filter((l) => l.description.trim())
        .map((l) => ({
          description: l.description,
          quantity: Number(l.quantity) || 0,
          unitPrice: Number(l.unitPrice) || 0,
        })),
    });
    return id;
  }

  async function handleSaveDraft() {
    setSaveError(null);
    if (!lines.some((l) => l.description.trim())) {
      setSaveError(t("invoices.errors.linesRequired"));
      return;
    }
    setSaving(true);
    try {
      const id = await persistDraft();
      onSaved(id);
    } catch {
      setSaveError(t("invoices.errors.saveDraftFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleIssue() {
    setSaveError(null);
    if (!lines.some((l) => l.description.trim())) {
      setSaveError(t("invoices.errors.linesRequired"));
      return;
    }
    setIssuing(true);
    try {
      const id = await persistDraft();
      await issueInvoice(id, issueDate);
      onBack();
    } catch {
      setSaveError(t("invoices.errors.issueFailed"));
    } finally {
      setIssuing(false);
    }
  }

  if (loadError) {
    return (
      <div className="px-8 pb-15">
        <div className="text-sm text-danger">{t("invoices.errors.loadClientsFailed")}</div>
      </div>
    );
  }

  if (!clients) {
    return (
      <div className="px-8 pb-15">
        <div className="text-sm text-ink-soft">{t("invoices.loading")}</div>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="px-8 pb-15">
        <BackLink label={t("invoices.title")} onClick={onBack} />
        <div className="text-sm text-ink-soft">{t("invoices.noClients")}</div>
      </div>
    );
  }

  const busy = saving || issuing;

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title={editInvoiceId ? t("invoices.editInvoice") : t("invoices.newInvoice")}
        backLabel={t("invoices.title")}
        onBack={onBack}
        actions={
          <>
            <Button variant="secondary" onClick={() => void handleSaveDraft()} disabled={busy}>
              {saving ? t("invoices.actions.savingDraft") : t("invoices.actions.saveDraft")}
            </Button>
            <Button onClick={() => void handleIssue()} disabled={busy}>
              {issuing ? t("invoices.actions.issuing") : t("invoices.actions.issue")}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-[2fr_1fr] gap-5 items-start">
        <Card className="px-5">
          <FormRow label={t("invoices.fields.client")}>
            <Select
              value={clientId ?? ""}
              onChange={(e) => setClientId(Number(e.target.value))}
              disabled={busy}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormRow>
          <FormRow label={t("invoices.fields.number")}>
            <TextInput mono readOnly value={numberPreview} />
          </FormRow>
          <FormRow label={t("invoices.fields.issueDate")}>
            <TextInput
              mono
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              disabled={busy}
            />
          </FormRow>
          <FormRow label={t("invoices.fields.ivaRate")}>
            {ivaSelectable ? (
              <Select
                value={ivaRate}
                onChange={(e) => setIvaRate(Number(e.target.value))}
                disabled={busy}
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
            <FormRow label={t("invoices.fields.irpfRate")}>
              <Select
                value={irpfRate ?? defaultIrpfRate}
                onChange={(e) => setIrpfRate(Number(e.target.value))}
                disabled={busy}
              >
                <option value={15}>{t("invoices.irpfOptions.standard")}</option>
                <option value={7}>{t("invoices.irpfOptions.reduced")}</option>
                <option value={0}>{t("invoices.irpfOptions.none")}</option>
              </Select>
            </FormRow>
          )}
          <FormRow label={t("invoices.fields.language")}>
            <Select
              value={language}
              onChange={(e) => setLanguage(e.target.value as InvoiceLanguage)}
              disabled={busy}
            >
              <option value="es">{t("clients.invoiceLanguage.es")}</option>
              <option value="en">{t("clients.invoiceLanguage.en")}</option>
              <option value="ca">{t("clients.invoiceLanguage.ca")}</option>
            </Select>
          </FormRow>
        </Card>

        <Card className="py-5.5 px-6 sticky top-5">
          <div className="font-bold text-sm mb-4">{t("invoices.totals.title")}</div>
          <div className="flex justify-between py-1.5 text-[13px] text-ink-soft">
            <span>{t("invoices.totals.subtotal")}</span>
            <span className="font-medium font-mono text-[13px] text-ink">
              {formatEUR(subtotal)}
            </span>
          </div>
          <div className="flex justify-between py-1.5 text-[13px] text-ink-soft">
            <span>{t("invoices.totals.iva")}</span>
            <span className="font-medium font-mono text-[13px] text-ink">{formatEUR(iva)}</span>
          </div>
          <div className="flex justify-between pt-1.5 pb-3.5 text-[13px] text-ink-soft">
            <span>
              {t("invoices.totals.irpf")}
              {irpfForeignClient && t("invoices.totals.foreignClientSuffix")}
            </span>
            <span className="font-medium font-mono text-[13px] text-ink">
              {formatEUR(irpf)}
            </span>
          </div>
          <div className="flex justify-between pt-3.5 border-t border-border font-bold text-[15px]">
            <span>{t("invoices.totals.total")}</span>
            <span className="font-bold text-[17px] font-mono">{formatEUR(total)}</span>
          </div>
          <div className="mt-4.5 py-3 px-3.5 bg-surface-alt rounded-card text-xs text-ink-soft leading-relaxed">
            {t("invoices.totals.lockNoticeNew")}
          </div>
        </Card>
      </div>

      <Card className="py-5 px-6 mt-5">
        <InvoiceLinesEditor
          lines={lines}
          onUpdateLine={updateLine}
          onRemoveLine={removeLine}
          onAddLine={addLine}
          disabled={busy}
        />
      </Card>

      {saveError && <ErrorText>{saveError}</ErrorText>}
    </div>
  );
}
