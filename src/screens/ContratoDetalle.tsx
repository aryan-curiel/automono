import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ErrorText, Label, TextInput } from "../components/ui/Field";
import { BackLink } from "../components/PageHeader";
import { deleteContract, getContract, openContractFile } from "../db/contracts";
import type { ContractRecord } from "../db/contracts";
import { getClient } from "../db/clients";
import { formatDate } from "../lib/format";
import { contractStatusMeta } from "../lib/status";

interface ContratoDetalleProps {
  contractId: number;
  onBack: () => void;
  onEditContract: (id: number) => void;
  onDeleted: () => void;
}

export function ContratoDetalle({
  contractId,
  onBack,
  onEditContract,
  onDeleted,
}: ContratoDetalleProps) {
  const { t } = useTranslation();
  const [contract, setContract] = useState<ContractRecord | null>(null);
  const [clientName, setClientName] = useState("");
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const loading = loadedId !== contractId && !loadError;

  useEffect(() => {
    let cancelled = false;
    getContract(contractId)
      .then(async (c) => {
        if (cancelled || !c) return;
        setContract(c);
        const client = await getClient(c.clientId);
        if (cancelled) return;
        setClientName(client?.name ?? "");
        setLoadedId(contractId);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [contractId]);

  async function handleDelete() {
    if (!contract) return;
    if (!window.confirm(t("contracts.actions.confirmDelete", { title: contract.title }))) return;
    await deleteContract(contract.id);
    onDeleted();
  }

  async function handleOpenFile() {
    if (!contract?.filePath) return;
    setOpenError(null);
    try {
      await openContractFile(contract.filePath);
    } catch (err) {
      setOpenError(String(err));
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

  if (!contract) return null;

  const meta = contractStatusMeta(contract.status);

  return (
    <div className="px-10 pt-8 pb-15">
      <BackLink label={t("contracts.title")} onClick={onBack} />

      <div className="flex items-start justify-between mb-5.5">
        <div>
          <h1 className="font-extrabold text-2xl tracking-tight m-0 mb-1.5">{contract.title}</h1>
          <div className="text-sm text-ink-soft">{clientName}</div>
        </div>
        <div className="flex gap-2.5 shrink-0">
          <Button variant="secondary" onClick={() => onEditContract(contract.id)}>
            {t("contracts.actions.edit")}
          </Button>
          <Button variant="ghost-danger" onClick={handleDelete}>
            {t("contracts.actions.delete")}
          </Button>
        </div>
      </div>

      <Card className="p-5.5 max-w-[640px]">
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-sm">{t("contracts.detail.dataTitle")}</div>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-3.5 mb-3.5">
          <div>
            <Label>{t("contracts.fields.startDate")}</Label>
            <TextInput readOnly value={formatDate(contract.startDate)} />
          </div>
          <div>
            <Label>{t("contracts.fields.endDate")}</Label>
            <TextInput readOnly value={formatDate(contract.endDate)} />
          </div>
        </div>

        <div className="mb-3.5">
          <Label>{t("contracts.fields.notes")}</Label>
          <TextInput readOnly value={contract.notes ?? ""} />
        </div>

        <div>
          <Label>{t("contracts.fields.file")}</Label>
          <div className="flex items-center gap-2.5">
            <Button variant="secondary" onClick={handleOpenFile} disabled={!contract.filePath}>
              {t("contracts.actions.openFile")}
            </Button>
            {!contract.filePath && (
              <span className="text-xs text-ink-soft">{t("contracts.fields.noFile")}</span>
            )}
          </div>
          {openError && <ErrorText>{openError}</ErrorText>}
        </div>
      </Card>
    </div>
  );
}
