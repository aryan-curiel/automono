import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ErrorText, Label, Select, TextArea, TextInput } from "../components/ui/Field";
import { BackLink } from "../components/PageHeader";
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
    listClients().then(setClients);
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
      const stored = await attachContractFile(clientId, source);
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
      <div className="px-10 pt-8 pb-15">
        <div className="text-sm text-ink-soft">{t("contracts.loading")}</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-10 pt-8 pb-15">
        <div className="text-sm text-danger">{t("contracts.errors.loadFailed")}</div>
      </div>
    );
  }

  return (
    <div className="px-10 pt-8 pb-15">
      <BackLink label={t("contracts.title")} onClick={onCancel} />
      <h1 className="font-extrabold text-2xl tracking-tight m-0 mb-5.5">
        {mode === "create" ? t("contracts.newContract") : t("contracts.editContract")}
      </h1>

      <Card className="p-5.5 max-w-[640px]">
        <div className="grid grid-cols-2 gap-3.5 mb-3.5">
          <div>
            <Label>{t("contracts.fields.client")}</Label>
            <Select
              value={form.clientId}
              error={!!errors.clientId}
              disabled={presetClientId !== undefined}
              onChange={(e) => set("clientId", e.target.value)}
            >
              <option value="">{t("contracts.fields.clientUnset")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {errors.clientId && <ErrorText>{errors.clientId}</ErrorText>}
          </div>
          <div>
            <Label>{t("contracts.fields.status")}</Label>
            <Select value={form.status} onChange={(e) => set("status", e.target.value as ContractStatus)}>
              <option value="active">{t("contracts.status.active")}</option>
              <option value="expired">{t("contracts.status.expired")}</option>
              <option value="terminated">{t("contracts.status.terminated")}</option>
            </Select>
          </div>
        </div>

        <div className="mb-3.5">
          <Label>{t("contracts.fields.title")}</Label>
          <TextInput
            value={form.title}
            error={!!errors.title}
            onChange={(e) => set("title", e.target.value)}
          />
          {errors.title && <ErrorText>{errors.title}</ErrorText>}
        </div>

        <div className="grid grid-cols-2 gap-3.5 mb-3.5">
          <div>
            <Label>{t("contracts.fields.startDate")}</Label>
            <TextInput
              type="date"
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </div>
          <div>
            <Label>{t("contracts.fields.endDate")}</Label>
            <TextInput
              type="date"
              value={form.endDate}
              onChange={(e) => set("endDate", e.target.value)}
            />
          </div>
        </div>

        <div className="mb-4.5">
          <Label>{t("contracts.fields.file")}</Label>
          <div className="flex items-center gap-2.5">
            <Button variant="secondary" onClick={handleAttachFile} disabled={attaching}>
              {attaching ? t("contracts.actions.attaching") : t("contracts.actions.attachFile")}
            </Button>
            {form.filePath && (
              <span className="text-[13px] text-ink-soft truncate">
                {fileNameOf(form.filePath)}
              </span>
            )}
          </div>
        </div>

        <div className="mb-4.5">
          <Label>{t("contracts.fields.notes")}</Label>
          <TextArea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>

        {saveError && <ErrorText>{saveError}</ErrorText>}

        <div className="flex gap-2.5 mt-4.5">
          <Button onClick={handleSubmit} disabled={saving}>
            {t("contracts.actions.save")}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            {t("contracts.actions.cancel")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
