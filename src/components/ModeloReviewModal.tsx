import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle, CircleNotch, WarningCircle, X, Circle } from "@phosphor-icons/react";
import { Sheet } from "./ui/Sheet";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import type { Tone } from "./ui/Badge";
import {
  attachDeclarationFile,
  detectModelo,
  extractModeloFields,
  type Modelo,
} from "../db/declarations";
import { activeApiKey, getLlmSettings } from "../db/llmSettings";
import { buildModeloReport, type ModeloReportRow } from "../lib/modeloReport";
import type { DeclarationSnapshot } from "../lib/quarterlyDeclaration";
import { formatEUR } from "../lib/format";

type Step = "detect" | "extract" | "done";
// Only "detect" and "extract" are independently async and worth a spinner — "period" (checked as
// part of detection) and "compare" (a synchronous step run once extraction resolves) never get
// their own pending state, so showing them as separate steps implied false granularity.
const STEP_KEYS = ["detect", "extract"] as const;

interface TabState {
  path: string;
  fileName: string;
  step: Step;
  error: string | null;
  modelo: Modelo | null;
  report: ModeloReportRow[] | null;
  approving: boolean;
}

function fileNameOf(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

function stepIndexOf(step: Step): number {
  return step === "detect" ? 0 : step === "extract" ? 1 : 2;
}

function formatPeriodValue(v: number | null): string {
  if (v === null) return "—";
  return `Q${v % 10} ${Math.floor(v / 10)}`;
}

const ROW_TONE: Record<ModeloReportRow["status"], Tone> = {
  match: "success",
  mismatch: "danger",
  missing: "warning",
};

interface ModeloReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: string[];
  declarationId: number;
  year: number;
  quarter: number;
  snapshot: DeclarationSnapshot;
  onAttached: () => void;
}

/** Reviews one or more dropped/picked modelo PDFs before they replace whatever's currently
 * attached: detects which modelo (303/130/111) each is, checks its declared quarter/year, pulls
 * its headline figures, and compares them against AutoMono's own calculated totals. Only a file
 * that can't be recognized as any of the three modelos is a hard block — every other discrepancy
 * (wrong period, a mismatched figure) is shown but still overridable via Approve. */
