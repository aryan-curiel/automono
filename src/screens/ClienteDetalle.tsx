import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Label, TextInput } from "../components/ui/Field";
import { BackLink } from "../components/PageHeader";
import { deleteClient, getClient } from "../db/clients";
import type { ClientRecord } from "../db/clients";
import { listContracts } from "../db/contracts";
import type { ContractRecord } from "../db/contracts";
import { formatDate } from "../lib/format";
import { contractStatusMeta } from "../lib/status";

interface ClienteDetalleProps {
  clientId: number;
  onBack: () => void;
  onEditClient: (id: number) => void;
  onDeleted: () => void;
  onOpenContract: (id: number) => void;
  onNewContract: (clientId: number) => void;
}

export function ClienteDetalle({
  clientId,
  onBack,
  onEditClient,
  onDeleted,
  onOpenContract,
  onNewContract,
}: ClienteDetalleProps) {
  const { t } = useTranslation();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const loading = loadedId !== clientId && !loadError;

  useEffect(() => {
    let cancelled = false;
    getClient(clientId)
      .then((c) => {
        if (cancelled) return;
        setClient(c);
        setLoadedId(clientId);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    listContracts({ clientId }).then(setContracts);
  }, [clientId]);

  async function handleDelete() {
    if (!client) return;
    if (!window.confirm(t("clients.actions.confirmDelete", { name: client.name }))) return;
    try {
      await deleteClient(client.id);
      onDeleted();
    } catch {
      window.alert(t("clients.errors.deleteRestricted"));
    }
  }

  if (loading) {
    return (
      <div className="px-10 pt-8 pb-15">
        <div className="text-sm text-ink-soft">{t("clients.loading")}</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-10 pt-8 pb-15">
        <div className="text-sm text-danger">{t("clients.errors.loadFailed")}</div>
      </div>
    );
  }

  if (!client) return null;

  return (
    <div className="px-10 pt-8 pb-15">
      <BackLink label={t("clients.title")} onClick={onBack} />

      <div className="flex items-start justify-between mb-5.5">
        <div>
          <h1 className="font-extrabold text-2xl tracking-tight m-0 mb-1.5">{client.name}</h1>
          <div className="text-sm text-ink-soft">
            {t(`clients.vatTreatment.${client.vatTreatment}`)} ·{" "}
            {t(`clients.invoiceLanguage.${client.invoiceLanguage}`)}
          </div>
        </div>
        <div className="flex gap-2.5 shrink-0">
          <Button variant="secondary" onClick={() => onEditClient(client.id)}>
            {t("clients.actions.edit")}
          </Button>
          <Button variant="ghost-danger" onClick={handleDelete}>
            {t("clients.actions.delete")}
          </Button>
        </div>
      </div>

      <Card className="p-5.5 max-w-[640px]">
        <div className="font-bold text-sm mb-4">{t("clients.detail.dataTitle")}</div>
        <div className="grid grid-cols-3 gap-3.5 mb-3.5">
          <div>
            <Label>{t("clients.fields.nifCif")}</Label>
            <TextInput mono readOnly value={client.nifCif} />
          </div>
          <div>
            <Label>{t("clients.fields.vatNumber")}</Label>
            <TextInput mono readOnly value={client.vatNumber ?? ""} />
          </div>
          <div>
            <Label>{t("clients.fields.invoicePrefix")}</Label>
            <TextInput mono readOnly value={client.invoicePrefix} />
          </div>
        </div>
        <div className="mb-3.5">
          <Label>{t("clients.fields.address")}</Label>
          <TextInput readOnly value={client.address ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-3.5 mb-3.5">
          <div>
            <Label>{t("clients.fields.email")}</Label>
            <TextInput readOnly value={client.email ?? ""} />
          </div>
          <div>
            <Label>{t("clients.fields.phone")}</Label>
            <TextInput readOnly value={client.phone ?? ""} />
          </div>
        </div>
        <div>
          <Label>{t("clients.fields.notes")}</Label>
          <TextInput readOnly value={client.notes ?? ""} />
        </div>
      </Card>

      <Card className="p-5.5 max-w-[640px] mt-4.5">
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-sm">{t("clients.detail.contractsTitle")}</div>
          <Button variant="secondary" onClick={() => onNewContract(client.id)}>
            + {t("contracts.newContract")}
          </Button>
        </div>
        {contracts.length === 0 ? (
          <div className="text-sm text-ink-soft">{t("contracts.empty")}</div>
        ) : (
          contracts.map((contract) => {
            const meta = contractStatusMeta(contract.status);
            return (
              <div
                key={contract.id}
                onClick={() => onOpenContract(contract.id)}
                className="flex items-center justify-between py-3 border-t border-border first:border-t-0 cursor-pointer"
              >
                <div>
                  <div className="font-semibold text-sm">{contract.title}</div>
                  <div className="text-xs text-ink-soft">
                    {formatDate(contract.startDate)} – {formatDate(contract.endDate)}
                  </div>
                </div>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
