export type VatTreatment = "standard" | "reverse_charge_eu" | "export_outside_eu" | "exempt_other";

export type InvoiceLanguage = "es" | "en" | "ca";
export type InvoiceStatus = "draft" | "issued" | "paid";
export type ContractStatus = "active" | "expired" | "terminated";
export type BillingCadence = "none" | "monthly" | "quarterly" | "yearly";
export type RectificationType = "full" | "partial";

export type Screen =
  | "onboarding"
  | "dashboard"
  | "clientes"
  | "cliente-detalle"
  | "cliente-nuevo"
  | "cliente-editar"
  | "facturas"
  | "cobros"
  | "conciliacion"
  | "factura-detalle"
  | "factura-nueva"
  | "factura-rectificar"
  | "presupuestos"
  | "presupuesto-nuevo"
  | "presupuesto-editar"
  | "contrato-nuevo"
  | "contrato-editar"
  | "contrato-detalle"
  | "bandeja"
  | "gastos"
  | "gasto-nuevo"
  | "gasto-editar"
  | "gasto-detalle"
  | "resumen-trimestral"
  | "resumen-anual"
  | "asistente"
  | "ajustes";
