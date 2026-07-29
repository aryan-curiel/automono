import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Field";
import { PageHeader } from "../components/PageHeader";
import { listContracts } from "../db/contracts";
import type { ContractRecord } from "../db/contracts";
import { listClients } from "../db/clients";
import type { ClientRecord } from "../db/clients";
import { formatDate } from "../lib/format";
import { contractStatusMeta } from "../lib/status";
import type { ContractStatus } from "../types";

interface ContratosProps {
  onOpenContract: (id: number) => void;
  onNewContract: () => void;
}

export function Contratos({ onOpenContract, onNewContract }: ContratosProps) {
  const { t } = useTranslation();
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientFilter, setClientFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    listClients().then(setClients);
  }, []);

  useEffect(() => {
    listContracts({
      clientId: clientFilter ? Number(clientFilter) : undefined,
      status: (statusFilter || undefined) as ContractStatus | undefined,
    })
      .then(setContracts)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [clientFilter, statusFilter]);

  function clientName(clientId: number): string {
    return clients.find((c) => c.id === clientId)?.name ?? "—";
  }

  return (
    <div className="px-10 pt-8 pb-15">
      <PageHeader
        title={t("contracts.title")}
        subtitle={t("contracts.subtitleCount", { count: contracts.length })}
        actions={<Button onClick={onNewContract}>+ {t("contracts.newContract")}</Button>}
      />

      <div className="flex gap-3.5 mb-5.5 max-w-[480px]">
        <Select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="">{t("contracts.filters.allClients")}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{t("contracts.filters.allStatuses")}</option>
          <option value="active">{t("contracts.status.active")}</option>
          <option value="expired">{t("contracts.status.expired")}</option>
          <option value="terminated">{t("contracts.status.terminated")}</option>
        </Select>
      </div>

      {loading ? (
        <div className="text-sm text-ink-soft">{t("contracts.loading")}</div>
      ) : loadError ? (
        <div className="text-sm text-danger">{t("contracts.errors.loadFailed")}</div>
      ) : contracts.length === 0 ? (
        <div className="text-sm text-ink-soft">{t("contracts.empty")}</div>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1.6fr_1.2fr_1fr_1fr_.9fr] py-3 px-5.5 bg-surface-alt font-semibold text-xs uppercase tracking-wide text-ink-soft">
            <div>{t("contracts.columns.title")}</div>
            <div>{t("contracts.columns.client")}</div>
            <div>{t("contracts.columns.startDate")}</div>
            <div>{t("contracts.columns.endDate")}</div>
            <div>{t("contracts.columns.status")}</div>
          </div>
          {contracts.map((c) => {
            const meta = contractStatusMeta(c.status);
            return (
              <div
                key={c.id}
                onClick={() => onOpenContract(c.id)}
                className="grid grid-cols-[1.6fr_1.2fr_1fr_1fr_.9fr] py-4 px-5.5 border-t border-border items-center cursor-pointer"
              >
                <div className="font-semibold text-sm">{c.title}</div>
                <div className="text-[13px] font-medium">{clientName(c.clientId)}</div>
                <div className="text-[13px]">{formatDate(c.startDate)}</div>
                <div className="text-[13px]">{formatDate(c.endDate)}</div>
                <div>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
