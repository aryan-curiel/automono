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
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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

  async function confirmDelete() {
    if (!contract) return;
    setDeleteError(null);
    try {
      await deleteContract(contract.id);
      onDeleted();
    } catch {
      setDeleteError(t("contracts.errors.deleteFailed"));
    }
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
      <div className="px-8 pb-15">
        <BackLink label={t("contracts.title")} onClick={onBack} />
        <div className="text-sm text-ink-soft">{t("contracts.loading")}</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-8 pb-15">
        <BackLink label={t("contracts.title")} onClick={onBack} />
        <div className="text-sm text-danger">{t("contracts.errors.loadFailed")}</div>
      </div>
    );
  }

  if (!contract) return null;

  const meta = contractStatusMeta(contract.status);

  return (
    <div className="px-8 pb-15">
      <BackLink label={clientName} onClick={onBack} />

      <PageHeader
        title={contract.title}
        subtitle={clientName}
        actions={
          <>
            <Button variant="secondary" onClick={() => onEditContract(contract.id)}>
              {t("contracts.actions.edit")}
            </Button>
            <Menu>
              <MenuTrigger className="p-2 rounded-control hover:bg-surface-alt cursor-pointer">
                <DotsThreeVertical size={16} weight="bold" />
              </MenuTrigger>
              <MenuContent>
                <MenuItem danger onSelect={() => setDeletePending(true)}>
                  {t("contracts.actions.delete")}
                </MenuItem>
              </MenuContent>
            </Menu>
          </>
        }
      />

      <Card className="px-5 py-1 max-w-[640px]">
        <div className="flex items-center justify-between pt-4 pb-2">
          <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide">
            {t("contracts.detail.dataTitle")}
          </div>
          <Badge tone={meta.tone}>{t(meta.labelKey)}</Badge>
        </div>
        <InfoRow label={t("contracts.fields.startDate")} value={formatDate(contract.startDate)} />
        <InfoRow label={t("contracts.fields.endDate")} value={formatDate(contract.endDate)} />
        {contract.billingCadence !== "none" && (
          <>
            <InfoRow
              label={t("contracts.fields.billingCadence")}
              value={t(`contracts.cadence.${contract.billingCadence}`)}
            />
            <InfoRow
              label={t("contracts.fields.nextInvoiceDate")}
              value={formatDate(contract.nextInvoiceDate)}
            />
          </>
        )}
        <InfoRow
          label={t("contracts.fields.notes")}
          value={<span className="whitespace-pre-wrap">{contract.notes || "—"}</span>}
        />
        <InfoRow
          label={t("contracts.fields.file")}
          value={
            <div className="flex items-center gap-2.5">
              <Button
                variant="secondary"
                onClick={() => void handleOpenFile()}
                disabled={!contract.filePath}
              >
                {t("contracts.actions.openFile")}
              </Button>
              {!contract.filePath && (
                <span className="text-xs text-ink-soft">{t("contracts.fields.noFile")}</span>
              )}
            </div>
          }
        />
      </Card>
      {openError && <ErrorText>{openError}</ErrorText>}

      <Sheet
        open={deletePending}
        onOpenChange={setDeletePending}
        title={t("contracts.actions.delete")}
      >
        <p className="text-[13px] text-ink-soft mb-4">
          {t("contracts.actions.confirmDelete", { title: contract.title })}
        </p>
        {deleteError && <ErrorText>{deleteError}</ErrorText>}
        <div className="flex gap-2.5 justify-end mt-4">
          <Button variant="secondary" onClick={() => setDeletePending(false)}>
            {t("contracts.actions.cancel")}
          </Button>
          <Button variant="ghost-danger" onClick={() => void confirmDelete()}>
            {t("contracts.actions.delete")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