export function ModeloReviewModal({
  open,
  onOpenChange,
  files,
  declarationId,
  year,
  quarter,
  snapshot,
  onAttached,
}: ModeloReviewModalProps) {
  const { t } = useTranslation();
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  // Tracks which `files` batch `tabs` was last built from, so a new batch (either a fresh open
  // or another drop while the modal is already open) resets tabs during render rather than in an
  // effect — see https://react.dev/learn/you-might-not-need-an-effect#adjusting-state.
  const [processedFiles, setProcessedFiles] = useState<string[] | null>(null);

  if (open && files.length > 0 && files !== processedFiles) {
    setProcessedFiles(files);
    setTabs(
      files.map((path) => ({
        path,
        fileName: fileNameOf(path),
        step: "detect",
        error: null,
        modelo: null,
        report: null,
        approving: false,
      })),
    );
    setActiveIndex(0);
  }

  useEffect(() => {
    if (!open || files.length === 0) return;
    let cancelled = false;
    (async () => {
      const llmSettings = await getLlmSettings().catch(() => null);
      const apiKey = llmSettings ? activeApiKey(llmSettings) : null;

      // Processed one at a time rather than in parallel — keeps LLM calls (when configured) from
      // firing in a burst, and per-tab progress is meaningful to show either way.
      for (let i = 0; i < files.length; i++) {
        if (cancelled) return;
        const path = files[i];
        try {
          const detection = await detectModelo(path);
          if (cancelled) return;
          setTabs((prev) =>
            prev.map((tab, idx) =>
              idx === i ? { ...tab, modelo: detection.modelo, step: "extract" } : tab,
            ),
          );

          const fields = await extractModeloFields(
            path,
            detection.modelo,
            llmSettings?.provider ?? null,
            apiKey,
            llmSettings?.openrouterModel ?? null,
          );
          if (cancelled) return;

          const report = buildModeloReport(detection.modelo, snapshot, fields, {
            expectedYear: year,
            expectedQuarter: quarter,
            detectedYear: detection.year,
            detectedQuarter: detection.quarter,
          });
          setTabs((prev) =>
            prev.map((tab, idx) => (idx === i ? { ...tab, step: "done", report } : tab)),
          );
        } catch (e) {
          if (cancelled) return;
          // The backend's hard-stop for an unrecognized PDF always throws this fixed Spanish
          // string (see modelo_review.rs's detect_modelo) — anything else is a generic failure.
          const unrecognized = String(e).toLowerCase().includes("no se reconoce");
          const error = t(
            unrecognized
              ? "declarations.review.errors.unrecognized"
              : "declarations.review.errors.generic",
          );
          setTabs((prev) => prev.map((tab, idx) => (idx === i ? { ...tab, error } : tab)));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Re-runs only when a fresh batch of files is opened, not on every snapshot/year/quarter
    // identity change (those are stable for the lifetime of one declaration screen).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, files]);

  function removeTab(index: number) {
    setTabs((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) onOpenChange(false);
      setActiveIndex((current) => Math.max(0, Math.min(current, next.length - 1)));
      return next;
    });
  }

  async function handleApprove(index: number) {
    const tab = tabs[index];
    if (!tab.modelo) return;
    setTabs((prev) => prev.map((t, i) => (i === index ? { ...t, approving: true } : t)));
    try {
      await attachDeclarationFile(declarationId, year, quarter, tab.modelo, tab.path);
      onAttached();
      removeTab(index);
    } catch {
      const error = t("declarations.review.errors.generic");
      setTabs((prev) => prev.map((t, i) => (i === index ? { ...t, approving: false, error } : t)));
    }
  }

  if (tabs.length === 0) return null;
  const tab = tabs[Math.min(activeIndex, tabs.length - 1)];

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("declarations.review.title")}
      maxWidthClassName="max-w-3xl"
    >
      <div className="flex gap-5">
        {tabs.length > 1 && (
          <div className="flex flex-col gap-1 w-52 shrink-0 max-h-[420px] overflow-y-auto pr-4 border-r border-border">
            {tabs.map((tb, i) => {
              const tone: Tone = tb.error
                ? "danger"
                : tb.step !== "done"
                  ? "neutral"
                  : tb.report?.some((r) => r.status === "mismatch")
                    ? "warning"
                    : "success";
              return (
                <div key={tb.path} className="group relative">
                  <button
                    onClick={() => setActiveIndex(i)}
                    className={`w-full flex flex-col gap-1 text-left pl-2.5 pr-7 py-2 rounded-control cursor-pointer transition-colors duration-150
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring
                      ${i === activeIndex ? "bg-surface-alt" : "hover:bg-surface-alt"}`}
                  >
                    <span className="flex items-center gap-2">
                      {tb.step !== "done" && !tb.error && (
                        <CircleNotch size={13} className="animate-spin text-ink-soft shrink-0" />
                      )}
                      {tb.error && (
                        <WarningCircle size={13} weight="fill" className="text-danger shrink-0" />
                      )}
                      {tb.step === "done" && !tb.error && (
                        <CheckCircle
                          size={13}
                          weight="fill"
                          className={`shrink-0 ${tone === "warning" ? "text-warn" : "text-success"}`}
                        />
                      )}
                      <span className="truncate flex-1 text-[13px] font-medium">{tb.fileName}</span>
                    </span>
                    <span className="pl-[21px]">
                      <Badge tone={tone}>{tb.modelo ? `Modelo ${tb.modelo}` : "?"}</Badge>
                    </span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTab(i);
                    }}
                    className="absolute right-1.5 top-2 text-ink-soft opacity-0 group-hover:opacity-100 hover:text-ink cursor-pointer transition-opacity duration-150 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    aria-label={t("declarations.review.removeTab")}
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {tabs.length <= 1 && (
            <div className="flex items-center justify-between mb-3">
              <div className="text-[13px] font-semibold truncate min-w-0 flex-1">
                {tab.fileName}
              </div>
              <button
                onClick={() => removeTab(activeIndex)}
                className="text-ink-soft hover:text-ink cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                aria-label={t("declarations.review.removeTab")}
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div className="flex flex-col gap-1.5 mb-4">
            {STEP_KEYS.map((key, i) => {
              const current = stepIndexOf(tab.step);
              const status =
                tab.error && i === current
                  ? "error"
                  : i < current
                    ? "done"
                    : i === current
                      ? "active"
                      : "pending";
              return (
                <div key={key} className="flex items-center gap-2 text-[13px]">
                  {status === "done" && (
                    <CheckCircle size={15} weight="fill" className="text-success" />
                  )}
                  {status === "active" && (
                    <CircleNotch size={15} className="animate-spin text-accent" />
                  )}
                  {status === "error" && (
                    <WarningCircle size={15} weight="fill" className="text-danger" />
                  )}
                  {status === "pending" && <Circle size={15} className="text-ink-soft/40" />}
                  <span className={status === "pending" ? "text-ink-soft" : ""}>
                    {t(`declarations.review.steps.${key}`)}
                  </span>
                </div>
              );
            })}
          </div>

          {tab.error && <div className="text-sm text-danger mb-4">{tab.error}</div>}

          {tab.report && (
            <>
              <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-2">
                {t("declarations.review.reportTitle")}
              </div>
              <table className="w-full text-[13px] mb-4">
                <thead>
                  <tr className="text-left text-ink-soft">
                    <th className="font-medium pb-1.5"> </th>
                    <th className="font-medium pb-1.5 text-right">
                      {t("declarations.review.columnCalculated")}
                    </th>
                    <th className="font-medium pb-1.5 text-right">
                      {t("declarations.review.columnFile")}
                    </th>
                    <th className="font-medium pb-1.5 text-right"> </th>
                  </tr>
                </thead>
                <tbody>
                  {tab.report.map((row) => (
                    <tr key={row.key} className="border-t border-border">
                      <td className="py-1.5">{row.label}</td>
                      <td className="py-1.5 text-right font-mono">
                        {row.key === "period"
                          ? formatPeriodValue(row.expected)
                          : formatEUR(row.expected ?? 0)}
                      </td>
                      <td className="py-1.5 text-right font-mono">
                        {row.key === "period"
                          ? formatPeriodValue(row.extracted)
                          : row.extracted !== null
                            ? formatEUR(row.extracted)
                            : "—"}
                      </td>
                      <td className="py-1.5 text-right">
                        <Badge tone={ROW_TONE[row.status]}>
                          {t(`declarations.review.status.${row.status}`)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" onClick={() => removeTab(activeIndex)}>
              {t("declarations.review.cancel")}
            </Button>
            <Button
              onClick={() => handleApprove(activeIndex)}
              disabled={!tab.report || tab.approving}
            >
              {tab.approving
                ? t("declarations.review.approving")
                : t("declarations.review.approve")}
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
