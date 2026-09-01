import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ErrorText, Select, TextArea, TextInput } from "../components/ui/Field";
import { FormRow } from "../components/ui/FormRow";
import { PageHeader } from "../components/PageHeader";
import {
  attachContractFile,
  createContract,
  getContract,
  pickContractFile,
  updateContract,
} from "../db/contracts";
import type { ContractRecord, NewContract } from "../db/contracts";
import { listClients } from "../db/clients";
import type { ClientRecord } from "../db/clients";
import type { ContractStatus } from "../types";

interface ContratoFormProps {
  mode: "create" | "edit";
  contractId?: number;
  presetClientId?: number;
  onSaved: (contract: ContractRecord) => void;
  onCancel: () => void;
}

interface FormState {
  clientId: string;
  title: string;
  filePath: string | null;
  startDate: string;
  endDate: string;
  status: ContractStatus;
  notes: string;
}

function emptyForm(presetClientId?: number): FormState {
  return {
    clientId: presetClientId ? String(presetClientId) : "",
    title: "",
    filePath: null,
    startDate: "",
    endDate: "",
    status: "active",
    notes: "",
  };
}

function toFormState(contract: ContractRecord): FormState {
  return {
    clientId: String(contract.clientId),
    title: contract.title,
    filePath: contract.filePath,
    startDate: contract.startDate ?? "",
    endDate: contract.endDate ?? "",
    status: contract.status,
    notes: contract.notes ?? "",
  };
}

function fileNameOf(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

type FieldErrors = Partial<Record<"clientId" | "title", string>>;

export function ContratoForm({
  mode,
  contractId,
  presetClientId,
  onSaved,
  onCancel,
}: ContratoFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(emptyForm(presetClientId));
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(mode === "edit");
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    void listClients().then(setClients);
  }, []);

  useEffect(() => {
    if (mode !== "edit" || contractId === undefined) return;
    let cancelled = false;
    getContract(contractId)
      .then((contract) => {
        if (cancelled) return;
        if (contract) setForm(toFormState(contract));
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
  }, [mode, contractId]);

  const clientName = clients.find((c) => String(c.id) === form.clientId)?.name ?? "";

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleAttachFile() {
    const clientId = Number(form.clientId);
    if (!clientId) {
      setErrors((e) => ({ ...e, clientId: t("contracts.errors.clientRequired") }));
      return;
    }
    const source = await pickContractFile();
    if (!source) return;
    setAttaching(true);
    setSaveError(null);
    try {
      // ponytail: uses the start date already typed in the form at click time, so attaching
      // before filling it in falls back to today's date.
      const startDate = form.startDate || new Date().toISOString().slice(0, 10);
      const stored = await attachContractFile(clientId, source, startDate);
      set("filePath", stored);
    } catch {
      setSaveError(t("contracts.errors.attachFailed"));
    } finally {
      setAttaching(false);
    }
  }

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!form.clientId) next.clientId = t("contracts.errors.clientRequired");
    if (!form.title.trim()) next.title = t("contracts.errors.titleRequired");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    setSaveError(null);
    if (!validate()) return;

    const payload: NewContract = {
      clientId: Number(form.clientId),
      title: form.title.trim(),
      filePath: form.filePath,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      status: form.status,
      notes: form.notes.trim() || null,
    };

    setSaving(true);
    try {
      if (mode === "create") {
        const created = await createContract(payload);
        onSaved(created);
      } else {
        await updateContract(contractId!, payload);
        const updated = await getContract(contractId!);
        if (updated) onSaved(updated);
      }
    } catch {
      setSaveError(t("contracts.errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="px-8 pb-15">
        <div className="text-sm text-ink-soft">{t("contracts.loading")}</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-8 pb-15">
        <div className="text-sm text-danger">{t("contracts.errors.loadFailed")}</div>
      </div>
    );
  }

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title={mode === "create" ? t("contracts.newContract") : t("contracts.editContract")}
        backLabel={clientName}
        onBack={onCancel}
      />

      <Card className="px-5 max-w-[640px]">
        <FormRow label={t("contracts.fields.client")} error={errors.clientId}>
          <Select
            value={form.clientId}
            error={!!errors.clientId}
            disabled={presetClientId !== undefined}
            onChange={(e) => {
              set("clientId", e.target.value);
              if (e.target.value) setErrors((err) => ({ ...err, clientId: undefined }));
            }}
          >
            <option value="">{t("contracts.fields.clientUnset")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormRow>

        <FormRow label={t("contracts.fields.status")}>
          <Select
            value={form.status}
            onChange={(e) => set("status", e.target.value as ContractStatus)}
          >
            <option value="active">{t("contracts.status.active")}</option>
            <option value="expired">{t("contracts.status.expired")}</option>
            <option value="terminated">{t("contracts.status.terminated")}</option>
          </Select>
        </FormRow>

        <FormRow label={t("contracts.fields.title")} error={errors.title}>
          <TextInput
            value={form.title}
            error={!!errors.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </FormRow>

        <FormRow label={t("contracts.fields.startDate")}>
          <TextInput
            type="date"
            value={form.startDate}
            onChange={(e) => set("startDate", e.target.value)}
          />
        </FormRow>

        <FormRow label={t("contracts.fields.endDate")}>
          <TextInput
            type="date"
            value={form.endDate}
            onChange={(e) => set("endDate", e.target.value)}
          />
        </FormRow>

        <FormRow label={t("contracts.fields.file")}>
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              onClick={() => void handleAttachFile()}
              disabled={attaching}
            >
              {attaching ? t("contracts.actions.attaching") : t("contracts.actions.attachFile")}
            </Button>
            {form.filePath && (
              <span className="text-[13px] text-ink-soft truncate">
                {fileNameOf(form.filePath)}
              </span>
            )}
          </div>
        </FormRow>

        <FormRow label={t("contracts.fields.notes")}>
          <TextArea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </FormRow>
      </Card>

      {saveError && <ErrorText>{saveError}</ErrorText>}
      <div className="flex gap-2.5 justify-end mt-5">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          {t("contracts.actions.cancel")}
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? t("contracts.actions.saving") : t("contracts.actions.save")}
        </Button>
      </div>
    </div>
  );
}
