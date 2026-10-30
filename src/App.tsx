import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar } from "./components/Sidebar";
import { CommandPalette } from "./components/CommandPalette";
import { DragDropOverlay } from "./components/DragDropOverlay";
import { BackLink } from "./components/PageHeader";
import { Button } from "./components/ui/Button";
import { Sheet } from "./components/ui/Sheet";
import { Toast } from "./components/ui/Toast";
import { checkForUpdate } from "./lib/updates";
import { TooltipProvider } from "./components/ui/Tooltip";
import { getDb } from "./db/client";
import { listClients } from "./db/clients";
import type { ClientRecord } from "./db/clients";
import { listContracts } from "./db/contracts";
import type { ContractRecord } from "./db/contracts";
import type { SearchResult } from "./lib/search";
import { Dashboard } from "./screens/Dashboard";
import { Clientes } from "./screens/Clientes";
import { ClienteDetalle } from "./screens/ClienteDetalle";
import { ClienteForm } from "./screens/ClienteForm";
import { Facturas } from "./screens/Facturas";
import { Conciliacion } from "./screens/Conciliacion";
import { FacturaDetalle } from "./screens/FacturaDetalle";
import { FacturaNueva } from "./screens/FacturaNueva";
import { FacturaRectificar } from "./screens/FacturaRectificar";
import { Presupuestos } from "./screens/Presupuestos";
import { PresupuestoForm } from "./screens/PresupuestoForm";
import { ContratoDetalle } from "./screens/ContratoDetalle";
import { ContratoForm } from "./screens/ContratoForm";
import { Gastos } from "./screens/Gastos";
import { GastoDetalle } from "./screens/GastoDetalle";
import { GastoForm } from "./screens/GastoForm";
import { ResumenTrimestral } from "./screens/ResumenTrimestral";
import { ResumenAnual } from "./screens/ResumenAnual";
import { Asistente } from "./screens/Asistente";
import { Ajustes } from "./screens/Ajustes";
import { Onboarding } from "./screens/Onboarding";
import {
  deleteInvoice,
  duplicateInvoice,
  getInvoiceWithLines,
  listInvoices,
  markInvoicePaid,
  openOrGeneratePdf,
  type InvoiceLineRecord,
  type InvoiceListItem,
  type InvoiceRecord,
} from "./db/invoices";
import { getBusinessProfile } from "./db/businessProfile";
import type { BusinessProfileRecord } from "./db/businessProfile";
import { getPreferences, updatePreferences } from "./db/preferences";
import type { PreferencesRecord } from "./db/preferences";
import { checkAutoBackup } from "./db/backup";
import { runFilingReminders } from "./lib/filingReminders";
import { runRecurringInvoices } from "./lib/recurring";
import { isSupportedExpenseFile } from "./db/expenses";
import {
  countReceiptInbox,
  ingestReceipt,
  listInboxFolderFiles,
  listReceiptInbox,
  pickReceiptFiles,
} from "./db/receiptInbox";
import { receiptsToIngest } from "./lib/receiptInbox";
import { parseHash, useHashRoute } from "./lib/hashRoute";
import type { RectificationType, Screen } from "./types";

