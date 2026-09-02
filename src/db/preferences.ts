import { getDb } from "./client";

export interface PreferencesRecord {
  theme: "light" | "dark";
  language: "es" | "en";
  defaultIvaRate: number;
  defaultIrpfRate: number;
  onboardingCompleted: boolean;
  /** Date self-employment (RETA registration) began, ISO "YYYY-MM-DD". */
  retaStartDate: string;
  /** Whether the user files Modelo 111 — when false it's dropped from the quarterly checklist. */
  presentsModelo111: boolean;
  /** When true, the declaration + live projection use cash basis (criterio de caja): only paid
   * invoices, expenses by payment date. Off = accrual (devengo), the Spanish default. */
  criterioCaja: boolean;
  /** Folder the receipt inbox watches for new receipt files. Empty = not configured. */
  receiptInboxPath: string;
  /** When true (and a path is set), the app sweeps `receiptInboxPath` on launch and window focus. */
  receiptInboxEnabled: boolean;
}

interface PreferencesRow {
  theme: string;
  language: string;
  default_iva_rate: number;
  default_irpf_rate: number;
  onboarding_completed: number;
  reta_start_date: string;
  presents_modelo_111: number;
  criterio_caja: number;
  receipt_inbox_path: string;
  receipt_inbox_enabled: number;
}

function mapRow(row: PreferencesRow): PreferencesRecord {
  return {
    theme: row.theme === "dark" ? "dark" : "light",
    language: row.language === "en" ? "en" : "es",
    defaultIvaRate: row.default_iva_rate,
    defaultIrpfRate: row.default_irpf_rate,
    onboardingCompleted: row.onboarding_completed === 1,
    retaStartDate: row.reta_start_date,
    presentsModelo111: row.presents_modelo_111 === 1,
    criterioCaja: row.criterio_caja === 1,
    receiptInboxPath: row.receipt_inbox_path,
    receiptInboxEnabled: row.receipt_inbox_enabled === 1,
  };
}

export async function getPreferences(): Promise<PreferencesRecord> {
  const db = await getDb();
  const rows = await db.select<PreferencesRow[]>(
    "SELECT theme, language, default_iva_rate, default_irpf_rate, onboarding_completed, reta_start_date, presents_modelo_111, criterio_caja, receipt_inbox_path, receipt_inbox_enabled FROM preferences WHERE id = 1",
  );
  return mapRow(rows[0]);
}

export async function updatePreferences(patch: Partial<PreferencesRecord>): Promise<void> {
  const current = await getPreferences();
  const next = { ...current, ...patch };
  const db = await getDb();
  await db.execute(
    `UPDATE preferences
     SET theme = $1, language = $2, default_iva_rate = $3, default_irpf_rate = $4, onboarding_completed = $5, reta_start_date = $6, presents_modelo_111 = $7, criterio_caja = $8, receipt_inbox_path = $9, receipt_inbox_enabled = $10
     WHERE id = 1`,
    [
      next.theme,
      next.language,
      next.defaultIvaRate,
      next.defaultIrpfRate,
      next.onboardingCompleted ? 1 : 0,
      next.retaStartDate,
      next.presentsModelo111 ? 1 : 0,
      next.criterioCaja ? 1 : 0,
      next.receiptInboxPath,
      next.receiptInboxEnabled ? 1 : 0,
    ],
  );
}
