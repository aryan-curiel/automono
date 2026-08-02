import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Switch from "@radix-ui/react-switch";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { ErrorText, TextInput } from "../components/ui/Field";
import { FormRow } from "../components/ui/FormRow";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { getBusinessProfile, updateBusinessProfile } from "../db/businessProfile";
import type { BusinessProfileRecord } from "../db/businessProfile";
import { isValidNifCif, isValidVatNumber } from "../features/clients";
import { isValidIban } from "../features/settings";
import { runHealthcheck } from "../db/healthcheck";
import {
  getBackupSettings,
  updateBackupSettings,
  pickBackupFolder,
  backupNow,
  listBackups,
  restoreFromBackup,
} from "../db/backup";
import type { BackupSettingsRecord, BackupEntry } from "../db/backup";

const EMPTY_FORM: BusinessProfileRecord = {
  name: "",
  nifCif: "",
  vatNumber: "",
  address: "",
  bankName: "",
  iban: "",
  bic: "",
};

type FieldErrors = Partial<Record<"name" | "nifCif" | "vatNumber" | "iban", string>>;
type Tab = "general" | "datos" | "backup";

const TABS: { value: Tab; label: string }[] = [
  { value: "general", label: "General" },
  { value: "datos", label: "Datos" },
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

  const [backupSettings, setBackupSettings] = useState<BackupSettingsRecord | null>(null);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreCandidates, setRestoreCandidates] = useState<BackupEntry[] | null>(null);

  useEffect(() => {
    getBackupSettings().then(setBackupSettings);
  }, []);

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

  async function handleRestoreSelect(entry: BackupEntry) {
    if (
      !window.confirm(
        "Esto sobrescribirá tus datos actuales con los de la copia seleccionada. ¿Continuar?",
      )
    )
      return;
    setRestoring(true);
    setBackupError(null);
    try {
      await restoreFromBackup(entry.path);
      window.location.reload();
    } catch (e) {
      setBackupError(`No se pudo restaurar: ${String(e)}`);
      setRestoring(false);
    }
  }

  return (
    <div className="px-8 pb-15">
      <PageHeader title="Ajustes" />

      <div className="mb-5">
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === "general" && (
        <>
          <Card className="px-5 max-w-[640px] mb-5">
            <div className="pt-4 pb-4">
              <div className="font-bold text-sm mb-1.5">Apariencia</div>
              <FormRow label="Modo oscuro">
                <div className="flex items-center gap-2.5">
                  <Switch.Root
                    checked={theme === "dark"}
                    onCheckedChange={onToggleTheme}
                    className="w-9 h-5 rounded-pill relative bg-surface-alt border border-border data-[state=checked]:bg-accent data-[state=checked]:border-accent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <Switch.Thumb className="block w-4 h-4 rounded-pill bg-white translate-x-0.5 transition-transform data-[state=checked]:translate-x-[18px]" />
                  </Switch.Root>
                  <span className="text-[13px] text-ink-soft">
                    {theme === "dark" ? "Activado" : "Desactivado"}
                  </span>
                </div>
              </FormRow>
            </div>
          </Card>

          <Card className="px-5 max-w-[640px]">
            <div className="pt-4 pb-4">
              <div className="font-bold text-sm mb-1.5">{t("settings.dbSectionTitle")}</div>
              <div className="text-[13px] text-ink-soft">{dbStatus}</div>
            </div>
          </Card>
        </>
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
              <div className="font-bold text-sm pt-4 pb-1">Datos del negocio</div>
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
            </Card>

            <Card className="px-5 max-w-[640px] mb-5">
              <div className="font-bold text-sm pt-4 pb-1">Datos bancarios</div>
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

      {tab === "backup" && (
        <Card className="px-5 max-w-[640px]">
          <div className="pt-4 pb-3">
            <div className="font-bold text-sm mb-1.5">Copia de seguridad</div>
            <div className="text-[13px] text-ink-soft">
              Se guarda una copia de la base de datos, facturas y contratos en una carpeta local
              que tú sincronizas con Drive/S3.
            </div>
          </div>

          <FormRow label="Carpeta de destino">
            <div className="flex gap-2.5 items-center">
              <TextInput value={backupSettings?.folderPath ?? ""} readOnly className="flex-1" />
              <Button variant="secondary" onClick={handlePickFolder}>
                Elegir carpeta
              </Button>
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
                className="w-9 h-5 rounded-pill relative bg-surface-alt border border-border data-[state=checked]:bg-accent data-[state=checked]:border-accent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <Switch.Thumb className="block w-4 h-4 rounded-pill bg-white translate-x-0.5 transition-transform data-[state=checked]:translate-x-[18px]" />
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
            {backupMessage && (
              <div className="text-[13px] text-ink-soft mb-2">{backupMessage}</div>
            )}

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
    </div>
  );
}
