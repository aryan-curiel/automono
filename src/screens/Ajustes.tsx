import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import * as Switch from "@radix-ui/react-switch";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { Sheet } from "../components/ui/Sheet";
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
import type { LlmProvider, LlmSettingsRecord } from "../db/llmSettings";

const EMPTY_LLM_SETTINGS: LlmSettingsRecord = {
  provider: "anthropic",
  anthropicApiKey: null,
  openaiApiKey: null,
  openrouterApiKey: null,
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
type Tab = "general" | "datos" | "categorias" | "backup";

const TABS: { value: Tab; label: string }[] = [
  { value: "general", label: "General" },
  { value: "datos", label: "Datos" },
  { value: "categorias", label: "Categorías" },
  { value: "backup", label: "Copia de seguridad" },
];

interface AjustesProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export function Ajustes({ theme, onToggleTheme }: AjustesProps) {
  const { t } = useTranslation();
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
    getBackupSettings().then(setBackupSettings);
  }, []);

  useEffect(() => {
    listExpenseCategories().then(setCategories);
  }, []);

  useEffect(() => {
    getLlmSettings().then(setLlmSettings);
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
      setCategoryError("Ya existe una categoría con ese nombre.");
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
      setCategoryError("Ya existe una categoría con ese nombre.");
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
          ? `Esta categoría se usa en ${e.count} gasto(s). Cambia esos gastos de categoría antes de eliminarla.`
          : "No se pudo eliminar la categoría.",
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
    if (!form.name.trim()) next.name = "El nombre es obligatorio";
    if (!isValidNifCif(form.nifCif)) next.nifCif = "NIF/CIF con formato inválido";
    if (!isValidVatNumber(form.vatNumber)) next.vatNumber = "Número de IVA con formato inválido";
    if (form.iban.trim() && !isValidIban(form.iban))
      next.iban = "IBAN con formato o dígitos de control inválidos";
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
      setForm(payload);
      setSaved(true);
    } catch {
      setSaveError("No se pudo guardar. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
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
      setSaveError("No se pudo subir el logo. Inténtalo de nuevo.");
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
      setBackupError("Elige primero una carpeta de destino.");
      return;
    }
    setBackupRunning(true);
    try {
      await backupNow();
      setBackupMessage("Copia de seguridad completada.");
      setBackupSettings(await getBackupSettings());
    } catch (e) {
      setBackupError(`No se pudo completar la copia: ${String(e)}`);
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
        setBackupError("No se han encontrado copias de seguridad en esa carpeta.");
        return;
      }
      setRestoreCandidates(entries);
    } catch (e) {
      setBackupError(`No se pudo leer la carpeta: ${String(e)}`);
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
      window.location.reload();
    } catch (e) {
      setBackupError(`No se pudo restaurar: ${String(e)}`);
      setRestoring(false);
    } finally {
      setRestorePendingEntry(null);
    }
  }

  return (
    <div className="px-8 pb-15">
      <PageHeader title="Ajustes" />

      <div className="mb-5">
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === "general" && (
        <Card className="px-5 max-w-[640px] mb-5">
          <div className="pt-4 pb-3">
            <div className="font-bold text-sm mb-1.5">Apariencia</div>
          </div>
          <FormRow label="Modo oscuro">
            <div className="flex items-center gap-2.5">
              <Switch.Root
                checked={theme === "dark"}
                onCheckedChange={onToggleTheme}
                className="w-9 h-5 rounded-pill relative bg-surface-alt border border-border data-[state=checked]:bg-accent data-[state=checked]:border-accent transition-colors ease-[var(--ease-out)] outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <Switch.Thumb className="block w-4 h-4 rounded-pill bg-white translate-x-0.5 transition-transform ease-[var(--ease-out)] data-[state=checked]:translate-x-[18px]" />
              </Switch.Root>
              <span className="text-[13px] text-ink-soft">
                {theme === "dark" ? "Activado" : "Desactivado"}
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
          )}

          {llmSettings.provider === "openai" && (
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
            <Button onClick={handleSaveLlmSettings} disabled={llmSaving}>
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
          <div className="text-sm text-ink-soft mb-5">Cargando…</div>
        ) : loadError ? (
          <div className="text-sm text-danger mb-5">
            No se pudieron cargar los datos del negocio.
          </div>
        ) : (
          <>
            <Card className="px-5 max-w-[640px] mb-5">
              <div className="pt-4 pb-3">
                <div className="font-bold text-sm mb-1.5">Datos del negocio</div>
              </div>
              <FormRow label="Nombre / Razón social" error={errors.name}>
                <TextInput
                  value={form.name}
                  error={!!errors.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </FormRow>
              <FormRow label="NIF" error={errors.nifCif}>
                <TextInput
                  mono
                  value={form.nifCif}
                  error={!!errors.nifCif}
                  onChange={(e) => handleNifChange(e.target.value)}
                />
              </FormRow>
              <FormRow label="Número de IVA" error={errors.vatNumber}>
                <TextInput
                  mono
                  value={form.vatNumber}
                  error={!!errors.vatNumber}
                  onChange={(e) => handleVatNumberChange(e.target.value)}
                />
              </FormRow>
              <FormRow label="Dirección fiscal">
                <TextInput value={form.address} onChange={(e) => set("address", e.target.value)} />
              </FormRow>
              <FormRow label="Logo">
                <div className="flex items-center gap-2.5">
                  {form.logoPath && (
                    <img
                      src={convertFileSrc(form.logoPath)}
                      alt={t("settings.logoAlt")}
                      className="w-8 h-8 rounded-control object-contain bg-surface-alt shrink-0"
                    />
                  )}
                  <Button variant="secondary" onClick={handlePickLogo} disabled={logoUploading}>
                    {logoUploading ? "Subiendo…" : form.logoPath ? "Cambiar logo" : "Subir logo"}
                  </Button>
                  <span className="text-[13px] text-ink-soft">
                    Se imprime en la esquina de la factura.
                  </span>
                </div>
              </FormRow>
            </Card>

            <Card className="px-5 max-w-[640px] mb-5">
              <div className="pt-4 pb-3">
                <div className="font-bold text-sm mb-1.5">Datos bancarios</div>
              </div>
              <FormRow label="Nombre del banco">
                <TextInput
                  value={form.bankName}
                  onChange={(e) => set("bankName", e.target.value)}
                />
              </FormRow>
              <FormRow label="IBAN" error={errors.iban}>
                <TextInput
                  mono
                  value={form.iban}
                  error={!!errors.iban}
                  onChange={(e) => set("iban", e.target.value)}
                />
              </FormRow>
              <FormRow label="BIC / SWIFT">
                <TextInput mono value={form.bic} onChange={(e) => set("bic", e.target.value)} />
              </FormRow>
            </Card>

            {saveError && <ErrorText>{saveError}</ErrorText>}
            <div className="flex items-center gap-3 max-w-[640px]">
              <Button onClick={handleSave} disabled={saving}>
                Guardar
              </Button>
              {saved && <span className="text-[13px] text-ink-soft">Guardado.</span>}
            </div>
          </>
        ))}

      {tab === "categorias" && (
        <Card className="px-5 max-w-[640px]">
          <div className="pt-4 pb-3">
            <div className="font-bold text-sm mb-1.5">Categorías de gastos</div>
            <div className="text-[13px] text-ink-soft">
              Estas son las opciones disponibles al registrar un gasto.
            </div>
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
                    <Button onClick={() => handleRenameCategory(category.id)}>Guardar</Button>
                    <Button variant="secondary" onClick={() => setEditingCategoryId(null)}>
                      Cancelar
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
                      Renombrar
                    </Button>
                    <Button variant="secondary" onClick={() => handleDeleteCategory(category)}>
                      Eliminar
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>

          {categoryError && <ErrorText>{categoryError}</ErrorText>}

          <div className="flex items-center gap-2.5 pt-3 pb-4 border-t border-border mt-1">
            <TextInput
              placeholder="Nueva categoría"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleAddCategory}>Añadir</Button>
          </div>
        </Card>
      )}

      {tab === "backup" && (
        <Card className="px-5 max-w-[640px]">
          <div className="pt-4 pb-3">
            <div className="font-bold text-sm mb-1.5">Copia de seguridad</div>
            <div className="text-[13px] text-ink-soft">
              Se guarda una copia de la base de datos, facturas y contratos en una carpeta local que
              tú sincronizas con Drive/S3.
            </div>
          </div>

          <FormRow label="Carpeta de destino">
            <div className="flex gap-2.5 items-center">
              <TextInput value={backupSettings?.folderPath ?? ""} readOnly className="flex-1" />
              <Button variant="secondary" onClick={handlePickFolder}>
                Elegir carpeta
              </Button>
              {backupSettings?.folderPath && (
                <Button
                  variant="secondary"
                  onClick={() => openBackupFolder(backupSettings.folderPath)}
                >
                  Abrir carpeta
                </Button>
              )}
            </div>
          </FormRow>

          <FormRow label="Conservar copias (días)">
            <TextInput
              type="number"
              min={0}
              value={backupSettings?.retentionDays ?? 30}
              onChange={(e) =>
                backupSettings &&
                persistBackupSettings({
                  ...backupSettings,
                  retentionDays: Number(e.target.value),
                })
              }
            />
          </FormRow>

          <FormRow label="Copia automática">
            <div className="flex items-center gap-2.5">
              <Switch.Root
                checked={backupSettings?.autoBackupEnabled ?? false}
                onCheckedChange={(checked) =>
                  backupSettings &&
                  persistBackupSettings({
                    ...backupSettings,
                    autoBackupEnabled: checked,
                  })
                }
                className="w-9 h-5 rounded-pill relative bg-surface-alt border border-border data-[state=checked]:bg-accent data-[state=checked]:border-accent transition-colors ease-[var(--ease-out)] outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <Switch.Thumb className="block w-4 h-4 rounded-pill bg-white translate-x-0.5 transition-transform ease-[var(--ease-out)] data-[state=checked]:translate-x-[18px]" />
              </Switch.Root>
              <span className="text-[13px] text-ink-soft">Al abrir la app</span>
            </div>
          </FormRow>

          <FormRow label="Repetir cada (días)">
            <TextInput
              type="number"
              min={1}
              disabled={!backupSettings?.autoBackupEnabled}
              value={backupSettings?.intervalDays ?? 7}
              onChange={(e) =>
                backupSettings &&
                persistBackupSettings({
                  ...backupSettings,
                  intervalDays: Number(e.target.value),
                })
              }
            />
          </FormRow>

          <div className="py-4 border-t border-border mt-1">
            {backupSettings?.lastBackupAt && (
              <div className="text-[13px] text-ink-soft mb-3.5">
                Última copia: {new Date(backupSettings.lastBackupAt).toLocaleString()}
              </div>
            )}

            {backupError && <ErrorText>{backupError}</ErrorText>}
            {backupMessage && <div className="text-[13px] text-ink-soft mb-2">{backupMessage}</div>}

            <div className="flex gap-2.5">
              <Button onClick={handleBackupNow} disabled={backupRunning}>
                {backupRunning ? "Copiando…" : "Copia de seguridad ahora"}
              </Button>
              <Button variant="secondary" onClick={handleRestore} disabled={restoring}>
                {restoring ? "Restaurando…" : "Restaurar desde copia"}
              </Button>
            </div>

            {restoreCandidates && (
              <div className="mt-4.5 border-t border-border pt-4.5">
                <div className="text-[13px] font-semibold mb-2.5">
                  Elige una copia para restaurar
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
                  Cancelar
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      <Sheet
        open={categoryPendingDelete !== null}
        onOpenChange={(open) => !open && setCategoryPendingDelete(null)}
        title="Eliminar categoría"
      >
        <p className="text-[13px] text-ink-soft mb-4">
          ¿Eliminar la categoría "{categoryPendingDelete?.name}"?
        </p>
        <div className="flex gap-2.5 justify-end">
          <Button variant="secondary" onClick={() => setCategoryPendingDelete(null)}>
            Cancelar
          </Button>
          <Button variant="ghost-danger" onClick={confirmDeleteCategory}>
            Eliminar
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={restorePendingEntry !== null}
        onOpenChange={(open) => !open && setRestorePendingEntry(null)}
        title="Restaurar copia de seguridad"
      >
        <p className="text-[13px] text-ink-soft mb-4">
          Esto sobrescribirá tus datos actuales con los de la copia seleccionada. ¿Continuar?
        </p>
        <div className="flex gap-2.5 justify-end">
          <Button
            variant="secondary"
            onClick={() => setRestorePendingEntry(null)}
            disabled={restoring}
          >
            Cancelar
          </Button>
          <Button variant="ghost-danger" onClick={confirmRestore} disabled={restoring}>
            {restoring ? "Restaurando…" : "Restaurar"}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