export default function App() {
  const { t, i18n } = useTranslation();
  // `location.hash` is the single source of truth for screen + selected record id
  // (`#/factura-detalle/12`). `navigate` sets the hash; a hashchange listener in the
  // hook drives re-renders, so macOS back/forward replay screen history for free.
  const { screen, recordId, navigate } = useHashRoute();
  const recordNum =
    recordId != null && recordId !== "" && Number.isFinite(Number(recordId))
      ? Number(recordId)
      : null;
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [preferences, setPreferences] = useState<PreferencesRecord | null>(null);
  const [dbReady, setDbReady] = useState(false);
  const [dbErrorToast, setDbErrorToast] = useState<string | null>(null);
  const [pendingDropPath, setPendingDropPath] = useState<string | null>(null);
  const [dropToken, setDropToken] = useState(0);
  const [declarationDropPaths, setDeclarationDropPaths] = useState<string[] | null>(null);
  const [declarationDropToken, setDeclarationDropToken] = useState(0);
  const [dragOver, setDragOver] = useState<{
    supported: boolean;
    context: "expense" | "declaration";
  } | null>(null);
  const preferencesRef = useRef(preferences);

  const [inboxCount, setInboxCount] = useState(0);
  const [inboxRefreshToken, setInboxRefreshToken] = useState(0);
  const sweepingRef = useRef(false);

  // Unsaved-changes guard. The mounted form (GastoForm / FacturaNueva) reports its
  // dirty state here; navigation reachable while a form is on screen routes through
  // `guardNav`, which defers the action behind a confirm dialog when the form is dirty.
  const formDirtyRef = useRef(false);
  const setFormDirty = useCallback((dirty: boolean) => {
    formDirtyRef.current = dirty;
  }, []);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  const guardNav = useCallback((action: () => void) => {
    if (formDirtyRef.current) setPendingNav(() => action);
    else action();
  }, []);

  // Bumped after an in-sheet form saves, so a list that stayed mounted behind the
  // sheet (Presupuestos — it returns to its list on save) refetches. Clientes/Gastos
  // forms navigate to a detail route on save, which remounts the list on the way back.
  const [listRefreshToken, setListRefreshToken] = useState(0);
  const bumpListRefresh = useCallback(() => setListRefreshToken((n) => n + 1), []);

  // Receipt inbox: count drives the sidebar badge; inboxRefreshToken forces a mounted queue to
  // refetch after a folder sweep; sweepingRef guards against a focus event firing a second sweep
  // while the first is still ingesting.
  const refreshInboxCount = useCallback(() => {
    void countReceiptInbox()
      .then(setInboxCount)
      .catch(() => {});
  }, []);

  // ponytail: poll-on-focus + launch, no notify/fs-watch. A receipt dropped in the folder shows
  // up the next time the window gets focus — good enough for a single-user desktop app; upgrade
  // to a Rust `notify` watcher only if that latency ever actually bites.
  const sweepInbox = useCallback(async () => {
    if (sweepingRef.current) return;
    // Fetched fresh (not from preferencesRef) so toggling the inbox on in Ajustes takes effect on
    // the next window focus without an app restart.
    const prefs = await getPreferences().catch(() => null);
    if (!prefs?.receiptInboxEnabled || !prefs.receiptInboxPath) return;
    sweepingRef.current = true;
    try {
      const [scanned, queue] = await Promise.all([
        listInboxFolderFiles(prefs.receiptInboxPath),
        listReceiptInbox(),
      ]);
      const todo = receiptsToIngest(
        scanned,
        queue.map((q) => q.sourceName),
      );
      if (todo.length === 0) return;
      for (const path of todo) {
        await ingestReceipt(path, true).catch((err) =>
          console.error("receipt inbox sweep failed for", path, err),
        );
      }
      setInboxRefreshToken((n) => n + 1);
      refreshInboxCount();
    } finally {
      sweepingRef.current = false;
    }
  }, [refreshInboxCount]);

  const quickAddReceipts = useCallback(async () => {
    const paths = await pickReceiptFiles();
    if (paths.length === 0) return;
    for (const path of paths) {
      await ingestReceipt(path, false).catch((err) =>
        console.error("receipt quick-add failed", err),
      );
    }
    setInboxRefreshToken((n) => n + 1);
    refreshInboxCount();
    guardNav(() => navigate("gastos", "inbox"));
  }, [refreshInboxCount, guardNav, navigate]);
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoiceDetail, setInvoiceDetail] = useState<{
    invoice: InvoiceRecord;
    lines: InvoiceLineRecord[];
  } | null>(null);
  const [invoiceDetailError, setInvoiceDetailError] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfileRecord | null>(null);
  const [pdfErrorToast, setPdfErrorToast] = useState<string | null>(null);
  const [updateToast, setUpdateToast] = useState<string | null>(null);

  const [rectType, setRectType] = useState<RectificationType>("partial");
  const [rectReason, setRectReason] = useState("");

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteClients, setPaletteClients] = useState<ClientRecord[]>([]);
  const [paletteContracts, setPaletteContracts] = useState<ContractRecord[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Confirm before closing the window with an unsaved form open.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const win = getCurrentWindow();
    void win
      .onCloseRequested((event) => {
        if (!formDirtyRef.current) return;
        event.preventDefault();
        setPendingNav(() => () => void win.destroy());
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        // Read the live screen from the hash (no ref to keep in sync).
        const current = parseHash(window.location.hash).screen;
        // The Documentos tab in Ajustes (and onboarding's document step) has its own drop
        // handling — this global listener must stay out of the way entirely there, or a
        // dropped PDF would also get hijacked into navigating to "gasto-nuevo" below.
        if (current === "ajustes" || !preferencesRef.current?.onboardingCompleted) {
          setDragOver(null);
          return;
        }
        const onDeclaration = current === "resumen-trimestral";
        if (event.payload.type === "enter") {
          const path = event.payload.paths[0];
          const supported = onDeclaration
            ? !!path && path.toLowerCase().endsWith(".pdf")
            : !!path && isSupportedExpenseFile(path);
          setDragOver({ supported, context: onDeclaration ? "declaration" : "expense" });
          return;
        }
        if (event.payload.type === "leave") {
          setDragOver(null);
          return;
        }
        if (event.payload.type !== "drop") return;
        setDragOver(null);
        if (onDeclaration) {
          const pdfPaths = event.payload.paths.filter((p) => p.toLowerCase().endsWith(".pdf"));
          if (pdfPaths.length === 0) return;
          setDeclarationDropPaths(pdfPaths);
          setDeclarationDropToken((n) => n + 1);
          return;
        }
        const path = event.payload.paths[0];
        if (!path || !isSupportedExpenseFile(path)) return;
        guardNav(() => {
          setPendingDropPath(path);
          setDropToken((n) => n + 1);
          navigate("gasto-nuevo");
        });
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [guardNav, navigate]);

  // ponytail: re-fetches on every open (cheap local queries) instead of a shared store, so
  // results never go stale between a client/contract edit and the next search.
  useEffect(() => {
    if (!paletteOpen) return;
    void listClients().then(setPaletteClients);
    void listContracts().then(setPaletteContracts);
  }, [paletteOpen]);

  function handlePaletteSelect(result: SearchResult) {
    guardNav(() => {
      if (result.type === "client") navigate("cliente-detalle", result.id);
      else if (result.type === "invoice") openInvoice(result.id);
      else navigate("contrato-detalle", result.id);
    });
  }

  useEffect(() => {
    getDb()
      .catch(() => setDbErrorToast(t("settings.dbError")))
      .finally(() => setDbReady(true));
  }, [t]);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    // Offline or GitHub unreachable: stay quiet, Ajustes has a manual check.
    void checkForUpdate().then(
      (update) =>
        update && setUpdateToast(t("settings.updateAvailableToast", { version: update.version })),
      () => {},
    );
  }, [t]);

  useEffect(() => {
    if (!dbReady) return;
    void listInvoices()
      .then(setInvoices)
      .finally(() => setInvoicesLoading(false));
    // Not keyed on `screen`: mutations already refresh via setInvoices(await listInvoices()),
    // so re-querying every navigation is redundant work that scales with invoice count (#17).
  }, [dbReady]);

  useEffect(() => {
    if (!dbReady) return;
    void getBusinessProfile().then(setBusinessProfile);
  }, [dbReady]);

  useEffect(() => {
    if (!dbReady) return;
    void getPreferences().then((prefs) => {
      setPreferences(prefs);
      setTheme(prefs.theme);
      void i18n.changeLanguage(prefs.language);
    });
  }, [dbReady, i18n]);

  useEffect(() => {
    if (!dbReady) return;
    void checkAutoBackup();
    void runFilingReminders();
    void runRecurringInvoices().then((drafted) => {
      if (drafted > 0) void listInvoices().then(setInvoices);
    });
  }, [dbReady]);

  // Receipt-inbox badge + a folder sweep on launch.
  useEffect(() => {
    if (!dbReady) return;
    refreshInboxCount();
    void sweepInbox();
  }, [dbReady, refreshInboxCount, sweepInbox]);

  // Poll the inbox folder whenever the window regains focus.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) void sweepInbox();
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, [sweepInbox]);

  // Cmd/Ctrl+Shift+U — quick-add receipts straight into the review queue (the app-global
  // stand-in for a menu-bar / dock quick-add; see PR notes).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "u") {
        e.preventDefault();
        void quickAddReceipts();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [quickAddReceipts]);

  useEffect(() => {
    if (screen !== "factura-detalle" || recordNum === null) return;
    getInvoiceWithLines(recordNum)
      .then((detail) => {
        setInvoiceDetail(detail);
        setInvoiceDetailError(false);
      })
      .catch(() => setInvoiceDetailError(true));
  }, [screen, recordNum]);

  // The edit/preset for a "nueva"/"editar" form is derived from the route id
  // (`#/factura-nueva/12` = edit 12, `#/factura-nueva` = blank), so navigating is
  // enough — no separate preset state to set or clear.
  function navigateFromDashboard(next: Screen, id?: string) {
    // Clear any file left over from a previous drag-drop so a plain "new expense"
    // from the dashboard opens a blank form.
    if (next === "gasto-nuevo") setPendingDropPath(null);
    navigate(next, id);
  }

  const rectifyingInvoice = invoices.find((i) => i.id === recordNum) ?? null;

  function openInvoice(id: number) {
    navigate("factura-detalle", id);
  }

  // Where each create/edit sheet goes when dismissed: back to the record's detail
  // when editing, otherwise to the list. Passed through `guardNav` by every caller.
  const closeClienteForm = () =>
    screen === "cliente-editar" && recordNum !== null
      ? navigate("cliente-detalle", recordNum)
      : navigate("clientes");
  const closeFacturaForm = () => {
    void listInvoices().then(setInvoices);
    navigate("facturas");
  };
  const closeGastoForm = () =>
    screen === "gasto-editar" && recordNum !== null
      ? navigate("gasto-detalle", recordNum)
      : navigate("gastos");

  async function handleQuoteConverted(invoiceId: number) {
    setInvoices(await listInvoices());
    navigate("factura-nueva", invoiceId);
  }

  async function confirmMarkPaid() {
    if (recordNum === null) return;
    try {
      await markInvoicePaid(recordNum);
      const [list, detail] = await Promise.all([listInvoices(), getInvoiceWithLines(recordNum)]);
      setInvoices(list);
      setInvoiceDetail(detail);
    } catch (err) {
      setPdfErrorToast(String(err));
    } finally {
      setMarkingPaid(false);
    }
  }

  async function handleDuplicateInvoice(id: number) {
    try {
      const duplicate = await duplicateInvoice(id);
      setInvoices(await listInvoices());
      navigate("factura-nueva", duplicate.id);
    } catch (err) {
      setPdfErrorToast(String(err));
    }
  }

  async function handleDeleteInvoice(id: number) {
    try {
      await deleteInvoice(id);
      if (id === recordNum) {
        setInvoiceDetail(null);
        navigate("facturas");
      }
      setInvoices(await listInvoices());
    } catch (err) {
      setPdfErrorToast(String(err));
    }
  }

  async function handleDownloadPdf(force = false) {
    if (recordNum === null) return;
    setGeneratingPdf(true);
    try {
      await openOrGeneratePdf(recordNum, force);
      const detail = await getInvoiceWithLines(recordNum);
      setInvoiceDetail(detail);
    } catch (err) {
      setPdfErrorToast(String(err));
    } finally {
      setGeneratingPdf(false);
    }
  }

  function handleToggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      void updatePreferences({ theme: next });
      return next;
    });
  }

  if (!dbReady || !preferences) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg text-ink-soft text-sm">
        {t("app.initializing")}
      </div>
    );
  }

  if (!preferences.onboardingCompleted) {
    return (
      <Onboarding
        initialPreferences={preferences}
        onComplete={(finalPrefs) => {
          setPreferences(finalPrefs);
          setTheme(finalPrefs.theme);
          void getBusinessProfile().then(setBusinessProfile);
        }}
      />
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-bg text-ink transition-colors overflow-hidden">
        <Sidebar
          screen={screen}
          receiptInboxCount={inboxCount}
          onNavigate={(next) => guardNav(() => navigate(next))}
        />

        <div className="flex-1 overflow-y-auto min-w-0">
          {screen === "dashboard" && (
            <Dashboard
              invoices={invoices}
              loading={invoicesLoading}
              onNavigate={navigateFromDashboard}
              onDuplicateInvoice={handleDuplicateInvoice}
            />
          )}

          {/* List stays mounted while its create/edit sheet is open, so scroll + search
              survive the open (issue #87). */}
          {(screen === "clientes" || screen === "cliente-nuevo" || screen === "cliente-editar") && (
            <Clientes
              onOpenClient={(id) => navigate("cliente-detalle", id)}
              onNewClient={() => navigate("cliente-nuevo")}
            />
          )}

          {screen === "cliente-detalle" && recordNum !== null && (
            <ClienteDetalle
              clientId={recordNum}
              invoices={invoices}
              onBack={() => navigate("clientes")}
              onEditClient={(id) => navigate("cliente-editar", id)}
              onDeleted={() => navigate("clientes")}
              onOpenContract={(id) => navigate("contrato-detalle", id)}
              onNewContract={(clientId) => navigate("contrato-nuevo", clientId)}
            />
          )}

          {(screen === "facturas" || screen === "factura-nueva") && (
            <Facturas
              invoices={invoices}
              loading={invoicesLoading}
              view={recordId === "cobros" ? "cobros" : "list"}
              businessProfile={businessProfile}
              onSetView={(v) => navigate("facturas", v === "cobros" ? "cobros" : null)}
              onOpenInvoice={openInvoice}
              onNewInvoice={() => navigate("factura-nueva")}
              onDeleteInvoice={(id) => void handleDeleteInvoice(id)}
              onDuplicateInvoice={(id) => void handleDuplicateInvoice(id)}
              onPaymentRecorded={() => void listInvoices().then(setInvoices)}
            />
          )}

          {screen === "conciliacion" && (
            <Conciliacion
              invoices={invoices}
              onPaymentRecorded={() => void listInvoices().then(setInvoices)}
            />
          )}

          {screen === "factura-detalle" && invoiceDetailError && (
            <div className="px-8">
              <BackLink label={t("invoices.title")} onClick={() => navigate("facturas")} />
              <div className="text-sm text-danger">{t("invoices.errors.loadFailed")}</div>
            </div>
          )}

          {screen === "factura-detalle" && !invoiceDetail && !invoiceDetailError && (
            <div className="px-8">
              <BackLink label={t("invoices.title")} onClick={() => navigate("facturas")} />
              <div className="text-sm text-ink-soft">{t("invoices.loading")}</div>
            </div>
          )}

          {screen === "factura-detalle" && invoiceDetail && businessProfile && (
            <FacturaDetalle
              invoice={invoiceDetail.invoice}
              lines={invoiceDetail.lines}
              invoices={invoices}
              businessProfile={businessProfile}
              markingPaid={markingPaid}
              generatingPdf={generatingPdf}
              onBack={() => navigate("facturas")}
              onOpenMarkPaid={() => setMarkingPaid(true)}
              onCancelMarkPaid={() => setMarkingPaid(false)}
              onConfirmMarkPaid={() => void confirmMarkPaid()}
              onStartRectification={() => {
                setRectType("partial");
                setRectReason("");
                navigate("factura-rectificar", invoiceDetail.invoice.id);
              }}
              onDownloadPdf={(force) => void handleDownloadPdf(force)}
              onDelete={() => void handleDeleteInvoice(invoiceDetail.invoice.id)}
              onDuplicate={() => void handleDuplicateInvoice(invoiceDetail.invoice.id)}
              onEdit={() => navigate("factura-nueva", invoiceDetail.invoice.id)}
            />
          )}

          {screen === "factura-rectificar" && rectifyingInvoice && (
            <FacturaRectificar
              original={rectifyingInvoice}
              rectType={rectType}
              onSetFull={() => setRectType("full")}
              onSetPartial={() => setRectType("partial")}
              reason={rectReason}
              onReasonChange={setRectReason}
              onCancel={() => navigate("factura-detalle", rectifyingInvoice.id)}
              onEmit={(created) => {
                void (async () => {
                  setInvoices(await listInvoices());
                  navigate("factura-detalle", created.id);
                })();
              }}
            />
          )}

          {(screen === "presupuestos" ||
            screen === "presupuesto-nuevo" ||
            screen === "presupuesto-editar") && (
            <Presupuestos
              refreshToken={listRefreshToken}
              onOpenQuote={(id) => navigate("presupuesto-editar", id)}
              onNewQuote={() => navigate("presupuesto-nuevo")}
              onConverted={(invoiceId) => void handleQuoteConverted(invoiceId)}
            />
          )}

          {screen === "contrato-nuevo" && (
            <ContratoForm
              mode="create"
              presetClientId={recordNum ?? undefined}
              onSaved={(contract) => navigate("contrato-detalle", contract.id)}
              onCancel={() => navigate("cliente-detalle", recordNum)}
            />
          )}

          {screen === "contrato-editar" && recordNum !== null && (
            <ContratoForm
              mode="edit"
              contractId={recordNum}
              onSaved={(contract) => navigate("contrato-detalle", contract.id)}
              onCancel={() => navigate("contrato-detalle", recordNum)}
            />
          )}

          {screen === "contrato-detalle" && recordNum !== null && (
            <ContratoDetalle
              contractId={recordNum}
              onBack={(clientId) =>
                navigate(clientId != null ? "cliente-detalle" : "clientes", clientId)
              }
              onEditContract={(id) => navigate("contrato-editar", id)}
              onDeleted={(clientId) => navigate("cliente-detalle", clientId)}
            />
          )}

          {(screen === "gastos" || screen === "gasto-nuevo" || screen === "gasto-editar") && (
            <Gastos
              view={recordId === "inbox" ? "inbox" : "list"}
              onSetView={(v) => navigate("gastos", v === "inbox" ? "inbox" : null)}
              onOpenExpense={(id) => navigate("gasto-detalle", id)}
              onNewExpense={() => {
                setPendingDropPath(null);
                navigate("gasto-nuevo");
              }}
              inboxRefreshToken={inboxRefreshToken}
              onInboxChanged={refreshInboxCount}
              onOpenSettings={() => navigate("ajustes")}
            />
          )}

          {screen === "gasto-detalle" && recordNum !== null && (
            <GastoDetalle
              expenseId={recordNum}
              onBack={() => navigate("gastos")}
              onEditExpense={(id) => navigate("gasto-editar", id)}
              onDeleted={() => navigate("gastos")}
            />
          )}

          {screen === "resumen-trimestral" && (
            <ResumenTrimestral
              invoices={invoices}
              dropPaths={declarationDropPaths}
              dropToken={declarationDropToken}
              initialQuarterKey={recordId ?? undefined}
            />
          )}
          {screen === "resumen-anual" && <ResumenAnual invoices={invoices} />}
          {screen === "asistente" && (
            <Asistente invoices={invoices} onOpenSettings={() => navigate("ajustes")} />
          )}
          {screen === "ajustes" && <Ajustes theme={theme} onToggleTheme={handleToggleTheme} />}
        </div>

        {/* Create/edit sheets (issue #87). The list screen behind stays mounted while
            these are open, so its scroll + search + period state survives the round trip.
            `dismissible={false}` keeps a stray backdrop click from discarding edits;
            Esc / the close button route through `guardNav` for the unsaved-changes prompt.
            The `screen === ...` guard in each `onOpenChange` ignores the close event that
            fires as a side effect of the navigation that already closed the sheet. */}
        <Sheet
          open={screen === "cliente-nuevo" || screen === "cliente-editar"}
          onOpenChange={(open) => {
            if (!open && (screen === "cliente-nuevo" || screen === "cliente-editar"))
              guardNav(closeClienteForm);
          }}
          title={screen === "cliente-editar" ? t("clients.editClient") : t("clients.newClient")}
          maxWidthClassName="max-w-xl"
          dismissible={false}
        >
          {(screen === "cliente-nuevo" || screen === "cliente-editar") && (
            <ClienteForm
              embedded
              mode={screen === "cliente-editar" ? "edit" : "create"}
              clientId={screen === "cliente-editar" ? (recordNum ?? undefined) : undefined}
              onSaved={(client) => navigate("cliente-detalle", client.id)}
              onCancel={() => guardNav(closeClienteForm)}
            />
          )}
        </Sheet>

        <Sheet
          open={screen === "factura-nueva"}
          onOpenChange={(open) => {
            if (!open && screen === "factura-nueva") guardNav(closeFacturaForm);
          }}
          title={recordNum !== null ? t("invoices.editInvoice") : t("invoices.newInvoice")}
          maxWidthClassName="max-w-4xl"
          dismissible={false}
        >
          {screen === "factura-nueva" && (
            <FacturaNueva
              embedded
              editInvoiceId={recordNum ?? undefined}
              onBack={() => guardNav(closeFacturaForm)}
              onSaved={(id) => {
                void listInvoices().then(setInvoices);
                openInvoice(id);
              }}
              onDirtyChange={setFormDirty}
            />
          )}
        </Sheet>

        <Sheet
          open={screen === "gasto-nuevo" || screen === "gasto-editar"}
          onOpenChange={(open) => {
            if (!open && (screen === "gasto-nuevo" || screen === "gasto-editar"))
              guardNav(closeGastoForm);
          }}
          title={screen === "gasto-editar" ? t("expenses.editExpense") : t("expenses.newExpense")}
          maxWidthClassName="max-w-xl"
          dismissible={false}
        >
          {(screen === "gasto-nuevo" || screen === "gasto-editar") && (
            <GastoForm
              key={
                screen === "gasto-nuevo" ? `gasto-nuevo-${dropToken}` : `gasto-editar-${recordNum}`
              }
              embedded
              mode={screen === "gasto-editar" ? "edit" : "create"}
              expenseId={screen === "gasto-editar" ? (recordNum ?? undefined) : undefined}
              initialFilePath={
                screen === "gasto-nuevo" ? (pendingDropPath ?? undefined) : undefined
              }
              onSaved={(expense) => navigate("gasto-detalle", expense.id)}
              onCancel={() => guardNav(closeGastoForm)}
              onDirtyChange={setFormDirty}
            />
          )}
        </Sheet>

        <Sheet
          open={screen === "presupuesto-nuevo" || screen === "presupuesto-editar"}
          onOpenChange={(open) => {
            if (!open && (screen === "presupuesto-nuevo" || screen === "presupuesto-editar"))
              guardNav(() => navigate("presupuestos"));
          }}
          title={screen === "presupuesto-editar" ? t("quotes.editQuote") : t("quotes.newQuote")}
          maxWidthClassName="max-w-4xl"
          dismissible={false}
        >
          {(screen === "presupuesto-nuevo" || screen === "presupuesto-editar") && (
            <PresupuestoForm
              embedded
              editQuoteId={screen === "presupuesto-editar" ? (recordNum ?? undefined) : undefined}
              onBack={() => guardNav(() => navigate("presupuestos"))}
              onSaved={() => {
                bumpListRefresh();
                navigate("presupuestos");
              }}
              onConverted={(invoiceId) => void handleQuoteConverted(invoiceId)}
            />
          )}
        </Sheet>

        <Toast message={dbErrorToast} onDismiss={() => setDbErrorToast(null)} />
        <Toast
          message={pdfErrorToast}
          onDismiss={() => setPdfErrorToast(null)}
          offset={dbErrorToast ? 1 : 0}
        />
        <Toast
          message={updateToast}
          tone="info"
          onDismiss={() => setUpdateToast(null)}
          offset={(dbErrorToast ? 1 : 0) + (pdfErrorToast ? 1 : 0)}
        />

        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          clients={paletteClients}
          invoices={invoices}
          contracts={paletteContracts}
          onSelect={handlePaletteSelect}
        />

        <DragDropOverlay
          visible={dragOver !== null}
          supported={dragOver?.supported ?? false}
          context={dragOver?.context ?? "expense"}
        />

        <Sheet
          open={pendingNav !== null}
          onOpenChange={(open) => {
            if (!open) setPendingNav(null);
          }}
          title={t("common.unsavedChangesTitle")}
        >
          <p className="text-[13px] text-ink-soft mb-4">{t("common.unsavedChangesBody")}</p>
          <div className="flex gap-2.5 justify-end">
            <Button variant="secondary" onClick={() => setPendingNav(null)}>
              {t("common.keepEditing")}
            </Button>
            <Button
              variant="ghost-danger"
              onClick={() => {
                const nav = pendingNav;
                formDirtyRef.current = false;
                setPendingNav(null);
                nav?.();
              }}
            >
              {t("common.discardChanges")}
            </Button>
          </div>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}
