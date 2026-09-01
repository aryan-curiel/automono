import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { FileArrowUp, FileImage, FilePdf, FileText, Info, X } from "@phosphor-icons/react";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { TextArea } from "./ui/Field";
import { Popover } from "./ui/Popover";
import { Toast } from "./ui/Toast";
import {
  attachBusinessDocument,
  deleteBusinessDocument,
  extractBusinessDocumentFields,
  insertBusinessDocument,
  isSupportedBusinessDocumentFile,
  listBusinessDocuments,
  openBusinessDocumentFile,
  pickBusinessDocuments,
  synthesizeUserContext,
} from "../db/businessDocuments";
import type { BusinessDocumentRecord, RegistrationFields } from "../db/businessDocuments";
import { activeApiKey, getLlmSettings } from "../db/llmSettings";
import type { LlmSettingsRecord } from "../db/llmSettings";
import { getUserContext, saveUserContext } from "../db/userContext";

function fileNameOf(path: string): string {
  return path.split("/").pop() ?? path;
}

/** Icon by extension — PDF and image get a distinct glyph, anything else a generic file icon. */
function fileIconFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return FilePdf;
  if (ext === "png" || ext === "jpg" || ext === "jpeg") return FileImage;
  return FileText;
}

interface BusinessDocumentsPanelProps {
  /** Called with any non-null fields the LLM extracted, so the caller can prefill its own form. */
  onExtracted?: (fields: RegistrationFields) => void;
  /** Shows the generated markdown "user context" editor below the document list. Default true. */
  showContext?: boolean;
}

