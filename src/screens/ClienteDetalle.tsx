import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DotsThreeVertical } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ErrorText } from "../components/ui/Field";
import { InfoRow } from "../components/ui/InfoRow";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
import { Sheet } from "../components/ui/Sheet";
import { BackLink, PageHeader } from "../components/PageHeader";
import { deleteClient, getClient } from "../db/clients";
import type { ClientRecord } from "../db/clients";
import { listContracts } from "../db/contracts";
import type { ContractRecord } from "../db/contracts";
import type { InvoiceListItem } from "../db/invoices";
import { formatDate, formatEUR } from "../lib/format";
import { contractStatusMeta } from "../lib/status";
import { clientBalance } from "../lib/analytics";

interface ClienteDetalleProps {
  clientId: number;
  invoices: InvoiceListItem[];
  onBack: () => void;
  onEditClient: (id: number) => void;
  onDeleted: () => void;
  onOpenContract: (id: number) => void;
  onNewContract: (clientId: number) => void;
}

export function ClienteDetalle({
  clientId,
  invoices,
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
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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

  async function confirmDelete() {
    if (!client) return;
    setDeleteError(null);
    try {
      await deleteClient(client.id);
      onDeleted();
    } catch {
      setDeleteError(t("clients.errors.deleteRestricted"));
    }
  }

  if (loading) {
    return (
      <div className="px-8 pb-15">
        <BackLink label={t("clients.title")} onClick={onBack} />
        <div className="text-sm text-ink-soft">{t("clients.loading")}</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-8 pb-15">
        <BackLink label={t("clients.title")} onClick={onBack} />
        <div className="text-sm text-danger">{t("clients.errors.loadFailed")}</div>
      </div>
    );
  }

  if (!client) return null;

  const balance = clientBalance(invoices, clientId);

  return (
    <div className="px-8 pb-15">
      <BackLink label={t("clients.title")} onClick={onBack} />

      <PageHeader
        title={client.name}
        subtitle={
          <>
            <span className="font-mono">{client.nifCif}</span> · {client.email || "—"}
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => onEditClient(client.id)}>
              {t("clients.actions.edit")}
            </Button>
            <Menu>
              <MenuTrigger className="p-2 rounded-control hover:bg-surface-alt cursor-pointer">
                <DotsThreeVertical size={16} weight="bold" />
              </MenuTrigger>
              <MenuContent>
                <MenuItem
                  danger
                  onSelect={() => {
                    setDeleteError(null);
                    setDeletePending(true);
                  }}
                >
                  {t("clients.actions.delete")}
                </MenuItem>
              </MenuContent>
            </Menu>
          </>
        }
      />

      <Card className="px-5 py-1 max-w-[640px]">
        <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide pt-4 pb-2">
          {t("clients.detail.dataTitle")}
        </div>
        <InfoRow label={t("clients.fields.nifCif")} value={client.nifCif} mono />
        <InfoRow label={t("clients.fields.vatNumber")} value={client.vatNumber || "—"} mono />
        <InfoRow label={t("clients.fields.invoicePrefix")} value={client.seriesPrefix} mono />
        <InfoRow label={t("clients.fields.address")} value={client.address || "—"} />
        <InfoRow label={t("clients.fields.email")} value={client.email || "—"} />
        <InfoRow label={t("clients.fields.phone")} value={client.phone || "—"} />
        <InfoRow
          label={t("clients.fields.notes")}
          value={<span className="whitespace-pre-wrap">{client.notes || "—"}</span>}
        />
        <InfoRow
          label={t("clients.fields.vatTreatment")}
          value={t(`clients.vatTreatment.${client.vatTreatment}`)}
        />
        <InfoRow
          label={t("clients.fields.invoiceLanguage")}
          value={t(`clients.invoiceLanguage.${client.invoiceLanguage}`)}
        />
      </Card>

      <Card className="p-5.5 max-w-[640px] mt-6">
        <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-4">
          {t("clients.detail.balanceTitle")}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-ink-soft mb-1">{t("clients.detail.totalInvoiced")}</div>
            <div className="font-bold text-[15px] font-mono">{formatEUR(balance.invoiced)}</div>
          </div>
          <div>
            <div className="text-xs text-ink-soft mb-1">{t("clients.detail.totalPaid")}</div>
            <div className="font-bold text-[15px] font-mono">{formatEUR(balance.paid)}</div>
          </div>
          <div>
            <div className="text-xs text-ink-soft mb-1">{t("clients.detail.outstanding")}</div>
            <div
              className={`font-bold text-[15px] font-mono ${balance.outstanding > 0 ? "text-warn" : ""}`}
            >
              {formatEUR(balance.outstanding)}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5.5 max-w-[640px] mt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide">
            {t("clients.detail.contractsTitle")}
          </div>
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
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    if (e.key === " ") e.preventDefault();
                    onOpenContract(contract.id);
                  }
                }}
                className="group flex items-center justify-between py-2.5 px-2 -mx-2 rounded-control
                           border-t border-border first:border-t-0 cursor-pointer
                           transition-colors hover:bg-surface-alt
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{contract.title}</div>
                  <div className="text-xs text-ink-soft">
                    {formatDate(contract.startDate)} – {formatDate(contract.endDate)}
                  </div>
                </div>
                <Badge tone={meta.tone}>{t(meta.labelKey)}</Badge>
              </div>
            );
          })
        )}
      </Card>

      <Sheet
        open={deletePending}
        onOpenChange={setDeletePending}
        title={t("clients.actions.delete")}
      >
        <p className="text-[13px] text-ink-soft mb-4">
          {t("clients.actions.confirmDelete", { name: client.name })}
        </p>
        {deleteError && <ErrorText>{deleteError}</ErrorText>}
        <div className="flex gap-2.5 justify-end mt-4">
          <Button variant="secondary" onClick={() => setDeletePending(false)}>
            {t("clients.actions.cancel")}
          </Button>
          <Button variant="ghost-danger" onClick={confirmDelete}>
            {t("clients.actions.delete")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
