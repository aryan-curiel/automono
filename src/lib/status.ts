import type { Tone } from "../components/ui/Badge";
import type { ContractStatus, InvoiceStatus } from "../types";

export function invoiceStatusMeta(status: InvoiceStatus): { label: string; tone: Tone } {
  if (status === "paid") return { label: "Pagada", tone: "success" };
  if (status === "draft") return { label: "Borrador", tone: "warning" };
  return { label: "Emitida", tone: "info" };
}

export function contractStatusMeta(status: ContractStatus): { label: string; tone: Tone } {
  if (status === "active") return { label: "Activo", tone: "success" };
  if (status === "expired") return { label: "Vencido", tone: "warning" };
  return { label: "Terminado", tone: "neutral" };
}
