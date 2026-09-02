import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bank, ArrowRight } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Badge, type Tone } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Sheet } from "../components/ui/Sheet";
import { Label, Select } from "../components/ui/Field";
import { PageHeader } from "../components/PageHeader";
import { Toast } from "../components/ui/Toast";
import { formatDate, formatEUR } from "../lib/format";
import { invoiceNumberLabel } from "../lib/invoice";
import { outstandingAmount } from "../lib/analytics";
import {
  detectColumnMapping,
  parseStatementCsv,
  proposeMatches,
  toStatementLines,
  type ColumnMapping,
  type ProposedMatch,
  type StatementField,
} from "../lib/bankReconcile";
import {
  confirmMatch,
  importStatementLines,
  listReconciledLines,
  listUnreconciledLines,
  pickStatementCsv,
  unmatchLine,
  type BankStatementLineRecord,
} from "../db/bankStatements";
import type { InvoiceListItem } from "../db/invoices";

const CONFIDENCE_TONE: Record<ProposedMatch["confidence"], Tone> = {
  high: "success",
  medium: "info",
  low: "neutral",
};

const FIELD_ORDER: StatementField[] = ["date", "amount", "description", "reference"];

interface ConciliacionProps {
  invoices: InvoiceListItem[];
  onPaymentRecorded: () => void;
}

interface ImportDraft {
  headers: string[];
  rows: string[][];
  mapping: ColumnMapping;
}

