import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { save } from "@tauri-apps/plugin-dialog";
import {
  TrendUp,
  Percent,
  ChartLineUp,
  Scales,
  DownloadSimple,
  DotsThreeVertical,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { KpiTile } from "../components/ui/KpiTile";
import { InfoRow } from "../components/ui/InfoRow";
import { ErrorText } from "../components/ui/Field";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
import { Sheet } from "../components/ui/Sheet";
import { PageHeader } from "../components/PageHeader";
import { QuarterTimeline } from "../components/QuarterTimeline";
import { DeclarationWizard } from "../components/DeclarationWizard";
import { ModeloReviewModal } from "../components/ModeloReviewModal";
import { listExpenses } from "../db/expenses";
import type { ExpenseRecord } from "../db/expenses";
import { writeTextFile } from "../db/export";
import {
  listDeclarations,
  getDeclaration,
  deleteDeclaration,
  exportDeclarationZip,
  markDeclarationCompleted,
  openDeclarationFile,
  pickDeclarationFile,
  requiredModelos,
  type DeclarationListItem,
  type DeclarationDetail,
  type Modelo,
} from "../db/declarations";
import {
  priorYearPeriod,
  quarterKeyOf,
  quarterMonths,
  quarterRange,
  quartersInRange,
} from "../lib/dateRange";
import { useCurrentQuarterKey } from "../hooks/useCurrentQuarterKey";
import { getPreferences } from "../db/preferences";
import { yoyDelta } from "../lib/analytics";
import { formatEUR, formatDate } from "../lib/format";
import { invoiceNumberLabel } from "../lib/invoice";
import { cumulativeModelo130 } from "../lib/modeloReport";
import {
  buildDeclarationCsv,
  buildDeclarationSnapshot,
  invoicesInPeriod,
} from "../lib/quarterlyDeclaration";
import type { InvoiceListItem } from "../db/invoices";

const PAGE_SIZE = 4;
/** Row height (py-2 + 13px line + border) × PAGE_SIZE, so the card doesn't resize between quarters. */
const ROWS_HEIGHT = "h-[146px]";

const MODELO_PATH_KEY: Record<Modelo, "modelo303Path" | "modelo130Path" | "modelo111Path"> = {
  "303": "modelo303Path",
  "130": "modelo130Path",
  "111": "modelo111Path",
};

function deltaLabel(t: TFunction, delta: number | null): string | null {
  if (delta === null) return null;
  const sign = delta >= 0 ? "+" : "";
  return t("resumenTrimestral.vsPriorYear", { sign, value: delta.toFixed(0) });
}

function parseQuarterKey(key: string): { year: number; quarter: 1 | 2 | 3 | 4 } {
  const [yearStr, q] = key.split("-Q");
  return { year: Number(yearStr), quarter: Number(q) as 1 | 2 | 3 | 4 };
}

interface ResumenTrimestralProps {
  invoices: InvoiceListItem[];
  dropPaths?: string[] | null;
  dropToken?: number;
  /** Seeds the focused quarter (e.g. when arriving from the Inicio historical timeline) —
   * falls back to the current quarter when omitted. */
  initialQuarterKey?: string;
}

interface QuarterLineItem {
  id: number;
  date: string;
  label: string;
  amount: number;
  /** The line's full (pre-deduction) amount, shown muted next to `amount` when it differs —
   * used by the expenses list to keep the deductible amount the primary focus. */
  totalAmount?: number;
}

function LineItemRow({ item }: { item: QuarterLineItem }) {
  const showTotal = item.totalAmount !== undefined && item.totalAmount !== item.amount;
  return (
    <div className="flex justify-between gap-3 py-2 border-b border-border last:border-b-0 text-[13px]">
      <span className="truncate min-w-0">
        {formatDate(item.date)} · {item.label}
      </span>
      <span className="flex items-baseline gap-2 shrink-0">
        {showTotal && (
          <span className="font-mono text-ink-soft">{formatEUR(item.totalAmount!)}</span>
        )}
        <span className="font-mono font-medium">{formatEUR(item.amount)}</span>
      </span>
    </div>
  );
}

function Pager({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-1 pt-2.5 mt-1 border-t border-border">
      <span className="text-[12px] text-ink-soft mr-1">
        {t("resumenTrimestral.pageIndicator", { page: page + 1, count: pageCount })}
      </span>
      <button
        type="button"
        className="p-1.5 rounded-control hover:bg-surface-alt disabled:opacity-40 disabled:cursor-default cursor-pointer"
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        aria-label={t("resumenTrimestral.pagePrev")}
      >
        <CaretLeft size={13} weight="bold" />
      </button>
      <button
        type="button"
        className="p-1.5 rounded-control hover:bg-surface-alt disabled:opacity-40 disabled:cursor-default cursor-pointer"
        onClick={() => onChange(page + 1)}
        disabled={page === pageCount - 1}
        aria-label={t("resumenTrimestral.pageNext")}
      >
        <CaretRight size={13} weight="bold" />
      </button>
    </div>
  );
}

function FacturasCard({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: QuarterLineItem[];
  emptyMessage: string;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems = items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <Card className="py-5 px-6">
      <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-3">
        {title}
      </div>
      <div className={`${ROWS_HEIGHT} overflow-hidden`}>
        {items.length === 0 && <p className="text-[13px] text-ink-soft">{emptyMessage}</p>}
        {pageItems.map((item) => (
          <LineItemRow key={item.id} item={item} />
        ))}
      </div>
      <Pager page={page} pageCount={pageCount} onChange={setPage} />
    </Card>
  );
}

function GastosMesTabs({
  title,
  items,
  emptyMessage,
  year,
  quarter,
  allMonthsLabel,
}: {
  title: string;
  items: QuarterLineItem[];
  emptyMessage: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  allMonthsLabel: string;
}) {
  const months = quarterMonths(year, quarter);
  const [selected, setSelected] = useState("all");
  const [page, setPage] = useState(0);
  const activeMonth = selected === "all" ? null : months[Number(selected)];
  const filtered = activeMonth
    ? items.filter((it) => it.date >= activeMonth.from && it.date <= activeMonth.to)
    : items;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function selectMonth(value: string) {
    setSelected(value);
    setPage(0);
  }

  return (
    <Card className="py-5 px-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide">{title}</div>
        <SegmentedControl
          options={[
            { value: "all", label: allMonthsLabel },
            ...months.map((m, i) => ({
              value: String(i),
              label: m.label.split(" ")[0].slice(0, 3),
            })),
          ]}
          value={selected}
          onChange={selectMonth}
        />
      </div>
      <div className={`${ROWS_HEIGHT} overflow-hidden`}>
        {filtered.length === 0 && <p className="text-[13px] text-ink-soft">{emptyMessage}</p>}
        {pageItems.map((item) => (
          <LineItemRow key={item.id} item={item} />
        ))}
      </div>
      <Pager page={page} pageCount={pageCount} onChange={setPage} />
    </Card>
  );
}

export function ResumenTrimestral({
  invoices,
  dropPaths,
  dropToken,
  initialQuarterKey,
}: ResumenTrimestralProps) {
  const { t } = useTranslation();
  const currentKey = useCurrentQuarterKey();
  const [focusedKey, setFocusedKey] = useState(initialQuarterKey ?? currentKey);
  const { year, quarter } = parseQuarterKey(focusedKey);
  const period = quarterRange(year, quarter);

  const [altaKey, setAltaKey] = useState<string | null>(null);
  const [presents111, setPresents111] = useState(false);
  useEffect(() => {
    void getPreferences().then((prefs) => {
      setAltaKey(quarterKeyOf(prefs.retaStartDate));
      setPresents111(prefs.presentsModelo111);
    });
  }, []);
  const activeModelos = requiredModelos(presents111);

  const [declarations, setDeclarations] = useState<DeclarationListItem[]>([]);
  type DeclarationFetch =
    { id: number; detail: DeclarationDetail } | { id: number; error: true } | null;
  const [declarationFetch, setDeclarationFetch] = useState<DeclarationFetch>(null);

  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [priorExpenses, setPriorExpenses] = useState<ExpenseRecord[]>([]);
  const [ytdExpenses, setYtdExpenses] = useState<ExpenseRecord[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewFiles, setReviewFiles] = useState<string[] | null>(null);
  const [lastDropToken, setLastDropToken] = useState(dropToken ?? 0);

  function refreshDeclarations() {
    void listDeclarations().then(setDeclarations);
  }

  useEffect(refreshDeclarations, []);

  const matchingListItem = declarations.find((d) => d.year === year && d.quarter === quarter);
  const focusedDeclarationId = matchingListItem?.id ?? null;

  useEffect(() => {
    if (focusedDeclarationId === null) return;
    let cancelled = false;
    getDeclaration(focusedDeclarationId)
      .then((d) => {
        if (cancelled) return;
        setDeclarationFetch(
          d ? { id: focusedDeclarationId, detail: d } : { id: focusedDeclarationId, error: true },
        );
      })
      .catch(() => {
        if (!cancelled) setDeclarationFetch({ id: focusedDeclarationId, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [focusedDeclarationId]);

  // Stale once the focused quarter changes — re-derived here instead of reset in the effect
  // above, so a quarter with no declaration (focusedDeclarationId === null) needs no extra state.
  const currentFetch =
    declarationFetch && declarationFetch.id === focusedDeclarationId ? declarationFetch : null;
  const declaration = currentFetch && "detail" in currentFetch ? currentFetch.detail : null;
  const declarationLoadError = !!currentFetch && "error" in currentFetch;

  function reloadDeclaration() {
    if (focusedDeclarationId === null) return;
    void getDeclaration(focusedDeclarationId).then(
      (d) => d && setDeclarationFetch({ id: focusedDeclarationId, detail: d }),
    );
  }

  // Files dropped onto this screen (see App.tsx's screen-aware drag-drop) open the same review
  // flow as the per-modelo button below, but only make sense once the focused quarter has an
  // active declaration to attach them to. Adjusts state during render (rather than in an effect)
  // since this is purely reacting to a changed prop, not synchronizing with an external system.
  if (dropToken !== undefined && dropToken !== lastDropToken) {
    setLastDropToken(dropToken);
    if (declaration && dropPaths && dropPaths.length > 0) setReviewFiles(dropPaths);
  }

  useEffect(() => {
    void listExpenses({
      from: period.from,
      to: period.to,
      quarterKeys: quartersInRange(period.from, period.to),
    }).then(setExpenses);
  }, [period.from, period.to]);

  const priorPeriod = priorYearPeriod(period);
  useEffect(() => {
    void listExpenses({
      from: priorPeriod.from,
      to: priorPeriod.to,
      quarterKeys: quartersInRange(priorPeriod.from, priorPeriod.to),
    }).then(setPriorExpenses);
  }, [priorPeriod.from, priorPeriod.to]);

  // Year-to-date expenses (Jan 1 → end of the focused quarter) feed the cumulative Modelo 130
  // calc in the review modal.
  const ytdPeriod = { from: quarterRange(year, 1).from, to: period.to };
  useEffect(() => {
    void listExpenses({
      from: ytdPeriod.from,
      to: ytdPeriod.to,
      quarterKeys: quartersInRange(ytdPeriod.from, ytdPeriod.to),
    }).then(setYtdExpenses);
  }, [ytdPeriod.from, ytdPeriod.to]);

  const qInvoices = invoicesInPeriod(invoices, period);
  const projectionSnapshot = buildDeclarationSnapshot(qInvoices, expenses);

  const priorInvoices = invoicesInPeriod(invoices, priorPeriod);
  const priorTotals = buildDeclarationSnapshot(priorInvoices, priorExpenses).totals;
  const revenueDelta = deltaLabel(
    t,
    yoyDelta(projectionSnapshot.totals.invoicedBase, priorTotals.invoicedBase),
  );
  const marginDelta = deltaLabel(t, yoyDelta(projectionSnapshot.totals.margin, priorTotals.margin));

  async function handleExportCsv() {
    setExportError(null);
    const path = await save({
      defaultPath: `resumen_${period.label.replace(/\s+/g, "_")}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;
    setExporting(true);
    try {
      await writeTextFile(path, buildDeclarationCsv(projectionSnapshot));
    } catch (e) {
      setExportError(`No se pudo exportar: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  async function handleAttach() {
    const sourcePath = await pickDeclarationFile();
    if (!sourcePath) return;
    setActionError(null);
    setReviewFiles([sourcePath]);
  }

  async function handleOpenFile(filePath: string | null) {
    if (!filePath) return;
    setActionError(null);
    try {
      await openDeclarationFile(filePath);
    } catch (e) {
      setActionError(String(e));
    }
  }

  async function handleMarkCompleted() {
    if (!declaration) return;
    setActionError(null);
    setCompleting(true);
    try {
      await markDeclarationCompleted(declaration.id);
      reloadDeclaration();
      refreshDeclarations();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setCompleting(false);
    }
  }

  async function confirmDelete() {
    if (!declaration) return;
    await deleteDeclaration(declaration.id);
    setDeletePending(false);
    setDeclarationFetch(null);
    refreshDeclarations();
  }

  async function handleDownloadZip() {
    if (!declaration) return;
    setActionError(null);
    const path = await save({
      defaultPath: `declaracion_Q${declaration.quarter}_${declaration.year}.zip`,
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    });
    if (!path) return;
    setZipping(true);
    try {
      await exportDeclarationZip(declaration.id, path);
    } catch (e) {
      setActionError(String(e));
    } finally {
      setZipping(false);
    }
  }

  const allModelosAttached =
    !!declaration && activeModelos.every((m) => declaration[MODELO_PATH_KEY[m]]);

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span>{`Q${quarter} ${year}`}</span>
            {declaration && (
              <Badge tone={declaration.status === "completed" ? "success" : "info"}>
                {t(`declarations.status.${declaration.status}`)}
              </Badge>
            )}
          </span>
        }
        subtitle={declaration ? undefined : t("resumenTrimestral.projectionSubtitle")}
        actions={
          declaration ? (
            <>
              <Button variant="secondary" onClick={() => void handleDownloadZip()} disabled={zipping}>
                <DownloadSimple size={14} weight="bold" className="inline -mt-0.5 mr-1.5" />
                {zipping
                  ? t("declarations.detail.downloading")
                  : t("declarations.detail.downloadZip")}
              </Button>
              {declaration.status === "in_progress" && (
                <Button onClick={() => void handleMarkCompleted()} disabled={!allModelosAttached || completing}>
                  {completing
                    ? t("declarations.detail.completing")
                    : t("declarations.detail.markCompleted")}
                </Button>
              )}
              {declaration.status === "in_progress" && (
                <Menu>
                  <MenuTrigger
                    className="p-2 rounded-control hover:bg-surface-alt cursor-pointer"
                    aria-label={t("declarations.detail.moreActions")}
                  >
                    <DotsThreeVertical size={16} weight="bold" />
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem danger onSelect={() => setDeletePending(true)}>
                      {t("declarations.detail.delete")}
                    </MenuItem>
                  </MenuContent>
                </Menu>
              )}
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => void handleExportCsv()} disabled={exporting}>
                <DownloadSimple size={14} weight="bold" className="inline -mt-0.5 mr-1.5" />
                {exporting ? t("resumenTrimestral.exportingCsv") : t("resumenTrimestral.exportCsv")}
              </Button>
              <Button onClick={() => setWizardOpen(true)}>{t("declarations.startButton")}</Button>
            </>
          )
        }
      />

      <QuarterTimeline
        focusedKey={focusedKey}
        currentKey={currentKey}
        altaKey={altaKey}
        declarations={declarations}
        onSelect={setFocusedKey}
      />

      {exportError && <div className="text-sm text-danger mb-4">{exportError}</div>}
      {actionError && <ErrorText>{actionError}</ErrorText>}
      {declarationLoadError && (
        <div className="text-sm text-danger mb-4">{t("declarations.errors.loadFailed")}</div>
      )}

      {declaration ? (
        <>
          <div className="grid grid-cols-5 gap-3.5 mb-6">
            <KpiTile
              label={t("declarations.detail.invoicedBase")}
              value={formatEUR(declaration.snapshot.totals.invoicedBase)}
              icon={TrendUp}
              compact
            />
            <KpiTile
              label={t("declarations.detail.irpfWithheld")}
              value={formatEUR(declaration.snapshot.totals.irpfWithheld)}
              icon={Percent}
              compact
            />
            <KpiTile
              label={t("declarations.detail.expensesIrpfWithheld")}
              value={formatEUR(declaration.snapshot.totals.expensesIrpfWithheld)}
              icon={Percent}
              compact
            />
            <KpiTile
              label={t("declarations.detail.netIrpfIncome")}
              value={formatEUR(declaration.snapshot.totals.netIrpfIncome)}
              icon={ChartLineUp}
              compact
            />
            <KpiTile
              label={t("declarations.detail.margin")}
              value={formatEUR(declaration.snapshot.totals.margin)}
              icon={Scales}
              tone={declaration.snapshot.totals.margin < 0 ? "warn" : "neutral"}
              compact
            />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-5">
            <FacturasCard
              key={`${focusedKey}-declared-facturas`}
              title={t("declarations.detail.invoicesTitle")}
              items={declaration.snapshot.invoices.map((inv) => ({
                id: inv.id,
                date: inv.issueDate,
                label: `${inv.clientName}${inv.number ? ` · ${inv.number}` : ""}`,
                amount: inv.total,
              }))}
              emptyMessage={t("declarations.detail.noInvoices")}
            />
            <GastosMesTabs
              key={`${focusedKey}-declared-gastos`}
              title={t("declarations.detail.expensesTitle")}
              items={declaration.snapshot.expenses.map((e) => ({
                id: e.id,
                date: e.date,
                label: e.description || e.category || "—",
                amount: e.amount * (e.deductiblePct / 100),
                totalAmount: e.amount,
              }))}
              emptyMessage={t("declarations.detail.noExpenses")}
              year={declaration.year}
              quarter={declaration.quarter as 1 | 2 | 3 | 4}
              allMonthsLabel={t("resumenTrimestral.allMonths")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card className="px-5 py-1">
              <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide pt-4 pb-2">
                {t("declarations.detail.expensesQuarterTitle")}
              </div>
              <InfoRow
                label={t("declarations.detail.expensesDeductibleBase")}
                value={formatEUR(declaration.snapshot.totals.expensesDeductibleBase)}
                mono
              />
              <InfoRow
                label={t("declarations.detail.expensesIvaDeductible")}
                value={formatEUR(declaration.snapshot.totals.expensesIvaDeductible)}
                mono
              />
            </Card>

            <Card className="px-5 py-1">
              <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide pt-4 pb-2">
                {t("declarations.detail.modelosTitle")}
              </div>
              {activeModelos.map((modelo) => {
                const path = declaration[MODELO_PATH_KEY[modelo]];
                return (
                  <InfoRow
                    key={modelo}
                    label={`Modelo ${modelo}`}
                    value={
                      declaration.status === "completed" ? (
                        <Button
                          variant="secondary"
                          onClick={() => void handleOpenFile(path)}
                          disabled={!path}
                        >
                          {t("declarations.detail.openFile")}
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2.5 justify-end">
                          {path && (
                            <Badge tone="success">{t("declarations.detail.attached")}</Badge>
                          )}
                          <Button variant="secondary" onClick={() => void handleAttach()}>
                            {path
                              ? t("declarations.detail.replaceFile")
                              : t("declarations.detail.attachFile")}
                          </Button>
                        </div>
                      )
                    }
                  />
                );
              })}
            </Card>
          </div>

          <ModeloReviewModal
            open={reviewFiles !== null}
            onOpenChange={(o) => !o && setReviewFiles(null)}
            files={reviewFiles ?? []}
            declarationId={declaration.id}
            year={declaration.year}
            quarter={declaration.quarter}
            snapshot={declaration.snapshot}
            modelo130Ytd={cumulativeModelo130(
              invoices,
              ytdExpenses,
              declaration.year,
              declaration.quarter as 1 | 2 | 3 | 4,
              declaration.gdjRate,
            )}
            onAttached={reloadDeclaration}
          />

          <Sheet
            open={deletePending}
            onOpenChange={setDeletePending}
            title={t("declarations.detail.delete")}
          >
            <p className="text-[13px] text-ink-soft mb-4">
              {t("declarations.detail.confirmDelete")}
            </p>
            <div className="flex gap-2.5 justify-end">
              <Button variant="secondary" onClick={() => setDeletePending(false)}>
                {t("declarations.detail.cancel")}
              </Button>
              <Button variant="ghost-danger" onClick={() => void confirmDelete()}>
                {t("declarations.detail.delete")}
              </Button>
            </div>
          </Sheet>
        </>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-3.5 mb-6">
            <KpiTile
              label={t("declarations.detail.invoicedBase")}
              value={formatEUR(projectionSnapshot.totals.invoicedBase)}
              icon={TrendUp}
              subtitle={revenueDelta ?? undefined}
              compact
            />
            <KpiTile
              label={t("declarations.detail.irpfWithheld")}
              value={formatEUR(projectionSnapshot.totals.irpfWithheld)}
              icon={Percent}
              compact
            />
            <KpiTile
              label={t("declarations.detail.expensesIrpfWithheld")}
              value={formatEUR(projectionSnapshot.totals.expensesIrpfWithheld)}
              icon={Percent}
              compact
            />
            <KpiTile
              label={t("declarations.detail.netIrpfIncome")}
              value={formatEUR(projectionSnapshot.totals.netIrpfIncome)}
              icon={ChartLineUp}
              compact
            />
            <KpiTile
              label={t("declarations.detail.margin")}
              value={formatEUR(projectionSnapshot.totals.margin)}
              icon={Scales}
              tone={projectionSnapshot.totals.margin < 0 ? "warn" : "neutral"}
              subtitle={marginDelta ?? undefined}
              compact
            />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-5">
            <FacturasCard
              key={`${focusedKey}-projection-facturas`}
              title={t("resumenTrimestral.invoicesTitle")}
              items={qInvoices.map((inv) => ({
                id: inv.id,
                date: inv.issueDate ?? "",
                label: `${inv.clientName} · ${invoiceNumberLabel(inv)}`,
                amount: inv.total,
              }))}
              emptyMessage={t("resumenTrimestral.noInvoices")}
            />
            <GastosMesTabs
              key={`${focusedKey}-projection-gastos`}
              title={t("resumenTrimestral.expensesTitle")}
              items={expenses.map((e) => ({
                id: e.id,
                date: e.date,
                label: e.description || e.category || "—",
                amount: e.amount * (e.deductiblePct / 100),
                totalAmount: e.amount,
              }))}
              emptyMessage={t("resumenTrimestral.noExpenses")}
              year={year}
              quarter={quarter}
              allMonthsLabel={t("resumenTrimestral.allMonths")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card className="py-5 px-6">
              <div className="font-bold text-sm mb-3.5">
                {t("declarations.detail.ivaByRateTitle")}
              </div>
              {projectionSnapshot.totals.ivaByRate.length === 0 && (
                <p className="text-[13px] text-ink-soft py-3">
                  {t("declarations.detail.ivaByRateEmpty")}
                </p>
              )}
              {projectionSnapshot.totals.ivaByRate.map(({ rate, base, iva }) => (
                <div
                  key={rate}
                  className="flex justify-between py-2 border-b border-border last:border-b-0 font-medium text-[13.5px]"
                >
                  <span>
                    {rate}% IVA{rate === 0 ? " (exenta)" : ""}
                  </span>
                  <span className="font-semibold font-mono text-[13.5px]">
                    {formatEUR(base)} base · {formatEUR(iva)} IVA
                  </span>
                </div>
              ))}
            </Card>
            <Card className="py-5 px-6">
              <div className="font-bold text-sm mb-3.5">
                {t("declarations.detail.expensesQuarterTitle")}
              </div>
              <div className="flex justify-between py-2 border-b border-border font-medium text-[13.5px]">
                <span>{t("declarations.detail.expensesDeductibleBase")}</span>
                <span className="font-semibold font-mono text-[13.5px]">
                  {formatEUR(projectionSnapshot.totals.expensesDeductibleBase)}
                </span>
              </div>
              <div className="flex justify-between py-2 font-medium text-[13.5px]">
                <span>{t("declarations.detail.expensesIvaDeductible")}</span>
                <span className="font-semibold font-mono text-[13.5px]">
                  {formatEUR(projectionSnapshot.totals.expensesIvaDeductible)}
                </span>
              </div>
            </Card>
          </div>
        </>
      )}

      <DeclarationWizard
        key={focusedKey}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        invoices={invoices}
        year={year}
        quarter={quarter}
        onCreated={refreshDeclarations}
      />
    </div>
  );
}
