import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { ErrorText, Label, TextInput } from "../components/ui/Field";
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

export function Ajustes() {
  const { t } = useTranslation();
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
    if (form.iban.trim() && !isValidIban(form.iban)) next.iban = "IBAN con formato o dígitos de control inválidos";
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
    <div className="px-10 pt-8 pb-15">
      <PageHeader title="Ajustes" />

      {loading ? (
        <div className="text-sm text-ink-soft mb-5">Cargando…</div>
      ) : loadError ? (
        <div className="text-sm text-danger mb-5">No se pudieron cargar los datos del negocio.</div>
      ) : (
        <>
          <Card className="py-5.5 px-6 max-w-[640px] mb-5">
            <div className="font-bold text-sm mb-4">Datos del negocio</div>
            <div className="mb-3.5">
              <Label>Nombre / Razón social</Label>
              <TextInput
                value={form.name}
                error={!!errors.name}
                onChange={(e) => set("name", e.target.value)}
              />
              {errors.name && <ErrorText>{errors.name}</ErrorText>}
            </div>
            <div className="grid grid-cols-2 gap-3.5 mb-3.5">
              <div>
                <Label>NIF</Label>
                <TextInput
                  mono
                  value={form.nifCif}
                  error={!!errors.nifCif}
                  onChange={(e) => handleNifChange(e.target.value)}
                />
                {errors.nifCif && <ErrorText>{errors.nifCif}</ErrorText>}
              </div>
              <div>
                <Label>Número de IVA</Label>
                <TextInput
                  mono
                  value={form.vatNumber}
                  error={!!errors.vatNumber}
                  onChange={(e) => handleVatNumberChange(e.target.value)}
                />
                {errors.vatNumber && <ErrorText>{errors.vatNumber}</ErrorText>}
              </div>
            </div>
            <div className="mb-4.5">
              <Label>Dirección fiscal</Label>
              <TextInput value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>

            {saveError && <ErrorText>{saveError}</ErrorText>}

            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={saving}>
                Guardar
              </Button>
              {saved && <span className="text-[13px] text-ink-soft">Guardado.</span>}
            </div>
          </Card>

          <Card className="py-5.5 px-6 max-w-[640px] mb-5">
            <div className="font-bold text-sm mb-4">Datos bancarios</div>
            <div className="mb-3.5">
              <Label>Nombre del banco</Label>
              <TextInput value={form.bankName} onChange={(e) => set("bankName", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <Label>IBAN</Label>
                <TextInput
                  mono
                  value={form.iban}
                  error={!!errors.iban}
                  onChange={(e) => set("iban", e.target.value)}
                />
                {errors.iban && <ErrorText>{errors.iban}</ErrorText>}
              </div>
              <div>
                <Label>BIC / SWIFT</Label>
                <TextInput mono value={form.bic} onChange={(e) => set("bic", e.target.value)} />
              </div>
            </div>

            {saveError && <ErrorText>{saveError}</ErrorText>}

            <div className="flex items-center gap-3 mt-4.5">
              <Button onClick={handleSave} disabled={saving}>
                Guardar
              </Button>
              {saved && <span className="text-[13px] text-ink-soft">Guardado.</span>}
            </div>
          </Card>

          <Card className="py-5.5 px-6 max-w-[640px]">
            <div className="font-bold text-sm mb-1.5">Copia de seguridad</div>
            <div className="text-[13px] text-ink-soft mb-4">
              Se guarda una copia de la base de datos, facturas y contratos en una carpeta local que tú
              sincronizas con Drive/S3.
            </div>

            <div className="mb-3.5">
              <Label>Carpeta de destino</Label>
              <div className="flex gap-2.5 items-center">
                <TextInput value={backupSettings?.folderPath ?? ""} readOnly className="flex-1" />
                <Button variant="secondary" onClick={handlePickFolder}>
                  Elegir carpeta
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3.5 mb-3.5">
              <div>
                <Label>Conservar copias (días)</Label>
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
              </div>
              <div>
                <Label>Repetir automáticamente cada (días)</Label>
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
              </div>
            </div>

            <label className="flex items-center gap-2 text-[13px] mb-4">
              <input
                type="checkbox"
                checked={backupSettings?.autoBackupEnabled ?? false}
                onChange={(e) =>
                  backupSettings &&
                  persistBackupSettings({
                    ...backupSettings,
                    autoBackupEnabled: e.target.checked,
                  })
                }
              />
              Copia de seguridad automática al abrir la app
            </label>

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
                <div className="text-[13px] font-semibold mb-2.5">Elige una copia para restaurar</div>
                <div className="flex flex-col gap-2 mb-3">
                  {restoreCandidates.map((entry) => (
                    <button
                      key={entry.path}
                      onClick={() => handleRestoreSelect(entry)}
                      disabled={restoring}
                      className="text-left text-[13px] font-mono px-3 py-2 border border-border rounded-lg bg-surface hover:bg-bg cursor-pointer"
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
          </Card>
        </>
      )}

      <Card className="py-5.5 px-6 max-w-[640px] mt-5">
        <div className="font-bold text-sm mb-1.5">{t("settings.dbSectionTitle")}</div>
        <div className="text-[13px] text-ink-soft">{dbStatus}</div>
      </Card>
    </div>
  );
}
