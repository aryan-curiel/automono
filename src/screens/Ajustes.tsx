import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import * as Switch from "@radix-ui/react-switch";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { Sheet } from "../components/ui/Sheet";
import { Toast } from "../components/ui/Toast";
import { ErrorText, TextInput } from "../components/ui/Field";
import { FormRow } from "../components/ui/FormRow";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import {
  attachBusinessLogo,
  getBusinessProfile,
  pickBusinessLogo,
  updateBusinessProfile,
} from "../db/businessProfile";
import type { BusinessProfileRecord } from "../db/businessProfile";
import { isValidNifCif, isValidVatNumber } from "../features/clients";
import { isValidIban } from "../features/settings";
import { runHealthcheck } from "../db/healthcheck";
import {
  CategoryInUseError,
  createExpenseCategory,
  deleteExpenseCategory,
  listExpenseCategories,
  renameExpenseCategory,
} from "../db/expenseCategories";
import type { ExpenseCategoryRecord } from "../db/expenseCategories";
import {
  getBackupSettings,
  updateBackupSettings,
  pickBackupFolder,
  backupNow,
  listBackups,
  restoreFromBackup,
  openBackupFolder,
} from "../db/backup";
import type { BackupSettingsRecord, BackupEntry } from "../db/backup";
import { getLlmSettings, updateLlmSettings } from "../db/llmSettings";
import { getPreferences, updatePreferences } from "../db/preferences";
import type { LlmProvider, LlmSettingsRecord } from "../db/llmSettings";
import { BusinessDocumentsPanel } from "../components/BusinessDocumentsPanel";
import { mergeRegistrationFields } from "../db/businessDocuments";
import type { RegistrationFields } from "../db/businessDocuments";

const EMPTY_LLM_SETTINGS: LlmSettingsRecord = {
  provider: "anthropic",
  anthropicApiKey: null,
  openaiApiKey: null,
  openrouterApiKey: null,
  anthropicModel: null,
  openaiModel: null,
  openrouterModel: null,
};

const LLM_PROVIDER_OPTIONS: { value: LlmProvider; label: string }[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "openrouter", label: "OpenRouter" },
];

const EMPTY_FORM: BusinessProfileRecord = {
  name: "",
  nifCif: "",
  vatNumber: "",
  address: "",
  bankName: "",
  iban: "",
  bic: "",
  logoPath: null,
};

type FieldErrors = Partial<Record<"name" | "nifCif" | "vatNumber" | "iban", string>>;
type Tab = "general" | "datos" | "documentos" | "categorias" | "backup";

