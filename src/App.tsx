import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Sidebar } from "./components/Sidebar";
import { CommandPalette } from "./components/CommandPalette";
import { DragDropOverlay } from "./components/DragDropOverlay";
import { BackLink } from "./components/PageHeader";
import { Toast } from "./components/ui/Toast";
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
import { FacturaDetalle } from "./screens/FacturaDetalle";
import { FacturaNueva } from "./screens/FacturaNueva";
import { FacturaRectificar } from "./screens/FacturaRectificar";
import { ContratoDetalle } from "./screens/ContratoDetalle";
import { ContratoForm } from "./screens/ContratoForm";
import { Gastos } from "./screens/Gastos";
import { GastoDetalle } from "./screens/GastoDetalle";
import { GastoForm } from "./screens/GastoForm";
import { ResumenTrimestral } from "./screens/ResumenTrimestral";
import { DeclaracionDetalle } from "./screens/DeclaracionDetalle";
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
import { isSupportedExpenseFile } from "./db/expenses";
import type { RectificationType, Screen } from "./types";

export default function App() {
  const { t, i18n } = useTranslation();
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [preferences, setPreferences] = useState<PreferencesRecord | null>(null);
  const [dbReady, setDbReady] = useState(false);
  const [dbErrorToast, setDbErrorToast] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [newContractClientId, setNewContractClientId] = useState<number | undefined>(undefined);
  const [selectedExpenseId, setSelectedExpenseId] = useState<number | null>(null);
  const [selectedDeclarationId, setSelectedDeclarationId] = useState<number | null>(null);
  const [pendingDropPath, setPendingDropPath] = useState<string | null>(null);
  const [dropToken, setDropToken] = useState(0);
  const [declarationDropPaths, setDeclarationDropPaths] = useState<string[] | null>(null);
  const [declarationDropToken, setDeclarationDropToken] = useState(0);
  const [dragOver, setDragOver] = useState<{
    supported: boolean;
    context: "expense" | "declaration";
  } | null>(null);
  const screenRef = useRef(screen);
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<{
    invoice: InvoiceRecord;
    lines: InvoiceLineRecord[];
  } | null>(null);
  const [invoiceDetailError, setInvoiceDetailError] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [editInvoiceId, setEditInvoiceId] = useState<number | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfileRecord | null>(null);
  const [pdfErrorToast, setPdfErrorToast] = useState<string | null>(null);

  const [rectifyingId, setRectifyingId] = useState<number | null>(null);
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

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const onDeclaration = screenRef.current === "declaracion-detalle";
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
        setPendingDropPath(path);
        setDropToken((n) => n + 1);
        setScreen("gasto-nuevo");
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // ponytail: re-fetches on every open (cheap local queries) instead of a shared store, so
  // results never go stale between a client/contract edit and the next search.
  useEffect(() => {
    if (!paletteOpen) return;
    listClients().then(setPaletteClients);
    listContracts().then(setPaletteContracts);
  }, [paletteOpen]);

  function handlePaletteSelect(result: SearchResult) {
    if (result.type === "client") {
      setSelectedClientId(result.id);
      setScreen("cliente-detalle");
    } else if (result.type === "invoice") {
      openInvoice(result.id);
    } else {
      setSelectedContractId(result.id);
      setScreen("contrato-detalle");
    }
  }

  useEffect(() => {
    getDb()
      .catch(() => setDbErrorToast(t("settings.dbError")))
      .finally(() => setDbReady(true));
  }, [t]);

  useEffect(() => {
    if (!dbReady) return;
    listInvoices()
      .then(setInvoices)
      .finally(() => setInvoicesLoading(false));
  }, [dbReady, screen]);

  useEffect(() => {
    if (!dbReady) return;
    getBusinessProfile().then(setBusinessProfile);
  }, [dbReady]);

  useEffect(() => {
    if (!dbReady) return;
    getPreferences().then((prefs) => {
      setPreferences(prefs);
      setTheme(prefs.theme);
      void i18n.changeLanguage(prefs.language);
    });
  }, [dbReady, i18n]);

  useEffect(() => {
    if (!dbReady) return;
    checkAutoBackup();
  }, [dbReady]);

  useEffect(() => {
    // No clearing needed here on null: the only call site that nulls selectedInvoiceId
    // (handleDeleteInvoice) already clears invoiceDetail itself.
    if (selectedInvoiceId === null) return;
    getInvoiceWithLines(selectedInvoiceId)
      .then((detail) => {
        setInvoiceDetail(detail);
        setInvoiceDetailError(false);
      })
      .catch(() => setInvoiceDetailError(true));
  }, [selectedInvoiceId]);

  // Screen transitions that should start a blank form clear their target/preset state directly
  // at the point of navigation (below and in the render props), rather than reactively via an
  // effect keyed on `screen` — every entry into "factura-nueva"/"gasto-nuevo" either sets its
  // preset explicitly (duplicate/edit an invoice, drop a receipt) or clears it explicitly (plain
  // "+ Nueva factura"/"+ Nuevo gasto"), so no stale value can leak through either path.
  function navigateFromDashboard(next: Screen) {
    if (next === "factura-nueva") setEditInvoiceId(null);
    if (next === "gasto-nuevo") setPendingDropPath(null);
    setScreen(next);
  }

  const rectifyingInvoice = invoices.find((i) => i.id === rectifyingId) ?? null;

  function openInvoice(id: number) {
    setSelectedInvoiceId(id);
    setScreen("factura-detalle");
  }

  async function confirmMarkPaid() {
    if (selectedInvoiceId === null) return;
    await markInvoicePaid(selectedInvoiceId);
    setMarkingPaid(false);
    const [list, detail] = await Promise.all([
      listInvoices(),
      getInvoiceWithLines(selectedInvoiceId),
    ]);
    setInvoices(list);
    setInvoiceDetail(detail);
  }

  async function handleDuplicateInvoice(id: number) {
    const duplicate = await duplicateInvoice(id);
    setInvoices(await listInvoices());
    setEditInvoiceId(duplicate.id);
    setScreen("factura-nueva");
  }

  async function handleDeleteInvoice(id: number) {
    await deleteInvoice(id);
    if (id === selectedInvoiceId) {
      setSelectedInvoiceId(null);
      setInvoiceDetail(null);
      setScreen("facturas");
    }
    setInvoices(await listInvoices());
  }

  async function handleDownloadPdf(force = false) {
    if (selectedInvoiceId === null) return;
    setGeneratingPdf(true);
    try {
      await openOrGeneratePdf(selectedInvoiceId, force);
      const detail = await getInvoiceWithLines(selectedInvoiceId);
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
          getBusinessProfile().then(setBusinessProfile);
        }}
      />
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-bg text-ink transition-colors overflow-hidden">
        <Sidebar screen={screen} onNavigate={setScreen} />

        <div className="flex-1 overflow-y-auto min-w-0">
          {screen === "dashboard" && (
            <Dashboard
              invoices={invoices}
              onNavigate={navigateFromDashboard}
              onOpenInvoice={openInvoice}
              onDuplicateInvoice={handleDuplicateInvoice}
            />
          )}

          {screen === "clientes" && (
            <Clientes
              onOpenClient={(id) => {
                setSelectedClientId(id);
                setScreen("cliente-detalle");
              }}
              onNewClient={() => setScreen("cliente-nuevo")}
            />
          )}

          {screen === "cliente-detalle" && selectedClientId !== null && (
            <ClienteDetalle
              clientId={selectedClientId}
              invoices={invoices}
              onBack={() => setScreen("clientes")}
              onEditClient={(id) => {
                setSelectedClientId(id);
                setScreen("cliente-editar");
              }}
              onDeleted={() => setScreen("clientes")}
              onOpenContract={(id) => {
                setSelectedContractId(id);
                setScreen("contrato-detalle");
              }}
              onNewContract={(clientId) => {
                setNewContractClientId(clientId);
                setScreen("contrato-nuevo");
              }}
            />
          )}

          {screen === "cliente-nuevo" && (
            <ClienteForm
              mode="create"
              onSaved={(client) => {
                setSelectedClientId(client.id);
                setScreen("cliente-detalle");
              }}
              onCancel={() => setScreen("clientes")}
            />
          )}

          {screen === "cliente-editar" && selectedClientId !== null && (
            <ClienteForm
              mode="edit"
              clientId={selectedClientId}
              onSaved={(client) => {
                setSelectedClientId(client.id);
                setScreen("cliente-detalle");
              }}
              onCancel={() => setScreen("cliente-detalle")}
            />
          )}

          {screen === "facturas" && (
            <Facturas
              invoices={invoices}
              loading={invoicesLoading}
              onOpenInvoice={openInvoice}
              onNewInvoice={() => {
                setEditInvoiceId(null);
                setScreen("factura-nueva");
              }}
              onDeleteInvoice={handleDeleteInvoice}
              onDuplicateInvoice={handleDuplicateInvoice}
            />
          )}

          {screen === "factura-detalle" && invoiceDetailError && (
            <div className="px-8">
              <BackLink label={t("invoices.title")} onClick={() => setScreen("facturas")} />
              <div className="text-sm text-danger">{t("invoices.errors.loadFailed")}</div>
            </div>
          )}

          {screen === "factura-detalle" && !invoiceDetail && !invoiceDetailError && (
            <div className="px-8">
              <BackLink label={t("invoices.title")} onClick={() => setScreen("facturas")} />
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
              onBack={() => setScreen("facturas")}
              onOpenMarkPaid={() => setMarkingPaid(true)}
              onCancelMarkPaid={() => setMarkingPaid(false)}
              onConfirmMarkPaid={confirmMarkPaid}
              onStartRectification={() => {
                setRectifyingId(invoiceDetail.invoice.id);
                setRectType("partial");
                setRectReason("");
                setScreen("factura-rectificar");
              }}
              onDownloadPdf={handleDownloadPdf}
              onDelete={() => handleDeleteInvoice(invoiceDetail.invoice.id)}
              onDuplicate={() => handleDuplicateInvoice(invoiceDetail.invoice.id)}
              onEdit={() => {
                setEditInvoiceId(invoiceDetail.invoice.id);
                setScreen("factura-nueva");
              }}
            />
          )}

          {screen === "factura-nueva" && (
            <FacturaNueva
              editInvoiceId={editInvoiceId ?? undefined}
              onBack={() => setScreen("facturas")}
              onSaved={openInvoice}
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
              onCancel={() => setScreen("factura-detalle")}
              onEmit={async (created) => {
                const list = await listInvoices();
                setInvoices(list);
                setSelectedInvoiceId(created.id);
                setScreen("factura-detalle");
              }}
            />
          )}

          {screen === "contrato-nuevo" && (
            <ContratoForm
              mode="create"
              presetClientId={newContractClientId}
              onSaved={(contract) => {
                setSelectedContractId(contract.id);
                setScreen("contrato-detalle");
              }}
              onCancel={() => setScreen("cliente-detalle")}
            />
          )}

          {screen === "contrato-editar" && selectedContractId !== null && (
            <ContratoForm
              mode="edit"
              contractId={selectedContractId}
              onSaved={(contract) => {
                setSelectedContractId(contract.id);
                setScreen("contrato-detalle");
              }}
              onCancel={() => setScreen("contrato-detalle")}
            />
          )}

          {screen === "contrato-detalle" && selectedContractId !== null && (
            <ContratoDetalle
              contractId={selectedContractId}
              onBack={() => setScreen("cliente-detalle")}
              onEditContract={(id) => {
                setSelectedContractId(id);
                setScreen("contrato-editar");
              }}
              onDeleted={() => setScreen("cliente-detalle")}
            />
          )}

          {screen === "gastos" && (
            <Gastos
              onOpenExpense={(id) => {
                setSelectedExpenseId(id);
                setScreen("gasto-detalle");
              }}
              onNewExpense={() => {
                setPendingDropPath(null);
                setScreen("gasto-nuevo");
              }}
            />
          )}

          {screen === "gasto-nuevo" && (
            <GastoForm
              key={`gasto-nuevo-${dropToken}`}
              mode="create"
              initialFilePath={pendingDropPath ?? undefined}
              onSaved={(expense) => {
                setSelectedExpenseId(expense.id);
                setScreen("gasto-detalle");
              }}
              onCancel={() => setScreen("gastos")}
            />
          )}

          {screen === "gasto-editar" && selectedExpenseId !== null && (
            <GastoForm
              mode="edit"
              expenseId={selectedExpenseId}
              onSaved={(expense) => {
                setSelectedExpenseId(expense.id);
                setScreen("gasto-detalle");
              }}
              onCancel={() => setScreen("gasto-detalle")}
            />
          )}

          {screen === "gasto-detalle" && selectedExpenseId !== null && (
            <GastoDetalle
              expenseId={selectedExpenseId}
              onBack={() => setScreen("gastos")}
              onEditExpense={(id) => {
                setSelectedExpenseId(id);
                setScreen("gasto-editar");
              }}
              onDeleted={() => setScreen("gastos")}
            />
          )}

          {screen === "resumen-trimestral" && (
            <ResumenTrimestral
              invoices={invoices}
              onOpenDeclaration={(id) => {
                setSelectedDeclarationId(id);
                setScreen("declaracion-detalle");
              }}
            />
          )}

          {screen === "declaracion-detalle" && selectedDeclarationId !== null && (
            <DeclaracionDetalle
              declarationId={selectedDeclarationId}
              onBack={() => setScreen("resumen-trimestral")}
              onDeleted={() => setScreen("resumen-trimestral")}
              dropPaths={declarationDropPaths}
              dropToken={declarationDropToken}
            />
          )}
          {screen === "ajustes" && <Ajustes theme={theme} onToggleTheme={handleToggleTheme} />}
        </div>

        <Toast message={dbErrorToast} onDismiss={() => setDbErrorToast(null)} />
        <Toast
          message={pdfErrorToast}
          onDismiss={() => setPdfErrorToast(null)}
          offset={dbErrorToast ? 1 : 0}
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
      </div>
    </TooltipProvider>
  );
}
