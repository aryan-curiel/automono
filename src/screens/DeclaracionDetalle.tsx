import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { DownloadSimple, TrendUp, Percent, ChartLineUp, Scales } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { KpiTile } from "../components/ui/KpiTile";
import { InfoRow } from "../components/ui/InfoRow";
import { ErrorText } from "../components/ui/Field";
import { BackLink, PageHeader } from "../components/PageHeader";
import { ModeloReviewModal } from "../components/ModeloReviewModal";
import {
  exportDeclarationZip,
  getDeclaration,
  markDeclarationCompleted,
  openDeclarationFile,
  pickDeclarationFile,
  type DeclarationDetail as DeclarationDetailRecord,
  type Modelo,
} from "../db/declarations";
import { formatEUR, formatDate } from "../lib/format";

interface DeclaracionDetalleProps {
  declarationId: number;
  onBack: () => void;
  dropPaths?: string[] | null;
  dropToken?: number;
}

const MODELOS: Modelo[] = ["303", "130", "111"];
const MODELO_PATH_KEY: Record<Modelo, "modelo303Path" | "modelo130Path" | "modelo111Path"> = {
  "303": "modelo303Path",
  "130": "modelo130Path",
  "111": "modelo111Path",
};

export function DeclaracionDetalle({
  declarationId,
  onBack,
  dropPaths,
  dropToken,
}: DeclaracionDetalleProps) {
  const { t } = useTranslation();
  const [declaration, setDeclaration] = useState<DeclarationDetailRecord | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewFiles, setReviewFiles] = useState<string[] | null>(null);
  const [lastDropToken, setLastDropToken] = useState(dropToken ?? 0);

  // Files dropped onto this screen (see App.tsx's screen-aware drag-drop) open the same review
  // flow as the per-modelo button below — every attach path validates the file before replacing
  // anything. Adjusts state during render (rather than in an effect) since this is purely
  // reacting to a changed prop, not synchronizing with an external system.
  if (dropToken !== undefined && dropToken !== lastDropToken) {
    setLastDropToken(dropToken);
    if (dropPaths && dropPaths.length > 0) setReviewFiles(dropPaths);
  }

  function reload() {
    getDeclaration(declarationId)
      .then((d) => {
        if (!d) {
          setLoadError(true);
          return;
        }
        setDeclaration(d);
      })
      .catch(() => setLoadError(true));
  }

  useEffect(reload, [declarationId]);

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
      reload();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setCompleting(false);
    }
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

  if (loadError) {
    return (
      <div className="px-8 pb-15">
        <BackLink label={t("declarations.title")} onClick={onBack} />
        <div className="text-sm text-danger">{t("declarations.errors.loadFailed")}</div>
      </div>
    );
  }

  if (!declaration) {
    return (
      <div className="px-8 pb-15">
        <BackLink label={t("declarations.title")} onClick={onBack} />
        <div className="text-sm text-ink-soft">{t("declarations.loading")}</div>
      </div>
    );
  }

  const { totals } = declaration.snapshot;
  const allModelosAttached = MODELOS.every((m) => declaration[MODELO_PATH_KEY[m]]);

  return (
    <div className="px-8 pb-15">
      <BackLink label={t("declarations.title")} onClick={onBack} />

      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span>{`Q${declaration.quarter} ${declaration.year}`}</span>
            <Badge tone={declaration.status === "completed" ? "success" : "info"}>
              {t(`declarations.status.${declaration.status}`)}
            </Badge>
          </span>
        }
        actions={
          <>
            <Button variant="secondary" onClick={handleDownloadZip} disabled={zipping}>
              <DownloadSimple size={14} weight="bold" className="inline -mt-0.5 mr-1.5" />
              {zipping ? t("declarations.detail.downloading") : t("declarations.detail.downloadZip")}
            </Button>
            {declaration.status === "in_progress" && (
              <Button onClick={handleMarkCompleted} disabled={!allModelosAttached || completing}>
                {completing
                  ? t("declarations.detail.completing")
                  : t("declarations.detail.markCompleted")}
              </Button>
            )}
          </>
        }
      />

      {actionError && <ErrorText>{actionError}</ErrorText>}

      <div className="grid grid-cols-5 gap-3.5 mb-6">
        <KpiTile
          label={t("declarations.detail.invoicedBase")}
          value={formatEUR(totals.invoicedBase)}
          icon={TrendUp}
          compact
        />
        <KpiTile
          label={t("declarations.detail.irpfWithheld")}
          value={formatEUR(totals.irpfWithheld)}
          icon={Percent}
          compact
        />
        <KpiTile
          label={t("declarations.detail.expensesIrpfWithheld")}
          value={formatEUR(totals.expensesIrpfWithheld)}
          icon={Percent}
          compact
        />
        <KpiTile
          label={t("declarations.detail.netIrpfIncome")}
          value={formatEUR(totals.netIrpfIncome)}
          icon={ChartLineUp}
          compact
        />
        <KpiTile
          label={t("declarations.detail.margin")}
          value={formatEUR(totals.margin)}
          icon={Scales}
          tone={totals.margin < 0 ? "warn" : "neutral"}
          compact
        />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <Card className="py-5 px-6">
          <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-3">
            {t("declarations.detail.invoicesTitle")}
          </div>
          {declaration.snapshot.invoices.length === 0 && (
            <p className="text-[13px] text-ink-soft">{t("declarations.detail.noInvoices")}</p>
          )}
          {declaration.snapshot.invoices.map((inv) => (
            <div
              key={inv.id}
              className="flex justify-between gap-3 py-2 border-b border-border last:border-b-0 text-[13px]"
            >
              <span className="truncate min-w-0">
                {formatDate(inv.issueDate)} · {inv.clientName} {inv.number && `· ${inv.number}`}
              </span>
              <span className="font-mono font-medium shrink-0">{formatEUR(inv.total)}</span>
            </div>
          ))}
        </Card>
        <Card className="py-5 px-6">
          <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-3">
            {t("declarations.detail.expensesTitle")}
          </div>
          {declaration.snapshot.expenses.length === 0 && (
            <p className="text-[13px] text-ink-soft">{t("declarations.detail.noExpenses")}</p>
          )}
          {declaration.snapshot.expenses.map((e) => (
            <div
              key={e.id}
              className="flex justify-between gap-3 py-2 border-b border-border last:border-b-0 text-[13px]"
            >
              <span className="truncate min-w-0">
                {formatDate(e.date)} · {e.description || e.category || "—"}
              </span>
              <span className="font-mono font-medium shrink-0">{formatEUR(e.amount)}</span>
            </div>
          ))}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="px-5 py-1">
          <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide pt-4 pb-2">
            {t("declarations.detail.expensesQuarterTitle")}
          </div>
          <InfoRow
            label={t("declarations.detail.expensesDeductibleBase")}
            value={formatEUR(totals.expensesDeductibleBase)}
            mono
          />
          <InfoRow
            label={t("declarations.detail.expensesIvaDeductible")}
            value={formatEUR(totals.expensesIvaDeductible)}
            mono
          />
        </Card>

        <Card className="px-5 py-1">
          <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide pt-4 pb-2">
            {t("declarations.detail.modelosTitle")}
          </div>
          {MODELOS.map((modelo) => {
            const path = declaration[MODELO_PATH_KEY[modelo]];
            return (
              <InfoRow
                key={modelo}
                label={`Modelo ${modelo}`}
                value={
                  declaration.status === "completed" ? (
                    <Button variant="secondary" onClick={() => handleOpenFile(path)} disabled={!path}>
                      {t("declarations.detail.openFile")}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2.5 justify-end">
                      {path && <Badge tone="success">{t("declarations.detail.attached")}</Badge>}
                      <Button variant="secondary" onClick={handleAttach}>
                        {path ? t("declarations.detail.replaceFile") : t("declarations.detail.attachFile")}
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
        onAttached={reload}
      />
    </div>
  );
}