export function BusinessDocumentsPanel({ onExtracted, showContext = true }: BusinessDocumentsPanelProps) {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<BusinessDocumentRecord[]>([]);
  const [draggingOver, setDraggingOver] = useState(false);
  const [processing, setProcessing] = useState<{ index: number; total: number } | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "info" | "warning" | "danger"; message: string } | null>(
    null,
  );

  const [contextText, setContextText] = useState("");
  const [contextSaving, setContextSaving] = useState(false);
  const [contextSaved, setContextSaved] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    void listBusinessDocuments().then(setDocuments);
  }, []);

  useEffect(() => {
    if (!showContext) return;
    void getUserContext().then(setContextText);
  }, [showContext]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter") {
          setDraggingOver(true);
          return;
        }
        if (event.payload.type === "leave") {
          setDraggingOver(false);
          return;
        }
        if (event.payload.type !== "drop") return;
        setDraggingOver(false);
        const paths = event.payload.paths.filter(isSupportedBusinessDocumentFile);
        if (paths.length > 0) void processFiles(paths);
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function processOneFile(
    sourcePath: string,
    llmSettings: LlmSettingsRecord | null,
    apiKey: string | null,
  ): Promise<"extracted" | "skipped" | "failed"> {
    try {
      const filePath = await attachBusinessDocument(sourcePath);
      let fields: RegistrationFields | null = null;
      if (llmSettings && apiKey) {
        fields = await extractBusinessDocumentFields(
          filePath,
          llmSettings.provider,
          apiKey,
          llmSettings.openrouterModel,
        ).catch((err) => {
          // Never blocks the upload itself — the file is still stored for the accountant
          // archive even when extraction fails.
          console.error("Business document extraction failed:", err);
          return null;
        });
      }

      const record = await insertBusinessDocument({
        filePath,
        originalName: fileNameOf(sourcePath),
        label: fields?.label ?? null,
        uploadedAt: new Date().toISOString(),
        summary: fields?.summary ?? null,
        extractedJson: fields ? JSON.stringify(fields) : null,
      });
      setDocuments((docs) => [...docs, record]);

      if (fields) {
        onExtracted?.(fields);
        return "extracted";
      }
      return "skipped";
    } catch (err) {
      console.error("Business document upload failed:", err);
      return "failed";
    }
  }

  async function processFiles(paths: string[]) {
    const llmSettings = await getLlmSettings().catch(() => null);
    const apiKey = llmSettings ? activeApiKey(llmSettings) : null;

    let extracted = 0;
    let failed = 0;
    for (let i = 0; i < paths.length; i++) {
      setProcessing({ index: i + 1, total: paths.length });
      const outcome = await processOneFile(paths[i], llmSettings, apiKey);
      if (outcome === "extracted") extracted++;
      if (outcome === "failed") failed++;
    }
    setProcessing(null);

    if (failed > 0) {
      setToast({ tone: "danger", message: t("documentsPanel.failed", { count: failed }) });
    } else if (apiKey && extracted > 0) {
      setToast({ tone: "success", message: t("documentsPanel.extracted", { count: extracted }) });
    } else if (!apiKey) {
      setToast({
        tone: "info",
        message: t("documentsPanel.noApiKey"),
      });
    }
  }

  async function handlePick() {
    const paths = await pickBusinessDocuments();
    if (paths.length > 0) void processFiles(paths);
  }

  async function handleDelete(id: number) {
    await deleteBusinessDocument(id);
    setDocuments((docs) => docs.filter((d) => d.id !== id));
  }

  async function handleOpen(filePath: string) {
    await openBusinessDocumentFile(filePath).catch((err) => {
      console.error("Failed to open business document:", err);
      setToast({ tone: "danger", message: t("documentsPanel.openFailed") });
    });
  }

  async function handleSaveContext() {
    setContextSaving(true);
    try {
      await saveUserContext(contextText);
      setContextSaved(true);
    } finally {
      setContextSaving(false);
    }
  }

  async function handleRegenerateContext() {
    const summaries = documents.map((d) => d.summary).filter((s): s is string => !!s);
    if (summaries.length === 0) return;
    setRegenerating(true);
    setContextSaved(false);
    try {
      const llmSettings = await getLlmSettings().catch(() => null);
      const apiKey = llmSettings ? activeApiKey(llmSettings) : null;
      if (!llmSettings || !apiKey) {
        setToast({ tone: "info", message: t("documentsPanel.contextRegenerateNoApiKey") });
        return;
      }
      const markdown = await synthesizeUserContext(
        summaries,
        llmSettings.provider,
        apiKey,
        llmSettings.openrouterModel,
      );
      setContextText(markdown);
      await saveUserContext(markdown);
      setContextSaved(true);
    } catch (err) {
      console.error("User context synthesis failed:", err);
      setToast({ tone: "danger", message: t("documentsPanel.contextRegenerateFailed") });
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => void handlePick()}
        onKeyDown={(e) => e.key === "Enter" && void handlePick()}
        className={`flex flex-col items-center justify-center gap-2 py-8 rounded-control border-2
                    border-dashed cursor-pointer transition-colors
                    ${draggingOver ? "border-accent bg-surface-alt" : "border-border hover:bg-surface-alt"}`}
      >
        <FileArrowUp size={22} weight="regular" className="text-ink-soft" />
        <div className="text-[13px] text-ink-soft text-center">
          {t("documentsPanel.dropzone")}
        </div>
        {processing && (
          <div className="text-[12px] text-ink-soft">
            {t("documentsPanel.processing", { index: processing.index, total: processing.total })}
          </div>
        )}
      </div>

      {documents.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] gap-3 mt-3">
          {documents.map((doc) => {
            const FileIcon = fileIconFor(doc.filePath);
            const title = doc.label ?? doc.originalName;
            return (
              <Card key={doc.id} className="relative p-3 flex flex-col items-center gap-2">
                <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                  {doc.summary && (
                    <Popover content={doc.summary}>
                      <button
                        type="button"
                        aria-label={t("documentsPanel.descriptionAriaLabel")}
                        className="text-ink-soft hover:text-ink cursor-pointer p-0.5 rounded-control"
                      >
                        <Info size={13} weight="regular" />
                      </button>
                    </Popover>
                  )}
                  <button
                    type="button"
                    aria-label={t("documentsPanel.deleteAriaLabel")}
                    onClick={() => void handleDelete(doc.id)}
                    className="text-ink-soft hover:text-danger cursor-pointer p-0.5 rounded-control"
                  >
                    <X size={13} weight="regular" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void handleOpen(doc.filePath)}
                  className="flex flex-col items-center gap-2 cursor-pointer mt-2 w-full"
                  title={t("documentsPanel.openTitle")}
                >
                  <FileIcon size={30} weight="regular" className="text-ink-soft" />
                  <div className="text-[12px] font-medium text-center line-clamp-2">{title}</div>
                </button>
              </Card>
            );
          })}
        </div>
      )}

      {showContext && (
        <div className="mt-5 pt-4 border-t border-border">
          <div className="font-bold text-sm mb-1.5">{t("documentsPanel.contextTitle")}</div>
          <div className="text-[13px] text-ink-soft mb-3">
            {t("documentsPanel.contextDescription")}
          </div>
          <TextArea
            rows={12}
            className="font-mono text-[12px]"
            value={contextText}
            onChange={(e) => {
              setContextText(e.target.value);
              setContextSaved(false);
            }}
          />
          <div className="flex items-center gap-2.5 mt-3">
            <Button onClick={() => void handleSaveContext()} disabled={contextSaving}>
              {contextSaving ? t("documentsPanel.contextSaving") : t("documentsPanel.contextSave")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleRegenerateContext()}
              disabled={regenerating || documents.length === 0}
            >
              {regenerating ? t("documentsPanel.contextRegenerating") : t("documentsPanel.contextRegenerate")}
            </Button>
            {contextSaved && <span className="text-[13px] text-ink-soft">{t("documentsPanel.contextSaved")}</span>}
          </div>
        </div>
      )}

      <Toast message={toast?.message ?? null} tone={toast?.tone} onDismiss={() => setToast(null)} />
    </>
  );
}
