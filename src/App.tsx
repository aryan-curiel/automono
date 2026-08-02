import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sidebar } from "./components/Sidebar";
import { Toast } from "./components/ui/Toast";
import { TooltipProvider } from "./components/ui/Tooltip";
import { getDb } from "./db/client";
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
import { Ajustes } from "./screens/Ajustes";
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
import { checkAutoBackup } from "./db/backup";
import type { RectificationType, Screen } from "./types";

export default function App() {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [dbReady, setDbReady] = useState(false);
  const [dbErrorToast, setDbErrorToast] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [newContractClientId, setNewContractClientId] = useState<number | undefined>(undefined);
  const [selectedExpenseId, setSelectedExpenseId] = useState<number | null>(null);
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

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

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
    checkAutoBackup();
  }, [dbReady]);

  useEffect(() => {
    if (selectedInvoiceId === null) {
      setInvoiceDetail(null);
      return;
    }
    setInvoiceDetailError(false);
    getInvoiceWithLines(selectedInvoiceId)
      .then(setInvoiceDetail)
      .catch(() => setInvoiceDetailError(true));
  }, [selectedInvoiceId]);

  // Clears the duplicate-target once the user leaves the new-invoice screen, so a later plain
  // "+ Nueva factura" click (which doesn't go through handleDuplicateInvoice) starts blank.
  useEffect(() => {
    if (screen !== "factura-nueva") setEditInvoiceId(null);
  }, [screen]);

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

  if (!dbReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg text-ink-soft text-sm">
        {t("app.initializing")}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-bg text-ink transition-colors overflow-hidden">
        <Sidebar screen={screen} onNavigate={setScreen} />

        <div className="flex-1 overflow-y-auto min-w-0">
          {screen === "dashboard" && (
            <Dashboard invoices={invoices} onNavigate={setScreen} onOpenInvoice={openInvoice} />
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
              onNewInvoice={() => setScreen("factura-nueva")}
              onDeleteInvoice={handleDeleteInvoice}
              onDuplicateInvoice={handleDuplicateInvoice}
            />
          )}

          {screen === "factura-detalle" && invoiceDetailError && (
            <div className="px-8">
              <div className="text-sm text-danger">{t("invoices.errors.loadFailed")}</div>
            </div>
          )}

          {screen === "factura-detalle" && !invoiceDetail && !invoiceDetailError && (
            <div className="px-8">
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
            />
          )}

          {screen === "factura-nueva" && (
            <FacturaNueva editInvoiceId={editInvoiceId ?? undefined} onBack={() => setScreen("facturas")} />
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
              onNewExpense={() => setScreen("gasto-nuevo")}
            />
          )}

          {screen === "gasto-nuevo" && (
            <GastoForm
              mode="create"
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

          {screen === "resumen-trimestral" && <ResumenTrimestral invoices={invoices} />}
          {screen === "ajustes" && (
            <Ajustes
              theme={theme}
              onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            />
          )}
        </div>

        {dbErrorToast && <Toast message={dbErrorToast} onDismiss={() => setDbErrorToast(null)} />}
        {pdfErrorToast && (
          <Toast message={pdfErrorToast} onDismiss={() => setPdfErrorToast(null)} />
        )}
      </div>
    </TooltipProvider>
  );
}
