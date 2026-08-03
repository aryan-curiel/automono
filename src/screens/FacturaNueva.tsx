import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ErrorText, Select, TextInput } from "../components/ui/Field";
import { FormRow } from "../components/ui/FormRow";
import { BackLink, PageHeader } from "../components/PageHeader";
import { listClients } from "../db/clients";
import type { ClientRecord, InvoiceLanguage } from "../db/clients";
import { createDraftInvoice, getInvoiceWithLines, issueInvoice, saveDraft } from "../db/invoices";
import { getPreferences } from "../db/preferences";
import { formatEUR } from "../lib/format";
import { irpfApplicable, IRPF_DEFAULT_RATE } from "../features/clients";

interface FacturaNuevaProps {
  editInvoiceId?: number;
  onBack: () => void;
  onSaved: (id: number) => void;
}

interface DraftLine {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

function mkLine(description: string, quantity: number, unitPrice: number): DraftLine {
  return {
    key: `${Date.now()}-${Math.random()}`,
    description,
    quantity: String(quantity),
    unitPrice: String(unitPrice),
  };
}

export function FacturaNueva({ editInvoiceId, onBack, onSaved }: FacturaNuevaProps) {
  const [clients, setClients] = useState<ClientRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [clientId, setClientId] = useState<number | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([mkLine("", 1, 0)]);
  const [ivaRate, setIvaRate] = useState(21);
  const [irpfRate, setIrpfRate] = useState<number | null>(IRPF_DEFAULT_RATE);
  const [defaultIrpfRate, setDefaultIrpfRate] = useState(IRPF_DEFAULT_RATE);
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
    getPreferences().then((prefs) => {
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
    getInvoiceWithLines(editInvoiceId).then((detail) => {
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
  }, [editInvoiceId]);

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

  function updateLine(idx: number, field: "description" | "quantity" | "unitPrice", value: string) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  function removeLine(idx: number) {
    setLines((ls) => {
      const next = ls.filter((_, i) => i !== idx);
      return next.length ? next : [mkLine("", 1, 0)];
    });
  }

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
    setSaving(true);
    try {
      const id = await persistDraft();
      onSaved(id);
    } catch {
      setSaveError("No se pudo guardar el borrador.");
    } finally {
      setSaving(false);
    }
  }

  async function handleIssue() {
    setSaveError(null);
    setIssuing(true);
    try {
      const id = await persistDraft();
      await issueInvoice(id, issueDate);
      onBack();
    } catch {
      setSaveError("No se pudo emitir la factura.");
    } finally {
      setIssuing(false);
    }
  }

  if (loadError) {
    return (
      <div className="px-8 pb-15">
        <div className="text-sm text-danger">No se pudieron cargar los clientes.</div>
      </div>
    );
  }

  if (!clients) {
    return (
      <div className="px-8 pb-15">
        <div className="text-sm text-ink-soft">Cargando…</div>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="px-8 pb-15">
        <BackLink label="Facturas" onClick={onBack} />
        <div className="text-sm text-ink-soft">
          Da de alta un cliente antes de crear una factura.
        </div>
      </div>
    );
  }

  const busy = saving || issuing;

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title={editInvoiceId ? "Editar factura" : "Nueva factura"}
        backLabel="Facturas"
        onBack={onBack}
        actions={
          <>
            <Button variant="secondary" onClick={handleSaveDraft} disabled={busy}>
              Guardar borrador
            </Button>
            <Button onClick={handleIssue} disabled={busy}>
              Emitir factura
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-[2fr_1fr] gap-5 items-start">
        <Card className="px-5 py-1">
          <FormRow label="Cliente">
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
          <FormRow label="Nº de factura">
            <TextInput mono readOnly value={numberPreview} />
          </FormRow>
          <FormRow label="Fecha de emisión">
            <TextInput
              mono
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              disabled={busy}
            />
          </FormRow>
          <FormRow label="Tipo de IVA">
            {ivaSelectable ? (
              <Select
                value={ivaRate}
                onChange={(e) => setIvaRate(Number(e.target.value))}
                disabled={busy}
              >
                <option value={21}>21% — general</option>
                <option value={10}>10% — reducido</option>
                <option value={4}>4% — superreducido</option>
              </Select>
            ) : (
              <TextInput mono readOnly value="0% — tratamiento especial" />
            )}
          </FormRow>
          {irpfSelectable && (
            <FormRow label="Retención IRPF">
              <Select
                value={irpfRate ?? defaultIrpfRate}
                onChange={(e) => setIrpfRate(Number(e.target.value))}
                disabled={busy}
              >
                <option value={15}>15% — estándar</option>
                <option value={7}>7% — reducida (inicio actividad)</option>
                <option value={0}>0% — no aplica</option>
              </Select>
            </FormRow>
          )}
          <FormRow label="Idioma de la factura">
            <Select
              value={language}
              onChange={(e) => setLanguage(e.target.value as InvoiceLanguage)}
              disabled={busy}
            >
              <option value="es">Español</option>
              <option value="en">English</option>
              <option value="ca">Català</option>
            </Select>
          </FormRow>
        </Card>

        <Card className="py-5.5 px-6 sticky top-5">
          <div className="font-bold text-sm mb-4">Totales</div>
          <div className="flex justify-between py-1.5 text-[13.5px] text-ink-soft">
            <span>Base imponible</span>
            <span className="font-medium font-mono text-[13.5px] text-ink">
              {formatEUR(subtotal)}
            </span>
          </div>
          <div className="flex justify-between py-1.5 text-[13.5px] text-ink-soft">
            <span>IVA</span>
            <span className="font-medium font-mono text-[13.5px] text-ink">{formatEUR(iva)}</span>
          </div>
          <div className="flex justify-between pt-1.5 pb-3.5 text-[13.5px] text-ink-soft">
            <span>Retención IRPF{irpfForeignClient && " (cliente extranjero)"}</span>
            <span className="font-medium font-mono text-[13.5px] text-ink">
              {formatEUR(irpf)}
            </span>
          </div>
          <div className="flex justify-between pt-3.5 border-t border-border font-bold text-[15px]">
            <span>Total</span>
            <span className="font-bold text-[17px] font-mono">{formatEUR(total)}</span>
          </div>
          <div className="mt-4.5 py-3 px-3.5 bg-surface-alt rounded-card text-xs text-ink-soft leading-relaxed">
            La numeración se asigna de forma atómica al emitir. Una vez emitida, la factura queda
            bloqueada.
          </div>
        </Card>
      </div>

      <Card className="py-5 px-6 mt-5">
        <div className="font-bold text-[13px] mb-2.5">Líneas</div>
        <div className="grid grid-cols-[2.4fr_.7fr_1fr_1fr_28px] gap-2 font-semibold text-xs uppercase text-ink-soft pb-1.5">
          <div>Descripción</div>
          <div>Cant.</div>
          <div>Precio</div>
          <div>Total</div>
          <div />
        </div>
        {lines.map((l, idx) => (
          <div
            key={l.key}
            className="group grid grid-cols-[2.4fr_.7fr_1fr_1fr_28px] gap-2 items-center rounded-control -mx-2 px-2 py-1 transition-colors hover:bg-surface-alt"
          >
            <TextInput
              value={l.description}
              onChange={(e) => updateLine(idx, "description", e.target.value)}
              disabled={busy}
            />
            <TextInput
              mono
              value={l.quantity}
              onChange={(e) => updateLine(idx, "quantity", e.target.value)}
              disabled={busy}
            />
            <TextInput
              mono
              value={l.unitPrice}
              onChange={(e) => updateLine(idx, "unitPrice", e.target.value)}
              disabled={busy}
            />
            <div className="font-semibold text-[13px] font-mono py-2">
              {formatEUR((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))}
            </div>
            <button
              onClick={() => !busy && removeLine(idx)}
              className="p-1 rounded-control text-ink-soft hover:bg-border cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Eliminar línea"
            >
              <X size={14} weight="bold" />
            </button>
          </div>
        ))}
        <button
          onClick={() => setLines((ls) => [...ls, mkLine("", 1, 0)])}
          disabled={busy}
          className="font-semibold text-[13px] bg-transparent border border-dashed border-border text-accent rounded-control px-3.5 py-2 mt-1.5 cursor-pointer disabled:opacity-50"
        >
          + Añadir línea
        </button>
      </Card>

      {saveError && <ErrorText>{saveError}</ErrorText>}
    </div>
  );
}