interface AjustesProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export function Ajustes({ theme, onToggleTheme }: AjustesProps) {
  const { t } = useTranslation();
  const TABS: { value: Tab; label: string }[] = [
    { value: "general", label: t("settings.tabs.general") },
    { value: "datos", label: t("settings.tabs.datos") },
    { value: "documentos", label: t("settings.tabs.documentos") },
    { value: "categorias", label: t("settings.tabs.categorias") },
    { value: "backup", label: t("settings.tabs.backup") },
  ];
  const [tab, setTab] = useState<Tab>("general");
  const [form, setForm] = useState<BusinessProfileRecord>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dbStatus, setDbStatus] = useState(t("settings.dbChecking"));
  const [vatNumberEdited, setVatNumberEdited] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [retaStartDate, setRetaStartDate] = useState("");
  const [presentsModelo111, setPresentsModelo111] = useState(false);
  const [criterioCaja, setCriterioCaja] = useState(false);
  const [documentsToast, setDocumentsToast] = useState<string | null>(null);

  const [backupSettings, setBackupSettings] = useState<BackupSettingsRecord | null>(null);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreCandidates, setRestoreCandidates] = useState<BackupEntry[] | null>(null);
  const [restorePendingEntry, setRestorePendingEntry] = useState<BackupEntry | null>(null);

  const [llmSettings, setLlmSettings] = useState<LlmSettingsRecord>(EMPTY_LLM_SETTINGS);
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmSaved, setLlmSaved] = useState(false);

  const [categories, setCategories] = useState<ExpenseCategoryRecord[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoryPendingDelete, setCategoryPendingDelete] = useState<ExpenseCategoryRecord | null>(
    null,
  );

  useEffect(() => {
    void getBackupSettings().then(setBackupSettings);
  }, []);

  useEffect(() => {
    void listExpenseCategories().then(setCategories);
  }, []);

  useEffect(() => {
    void getLlmSettings().then(setLlmSettings);
  }, []);

  function setLlmField<K extends keyof LlmSettingsRecord>(key: K, value: LlmSettingsRecord[K]) {
    setLlmSettings((s) => ({ ...s, [key]: value }));
    setLlmSaved(false);
  }

  async function handleSaveLlmSettings() {
    setLlmSaving(true);
    setLlmSaved(false);
    try {
      await updateLlmSettings(llmSettings);
      setLlmSaved(true);
    } finally {
      setLlmSaving(false);
    }
  }

  async function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    setCategoryError(null);
    try {
      await createExpenseCategory(name);
      setCategories(await listExpenseCategories());
      setNewCategoryName("");
    } catch {
      setCategoryError(t("settings.categoryNameTaken"));
    }
  }

  async function handleRenameCategory(id: number) {
    const name = editingCategoryName.trim();
    if (!name) return;
    setCategoryError(null);
    try {
      await renameExpenseCategory(id, name);
      setCategories(await listExpenseCategories());
      setEditingCategoryId(null);
    } catch {
      setCategoryError(t("settings.categoryNameTaken"));
    }
  }

  function handleDeleteCategory(category: ExpenseCategoryRecord) {
    setCategoryPendingDelete(category);
  }

  async function confirmDeleteCategory() {
    const category = categoryPendingDelete;
    if (!category) return;
    setCategoryError(null);
    try {
      await deleteExpenseCategory(category.id);
      setCategories(await listExpenseCategories());
    } catch (e) {
      setCategoryError(
        e instanceof CategoryInUseError
          ? t("settings.categoryInUse", { count: e.count })
          : t("settings.categoryDeleteFailed"),
      );
    } finally {
      setCategoryPendingDelete(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    getBusinessProfile()
      .then((profile) => {
        if (!cancelled) {
          setForm(profile);
          setVatNumberEdited(!!profile.vatNumber.trim());
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    void getPreferences().then((prefs) => {
      if (!cancelled) {
        setRetaStartDate(prefs.retaStartDate);
        setPresentsModelo111(prefs.presentsModelo111);
        setCriterioCaja(prefs.criterioCaja);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    runHealthcheck()
      .then((result) => setDbStatus(result.message))
      .catch((error: unknown) => setDbStatus(`${t("settings.dbError")}: ${String(error)}`));
  }, [t]);

  function set<K extends keyof BusinessProfileRecord>(key: K, value: BusinessProfileRecord[K]) {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleNifChange(value: string) {
    setSaved(false);
    setForm((f) => ({
      ...f,
      nifCif: value,
      vatNumber: vatNumberEdited ? f.vatNumber : `ES${value.toUpperCase()}`,
    }));
  }

  function handleVatNumberChange(value: string) {
    setVatNumberEdited(true);
    set("vatNumber", value);
  }

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!form.name.trim()) next.name = t("settings.errors.nameRequired");
    if (!isValidNifCif(form.nifCif)) next.nifCif = t("settings.errors.nifCifInvalid");
    if (!isValidVatNumber(form.vatNumber)) next.vatNumber = t("settings.errors.vatNumberInvalid");
    if (form.iban.trim() && !isValidIban(form.iban)) next.iban = t("settings.errors.ibanInvalid");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    setSaveError(null);
    setSaved(false);
    if (!validate()) return;

    const payload: BusinessProfileRecord = {
      name: form.name.trim(),
      nifCif: form.nifCif.trim().toUpperCase(),
      vatNumber: form.vatNumber.trim().toUpperCase(),
      address: form.address.trim(),
      bankName: form.bankName.trim(),
      iban: form.iban.trim().toUpperCase(),
      bic: form.bic.trim().toUpperCase(),
      logoPath: form.logoPath,
    };

    setSaving(true);
    try {
      await updateBusinessProfile(payload);
      await updatePreferences({ retaStartDate, presentsModelo111, criterioCaja });
      setForm(payload);
      setSaved(true);
    } catch {
      setSaveError(t("settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  /** Fills only the still-blank fields of the Datos tab's local state from an extracted
   * document — a real business profile is already assigned by this point (onboarding is done),
   * so a re-upload or a mis-extraction must never silently replace it. Nothing is written to
   * SQLite until the user hits "Guardar", same as any other manual edit. RETA start date is
   * deliberately left untouched here: unlike the text fields above it never looks "blank"
   * (it always holds a real date), so there's no safe way to tell "still the factory
   * default" from "the value the user actually wants" — the document's summary text (shown
   * under its filename) is there for the user to read and copy in by hand instead. */
  function applyExtracted(fields: RegistrationFields) {
    const merged = mergeRegistrationFields(form, fields);
    const changed = (Object.keys(merged) as (keyof BusinessProfileRecord)[]).some(
      (key) => merged[key] !== form[key],
    );
    if (!changed) return;
    setSaved(false);
    setForm(merged);
    setDocumentsToast(t("settings.documentsAppliedToast"));
  }

  async function handlePickLogo() {
    const source = await pickBusinessLogo();
    if (!source) return;
    setLogoUploading(true);
    try {
      const stored = await attachBusinessLogo(source);
      await updateBusinessProfile({ ...form, logoPath: stored });
      set("logoPath", stored);
    } catch {
      setSaveError(t("settings.logoUploadFailed"));
    } finally {
      setLogoUploading(false);
    }
  }

  async function persistBackupSettings(next: BackupSettingsRecord) {
    setBackupSettings(next);
    await updateBackupSettings(next);
  }

  async function handlePickFolder() {
    const path = await pickBackupFolder();
    if (!path || !backupSettings) return;
    await persistBackupSettings({ ...backupSettings, folderPath: path });
  }

  async function handleBackupNow() {
    setBackupError(null);
    setBackupMessage(null);
    if (!backupSettings?.folderPath) {
      setBackupError(t("settings.backupChooseFolderFirst"));
      return;
    }
    setBackupRunning(true);
    try {
      await backupNow();
      setBackupMessage(t("settings.backupComplete"));
      setBackupSettings(await getBackupSettings());
    } catch (e) {
      setBackupError(t("settings.backupFailed", { error: String(e) }));
    } finally {
      setBackupRunning(false);
    }
  }

  async function handleRestore() {
    setBackupError(null);
    setBackupMessage(null);
    const folder = await pickBackupFolder();
    if (!folder) return;
    try {
      const entries = await listBackups(folder);
      if (entries.length === 0) {
        setBackupError(t("settings.backupNoneFound"));
        return;
      }
      setRestoreCandidates(entries);
    } catch (e) {
      setBackupError(t("settings.backupReadFolderFailed", { error: String(e) }));
    }
  }

  function handleRestoreSelect(entry: BackupEntry) {
    setRestorePendingEntry(entry);
  }

  async function confirmRestore() {
    const entry = restorePendingEntry;
    if (!entry) return;
    setRestoring(true);
    setBackupError(null);
    try {
      await restoreFromBackup(entry.path);
      // On success the Rust side calls app.restart() and this promise never resolves — the app
      // relaunches into the restored data. Only the catch below runs (bad folder rejected before
      // any file is touched).
    } catch (e) {
      setBackupError(t("settings.backupRestoreFailed", { error: String(e) }));
      setRestoring(false);
    } finally {
      setRestorePendingEntry(null);
    }
  }

  return (
    <div className="px-8 pb-15">
      <PageHeader title={t("nav.settings")} />

      <div className="mb-5">
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === "general" && (
        <Card className="px-5 max-w-[640px] mb-5">
          <div className="pt-4 pb-3">
            <div className="font-bold text-sm mb-1.5">{t("settings.appearanceTitle")}</div>
          </div>
          <FormRow label={t("settings.darkMode")}>
            <div className="flex items-center gap-2.5">
              <Switch.Root
                checked={theme === "dark"}
                onCheckedChange={onToggleTheme}
                className="w-9 h-5 rounded-pill relative bg-surface-alt border border-border data-[state=checked]:bg-accent data-[state=checked]:border-accent transition-colors ease-[var(--ease-out)] outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <Switch.Thumb className="block w-4 h-4 rounded-pill bg-white translate-x-0.5 transition-transform ease-[var(--ease-out)] data-[state=checked]:translate-x-[18px]" />
              </Switch.Root>
              <span className="text-[13px] text-ink-soft">
                {theme === "dark" ? t("settings.on") : t("settings.off")}
              </span>
            </div>
          </FormRow>

          <div className="pt-4 pb-3 border-t border-border mt-1">
            <div className="font-bold text-sm mb-1.5">{t("settings.llmTitle")}</div>
            <div className="text-[13px] text-ink-soft">{t("settings.llmHelp")}</div>
          </div>

          <FormRow label={t("settings.llmProvider")}>
            <SegmentedControl
              options={LLM_PROVIDER_OPTIONS}
              value={llmSettings.provider}
              onChange={(provider) => setLlmField("provider", provider)}
            />
          </FormRow>

          {llmSettings.provider === "anthropic" && (
            <>
              <FormRow label={t("settings.llmApiKey")}>
                <TextInput
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={llmSettings.anthropicApiKey ?? ""}
                  onChange={(e) => setLlmField("anthropicApiKey", e.target.value || null)}
                  placeholder="sk-ant-..."
                />
              </FormRow>
              <FormRow label={t("settings.llmModel")}>
                <TextInput
                  value={llmSettings.anthropicModel ?? ""}
                  onChange={(e) => setLlmField("anthropicModel", e.target.value || null)}
                  placeholder="claude-haiku-4-5"
                />
              </FormRow>
            </>
          )}

          {llmSettings.provider === "openai" && (
            <>
              <FormRow label={t("settings.llmApiKey")}>
                <TextInput
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={llmSettings.openaiApiKey ?? ""}
                  onChange={(e) => setLlmField("openaiApiKey", e.target.value || null)}
                  placeholder="sk-..."
                />
              </FormRow>
              <FormRow label={t("settings.llmModel")}>
                <TextInput
                  value={llmSettings.openaiModel ?? ""}
                  onChange={(e) => setLlmField("openaiModel", e.target.value || null)}
                  placeholder="gpt-5.2"
                />
              </FormRow>
            </>
          )}

          {llmSettings.provider === "openrouter" && (
            <>
              <FormRow label={t("settings.llmApiKey")}>
                <TextInput
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={llmSettings.openrouterApiKey ?? ""}
                  onChange={(e) => setLlmField("openrouterApiKey", e.target.value || null)}
                  placeholder="sk-or-..."
                />
              </FormRow>
              <FormRow label={t("settings.llmModel")}>
                <TextInput
                  value={llmSettings.openrouterModel ?? ""}
                  onChange={(e) => setLlmField("openrouterModel", e.target.value || null)}
                  placeholder="anthropic/claude-sonnet-4.5"
                />
              </FormRow>
            </>
          )}

          <div className="flex items-center gap-2.5 py-3 border-t border-border">
            <Button onClick={() => void handleSaveLlmSettings()} disabled={llmSaving}>
              {t("settings.llmSave")}
            </Button>
            {llmSaved && <div className="text-[13px] text-accent">{t("settings.llmSaved")}</div>}
          </div>

          <div className="pt-4 pb-1 border-t border-border mt-1">
            <div className="font-bold text-sm mb-1.5">{t("settings.dbSectionTitle")}</div>
            <div className="text-[13px] text-ink-soft pb-4">{dbStatus}</div>
          </div>
        </Card>
      )}

      {tab === "datos" &&
        (loading ? (
          <div className="text-sm text-ink-soft mb-5">{t("settings.loading")}</div>
        ) : loadError ? (
          <div className="text-sm text-danger mb-5">{t("settings.loadError")}</div>
        ) : (
          <>
            <Card className="px-5 max-w-[640px] mb-5">
              <div className="pt-4 pb-3">
                <div className="font-bold text-sm mb-1.5">{t("settings.businessDataTitle")}</div>
              </div>
              <FormRow label={t("settings.fields.name")} error={errors.name}>
                <TextInput
                  value={form.name}
                  error={!!errors.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </FormRow>
              <FormRow label={t("settings.fields.nifCif")} error={errors.nifCif}>
                <TextInput
                  mono
                  value={form.nifCif}
                  error={!!errors.nifCif}
                  onChange={(e) => handleNifChange(e.target.value)}
                />
              </FormRow>
              <FormRow label={t("settings.fields.vatNumber")} error={errors.vatNumber}>
                <TextInput
                  mono
                  value={form.vatNumber}
                  error={!!errors.vatNumber}
                  onChange={(e) => handleVatNumberChange(e.target.value)}
                />
              </FormRow>
              <FormRow label={t("settings.fields.address")}>
                <TextInput value={form.address} onChange={(e) => set("address", e.target.value)} />
              </FormRow>
              <FormRow label={t("settings.fields.retaStartDate")}>
                <TextInput
                  type="date"
                  value={retaStartDate}
                  onChange={(e) => setRetaStartDate(e.target.value)}
                />
              </FormRow>
              <FormRow label={t("settings.fields.presentsModelo111")}>
                <div className="flex items-center gap-2.5">
                  <Switch.Root
                    checked={presentsModelo111}
                    onCheckedChange={(checked) => {
                      setSaved(false);
                      setPresentsModelo111(checked);
                    }}
                    className="w-9 h-5 rounded-pill relative bg-surface-alt border border-border data-[state=checked]:bg-accent data-[state=checked]:border-accent transition-colors ease-[var(--ease-out)] outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <Switch.Thumb className="block w-4 h-4 rounded-pill bg-white translate-x-0.5 transition-transform ease-[var(--ease-out)] data-[state=checked]:translate-x-[18px]" />
                  </Switch.Root>
                  <span className="text-[13px] text-ink-soft">
                    {presentsModelo111 ? t("settings.on") : t("settings.off")}
                  </span>
                </div>
              </FormRow>
              <FormRow label={t("settings.fields.criterioCaja")}>
                <div className="flex items-center gap-2.5">
                  <Switch.Root
                    checked={criterioCaja}
                    onCheckedChange={(checked) => {
                      setSaved(false);
                      setCriterioCaja(checked);
                    }}
                    className="w-9 h-5 rounded-pill relative bg-surface-alt border border-border data-[state=checked]:bg-accent data-[state=checked]:border-accent transition-colors ease-[var(--ease-out)] outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <Switch.Thumb className="block w-4 h-4 rounded-pill bg-white translate-x-0.5 transition-transform ease-[var(--ease-out)] data-[state=checked]:translate-x-[18px]" />
                  </Switch.Root>
                  <span className="text-[13px] text-ink-soft">
                    {criterioCaja ? t("settings.on") : t("settings.off")}
                  </span>
                </div>
                <p className="text-xs text-ink-soft mt-1.5">
                  {t("settings.fields.criterioCajaHint")}
                </p>
              </FormRow>
              <FormRow label={t("settings.fields.logo")}>
                <div className="flex items-center gap-2.5">
                  {form.logoPath && (
                    <img
                      src={convertFileSrc(form.logoPath)}
                      alt={t("settings.logoAlt")}
                      className="w-8 h-8 rounded-control object-contain bg-surface-alt shrink-0"
                    />
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => void handlePickLogo()}
                    disabled={logoUploading}
                  >
                    {logoUploading
                      ? t("settings.logoUploading")
                      : form.logoPath
                        ? t("settings.logoChange")
                        : t("settings.logoUpload")}
                  </Button>
                  <span className="text-[13px] text-ink-soft">{t("settings.logoHelp")}</span>
                </div>
              </FormRow>
            </Card>

            <Card className="px-5 max-w-[640px] mb-5">
              <div className="pt-4 pb-3">
                <div className="font-bold text-sm mb-1.5">{t("settings.bankDataTitle")}</div>
              </div>
              <FormRow label={t("settings.fields.bankName")}>
                <TextInput
                  value={form.bankName}
                  onChange={(e) => set("bankName", e.target.value)}
                />
              </FormRow>
              <FormRow label={t("settings.fields.iban")} error={errors.iban}>
                <TextInput
                  mono
                  value={form.iban}
                  error={!!errors.iban}
                  onChange={(e) => set("iban", e.target.value)}
                />
              </FormRow>
              <FormRow label={t("settings.fields.bic")}>
                <TextInput mono value={form.bic} onChange={(e) => set("bic", e.target.value)} />
              </FormRow>
            </Card>

            {saveError && <ErrorText>{saveError}</ErrorText>}
            <div className="flex items-center gap-3 max-w-[640px]">
              <Button onClick={() => void handleSave()} disabled={saving}>
                {t("settings.save")}
              </Button>
              {saved && <span className="text-[13px] text-ink-soft">{t("settings.saved")}</span>}
            </div>
          </>
        ))}

      {tab === "documentos" && (
        <Card className="px-5 max-w-[640px]">
          <div className="pt-4 pb-3">
            <div className="font-bold text-sm mb-1.5">{t("settings.documentsTabTitle")}</div>
            <div className="text-[13px] text-ink-soft">{t("settings.documentsTabDescription")}</div>
          </div>
          <BusinessDocumentsPanel onExtracted={applyExtracted} />
        </Card>
      )}

      {tab === "categorias" && (
        <Card className="px-5 max-w-[640px]">
          <div className="pt-4 pb-3">
            <div className="font-bold text-sm mb-1.5">{t("settings.categoriesTitle")}</div>
            <div className="text-[13px] text-ink-soft">{t("settings.categoriesSubtitle")}</div>
          </div>

          <div className="flex flex-col gap-0.5 mb-3">
            {categories.map((category) => (
              <div key={category.id} className="flex items-center gap-2.5 py-1.5">
                {editingCategoryId === category.id ? (
                  <>
                    <TextInput
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      className="flex-1"
                    />
                    <Button onClick={() => void handleRenameCategory(category.id)}>
                      {t("settings.save")}
                    </Button>
                    <Button variant="secondary" onClick={() => setEditingCategoryId(null)}>
                      {t("settings.cancel")}
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-[13px]">{category.name}</span>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingCategoryId(category.id);
                        setEditingCategoryName(category.name);
                        setCategoryError(null);
                      }}
                    >
                      {t("settings.categoryRename")}
                    </Button>
                    <Button variant="secondary" onClick={() => handleDeleteCategory(category)}>
                      {t("settings.categoryDelete")}
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>

          {categoryError && <ErrorText>{categoryError}</ErrorText>}

          <div className="flex items-center gap-2.5 pt-3 pb-4 border-t border-border mt-1">
            <TextInput
              placeholder={t("settings.categoryNamePlaceholder")}
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="flex-1"
            />
            <Button onClick={() => void handleAddCategory()}>{t("settings.categoryAdd")}</Button>
          </div>
        </Card>
      )}

      {tab === "backup" && (
        <Card className="px-5 max-w-[640px]">
          <div className="pt-4 pb-3">
            <div className="font-bold text-sm mb-1.5">{t("settings.backupTitle")}</div>
            <div className="text-[13px] text-ink-soft">{t("settings.backupDescription")}</div>
          </div>

          <FormRow label={t("settings.backupFolder")}>
            <div className="flex gap-2.5 items-center">
              <TextInput value={backupSettings?.folderPath ?? ""} readOnly className="flex-1" />
              <Button variant="secondary" onClick={() => void handlePickFolder()}>
                {t("settings.backupChooseFolder")}
              </Button>
              {backupSettings?.folderPath && (
                <Button
                  variant="secondary"
                  onClick={() => void openBackupFolder(backupSettings.folderPath)}
                >
                  {t("settings.backupOpenFolder")}
                </Button>
              )}
            </div>
          </FormRow>

          <FormRow label={t("settings.backupRetention")}>
            <TextInput
              type="number"
              min={0}
              value={backupSettings?.retentionDays ?? 30}
              onChange={(e) =>
                backupSettings &&
                void persistBackupSettings({
                  ...backupSettings,
                  retentionDays: Number(e.target.value),
                })
              }
            />
          </FormRow>

          <FormRow label={t("settings.backupAuto")}>
            <div className="flex items-center gap-2.5">
              <Switch.Root
                checked={backupSettings?.autoBackupEnabled ?? false}
                onCheckedChange={(checked) =>
                  backupSettings &&
                  void persistBackupSettings({
                    ...backupSettings,
                    autoBackupEnabled: checked,
                  })
                }
                className="w-9 h-5 rounded-pill relative bg-surface-alt border border-border data-[state=checked]:bg-accent data-[state=checked]:border-accent transition-colors ease-[var(--ease-out)] outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <Switch.Thumb className="block w-4 h-4 rounded-pill bg-white translate-x-0.5 transition-transform ease-[var(--ease-out)] data-[state=checked]:translate-x-[18px]" />
              </Switch.Root>
              <span className="text-[13px] text-ink-soft">{t("settings.backupAutoHelp")}</span>
            </div>
          </FormRow>

          <FormRow label={t("settings.backupInterval")}>
            <TextInput
              type="number"
              min={1}
              disabled={!backupSettings?.autoBackupEnabled}
              value={backupSettings?.intervalDays ?? 7}
              onChange={(e) =>
                backupSettings &&
                void persistBackupSettings({
                  ...backupSettings,
                  intervalDays: Number(e.target.value),
                })
              }
            />
          </FormRow>

          <div className="py-4 border-t border-border mt-1">
            {backupSettings?.lastBackupAt && (
              <div className="text-[13px] text-ink-soft mb-3.5">
                {t("settings.backupLast", {
                  date: new Date(backupSettings.lastBackupAt).toLocaleString(),
                })}
              </div>
            )}

            {backupError && <ErrorText>{backupError}</ErrorText>}
            {backupMessage && <div className="text-[13px] text-ink-soft mb-2">{backupMessage}</div>}

            <div className="flex gap-2.5">
              <Button onClick={() => void handleBackupNow()} disabled={backupRunning}>
                {backupRunning ? t("settings.backupRunning") : t("settings.backupNow")}
              </Button>
              <Button variant="secondary" onClick={() => void handleRestore()} disabled={restoring}>
                {restoring ? t("settings.backupRestoring") : t("settings.backupRestore")}
              </Button>
            </div>

            {restoreCandidates && (
              <div className="mt-4.5 border-t border-border pt-4.5">
                <div className="text-[13px] font-semibold mb-2.5">
                  {t("settings.backupChooseRestoreTitle")}
                </div>
                <div className="flex flex-col gap-0.5 mb-3 -mx-2">
                  {restoreCandidates.map((entry) => (
                    <button
                      key={entry.path}
                      onClick={() => handleRestoreSelect(entry)}
                      disabled={restoring}
                      className="text-left text-[13px] font-mono px-3 py-2 rounded-control hover:bg-surface-alt cursor-pointer transition-colors"
                    >
                      {entry.folderName}
                    </button>
                  ))}
                </div>
                <Button variant="secondary" onClick={() => setRestoreCandidates(null)}>
                  {t("settings.cancel")}
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      <Sheet
        open={categoryPendingDelete !== null}
        onOpenChange={(open) => !open && setCategoryPendingDelete(null)}
        title={t("settings.categoryDeleteTitle")}
      >
        <p className="text-[13px] text-ink-soft mb-4">
          {t("settings.categoryDeleteConfirm", { name: categoryPendingDelete?.name })}
        </p>
        <div className="flex gap-2.5 justify-end">
          <Button variant="secondary" onClick={() => setCategoryPendingDelete(null)}>
            {t("settings.cancel")}
          </Button>
          <Button variant="ghost-danger" onClick={() => void confirmDeleteCategory()}>
            {t("settings.categoryDelete")}
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={restorePendingEntry !== null}
        onOpenChange={(open) => !open && setRestorePendingEntry(null)}
        title={t("settings.backupRestoreTitle")}
      >
        <p className="text-[13px] text-ink-soft mb-4">{t("settings.backupRestoreConfirm")}</p>
        <div className="flex gap-2.5 justify-end">
          <Button
            variant="secondary"
            onClick={() => setRestorePendingEntry(null)}
            disabled={restoring}
          >
            {t("settings.cancel")}
          </Button>
          <Button variant="ghost-danger" onClick={() => void confirmRestore()} disabled={restoring}>
            {restoring ? t("settings.backupRestoring") : t("settings.backupRestoreAction")}
          </Button>
        </div>
      </Sheet>

      <Toast message={documentsToast} tone="info" onDismiss={() => setDocumentsToast(null)} />
    </div>
  );
}
