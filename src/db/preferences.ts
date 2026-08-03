import { getDb } from "./client";

export interface PreferencesRecord {
  theme: "light" | "dark";
  language: "es" | "en";
  defaultIvaRate: number;
  defaultIrpfRate: number;
  onboardingCompleted: boolean;
}

interface PreferencesRow {
  theme: string;
  language: string;
  default_iva_rate: number;
  default_irpf_rate: number;
  onboarding_completed: number;
}

function mapRow(row: PreferencesRow): PreferencesRecord {
  return {
    theme: row.theme === "dark" ? "dark" : "light",
    language: row.language === "en" ? "en" : "es",
    defaultIvaRate: row.default_iva_rate,
    defaultIrpfRate: row.default_irpf_rate,
    onboardingCompleted: row.onboarding_completed === 1,
  };
}

export async function getPreferences(): Promise<PreferencesRecord> {
  const db = await getDb();
  const rows = await db.select<PreferencesRow[]>(
    "SELECT theme, language, default_iva_rate, default_irpf_rate, onboarding_completed FROM preferences WHERE id = 1",
  );
  return mapRow(rows[0]);
}

export async function updatePreferences(patch: Partial<PreferencesRecord>): Promise<void> {
  const current = await getPreferences();
  const next = { ...current, ...patch };
  const db = await getDb();
  await db.execute(
    `UPDATE preferences
     SET theme = $1, language = $2, default_iva_rate = $3, default_irpf_rate = $4, onboarding_completed = $5
     WHERE id = 1`,
    [
      next.theme,
      next.language,
      next.defaultIvaRate,
      next.defaultIrpfRate,
      next.onboardingCompleted ? 1 : 0,
    ],
  );
}