export function Conciliacion({ invoices, onPaymentRecorded }: ConciliacionProps) {
  const { t } = useTranslation();

  const [unreconciled, setUnreconciled] = useState<BankStatementLineRecord[]>([]);
  const [reconciled, setReconciled] = useState<BankStatementLineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [manualFor, setManualFor] = useState<BankStatementLineRecord | null>(null);
  const [manualInvoiceId, setManualInvoiceId] = useState<string>("");
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    void Promise.all([listUnreconciledLines(), listReconciledLines()])
      .then(([open, done]) => {
        setUnreconciled(open);
        setReconciled(done);
      })
      .catch(() => setToast(t("reconciliation.loadFailed")))
      .finally(() => setLoading(false));
  }, [reloadToken, t]);

  const openInvoices = useMemo(
    () => invoices.filter((i) => i.status === "issued" && outstandingAmount(i) > 0.005),
    [invoices],
  );

  // proposeMatches returns the exact line objects passed in, so `match.line` is the stored row.
  const proposalRows = useMemo(
    () =>
      proposeMatches(unreconciled, openInvoices)
        .map((match) => ({ match, line: match.line as BankStatementLineRecord }))
        .filter(({ line }) => !dismissed.has(line.id)),
    [unreconciled, openInvoices, dismissed],
  );

  const proposedLineIds = useMemo(
    () => new Set(proposalRows.map(({ line }) => line.id)),
    [proposalRows],
  );
  const leftoverCredits = unreconciled.filter(
    (l) => l.amount > 0.005 && !proposedLineIds.has(l.id) && !dismissed.has(l.id),
  );

  async function handleImport() {
    const text = await pickStatementCsv();
    if (text === null) return;
    const { headers, rows } = parseStatementCsv(text);
    if (headers.length === 0 || rows.length === 0) {
      setToast(t("reconciliation.emptyFile"));
      return;
    }
    setDraft({ headers, rows, mapping: detectColumnMapping(headers) });
  }

  const draftLines = useMemo(
    () => (draft ? toStatementLines(draft.rows, draft.mapping) : []),
    [draft],
  );

  async function confirmImport() {
    if (!draft) return;
    setBusy(true);
    try {
      const { inserted, skipped } = await importStatementLines(draftLines);
      setDraft(null);
      refresh();
      setToast(t("reconciliation.imported", { inserted, skipped }));
    } finally {
      setBusy(false);
    }
  }

  async function accept(lineId: number, invoiceId: number, amount: number, valueDate: string) {
    setBusy(true);
    try {
      await confirmMatch(lineId, invoiceId, amount, valueDate);
      onPaymentRecorded();
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmManual() {
    if (!manualFor || !manualInvoiceId) return;
    await accept(manualFor.id, Number(manualInvoiceId), manualFor.amount, manualFor.valueDate);
    setManualFor(null);
    setManualInvoiceId("");
  }

  async function undo(lineId: number) {
    setBusy(true);
    try {
      await unmatchLine(lineId);
      refresh();
      setToast(t("reconciliation.unmatched"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title={t("reconciliation.title")}
        subtitle={t("reconciliation.subtitle")}
        actions={
          <Button onClick={() => void handleImport()} disabled={busy}>
            {t("reconciliation.import")}
          </Button>
        }
      />

      {loading ? (
        <div className="text-sm text-ink-soft py-10 text-center">{t("reconciliation.loading")}</div>
      ) : unreconciled.length === 0 && reconciled.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <Bank size={32} className="text-ink-soft/40" />
          <div className="text-sm text-ink-soft">{t("reconciliation.empty")}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {proposalRows.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft mb-2">
                {t("reconciliation.proposedTitle", { count: proposalRows.length })}
              </h2>
              <Card className="overflow-hidden">
                {proposalRows.map(({ match, line }) => {
                  const inv = invoices.find((i) => i.id === match.invoice.id);
                  return (
                    <div
                      key={line.id}
                      className="flex items-center gap-4 py-3 px-5.5 border-t border-border first:border-t-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium truncate">
                          {line.description || "—"}
                        </div>
                        <div className="text-[12px] text-ink-soft">
                          {formatDate(line.valueDate)} · {formatEUR(line.amount)}
                        </div>
                      </div>
                      <ArrowRight size={14} className="text-ink-soft shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium font-mono text-accent truncate">
                          {inv ? invoiceNumberLabel(inv) : `#${match.invoice.id}`}
                        </div>
                        <div className="text-[12px] text-ink-soft truncate">
                          {inv?.clientName} ·{" "}
                          {t("reconciliation.outstanding", {
                            amount: formatEUR(
                              inv ? outstandingAmount(inv) : match.invoice.total,
                            ),
                          })}
                        </div>
                      </div>
                      <Badge tone={CONFIDENCE_TONE[match.confidence]}>
                        {t(`reconciliation.confidence.${match.confidence}`)}
                      </Badge>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="secondary"
                          onClick={() => setDismissed((s) => new Set(s).add(line.id))}
                          disabled={busy}
                        >
                          {t("reconciliation.dismiss")}
                        </Button>
                        <Button
                          onClick={() =>
                            void accept(line.id, match.invoice.id, match.amount, line.valueDate)
                          }
                          disabled={busy}
                        >
                          {t("reconciliation.confirm")}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </section>
          )}

          {leftoverCredits.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft mb-2">
                {t("reconciliation.unmatchedTitle", { count: leftoverCredits.length })}
              </h2>
              <Card className="overflow-hidden">
                {leftoverCredits.map((line) => (
                  <div
                    key={line.id}
                    className="flex items-center gap-4 py-3 px-5.5 border-t border-border first:border-t-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{line.description || "—"}</div>
                      <div className="text-[12px] text-ink-soft">
                        {formatDate(line.valueDate)}
                        {line.reference ? ` · ${line.reference}` : ""}
                      </div>
                    </div>
                    <div className="font-mono text-[13px] font-semibold shrink-0">
                      {formatEUR(line.amount)}
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setManualFor(line);
                        setManualInvoiceId("");
                      }}
                      disabled={busy || openInvoices.length === 0}
                    >
                      {t("reconciliation.matchManually")}
                    </Button>
                  </div>
                ))}
              </Card>
            </section>
          )}

          {reconciled.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft mb-2">
                {t("reconciliation.reconciledTitle", { count: reconciled.length })}
              </h2>
              <Card className="overflow-hidden">
                {reconciled.map((line) => {
                  const inv = invoices.find((i) => i.id === line.matchedInvoiceId);
                  return (
                    <div
                      key={line.id}
                      className="flex items-center gap-4 py-3 px-5.5 border-t border-border first:border-t-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] truncate">{line.description || "—"}</div>
                        <div className="text-[12px] text-ink-soft">{formatDate(line.valueDate)}</div>
                      </div>
                      <div className="text-[12px] text-ink-soft font-mono truncate shrink-0">
                        {inv ? invoiceNumberLabel(inv) : `#${line.matchedInvoiceId}`}
                      </div>
                      <div className="font-mono text-[13px] shrink-0">{formatEUR(line.amount)}</div>
                      <Button variant="ghost-danger" onClick={() => void undo(line.id)} disabled={busy}>
                        {t("reconciliation.undo")}
                      </Button>
                    </div>
                  );
                })}
              </Card>
            </section>
          )}
        </div>
      )}

      <Sheet
        open={draft !== null}
        onOpenChange={(open) => !open && setDraft(null)}
        title={t("reconciliation.mapTitle")}
        maxWidthClassName="max-w-lg"
      >
        {draft && (
          <>
            <p className="text-[13px] text-ink-soft mb-4">
              {t("reconciliation.mapHelp", { count: draft.rows.length })}
            </p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {FIELD_ORDER.map((field) => (
                <div key={field}>
                  <Label>{t(`reconciliation.field.${field}`)}</Label>
                  <Select
                    value={String(draft.mapping[field])}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        mapping: { ...draft.mapping, [field]: Number(e.target.value) },
                      })
                    }
                  >
                    <option value="-1">{t("reconciliation.fieldNone")}</option>
                    {draft.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `#${i + 1}`}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-ink-soft mb-4">
              {t("reconciliation.mapPreview", { count: draftLines.length })}
            </p>
            <div className="flex gap-2.5 justify-end">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                {t("reconciliation.cancel")}
              </Button>
              <Button
                onClick={() => void confirmImport()}
                disabled={busy || draftLines.length === 0 || draft.mapping.date < 0 || draft.mapping.amount < 0}
              >
                {t("reconciliation.doImport")}
              </Button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet
        open={manualFor !== null}
        onOpenChange={(open) => !open && setManualFor(null)}
        title={t("reconciliation.matchManually")}
      >
        {manualFor && (
          <>
            <p className="text-[13px] text-ink-soft mb-4">
              {formatDate(manualFor.valueDate)} · {formatEUR(manualFor.amount)} ·{" "}
              {manualFor.description || "—"}
            </p>
            <Label>{t("reconciliation.chooseInvoice")}</Label>
            <Select
              value={manualInvoiceId}
              onChange={(e) => setManualInvoiceId(e.target.value)}
              className="mb-5"
            >
              <option value="">{t("reconciliation.fieldNone")}</option>
              {openInvoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {invoiceNumberLabel(i)} · {i.clientName} · {formatEUR(outstandingAmount(i))}
                </option>
              ))}
            </Select>
            <div className="flex gap-2.5 justify-end">
              <Button variant="secondary" onClick={() => setManualFor(null)}>
                {t("reconciliation.cancel")}
              </Button>
              <Button onClick={() => void confirmManual()} disabled={busy || !manualInvoiceId}>
                {t("reconciliation.confirm")}
              </Button>
            </div>
          </>
        )}
      </Sheet>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
