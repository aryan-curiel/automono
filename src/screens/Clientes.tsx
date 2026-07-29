import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/PageHeader";
import { listClients } from "../db/clients";
import type { ClientRecord } from "../db/clients";

interface ClientesProps {
  onOpenClient: (id: number) => void;
  onNewClient: () => void;
}

export function Clientes({ onOpenClient, onNewClient }: ClientesProps) {
  const { t } = useTranslation();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    listClients()
      .then((rows) => setClients(rows))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-10 pt-8 pb-15">
      <PageHeader
        title={t("clients.title")}
        subtitle={t("clients.subtitleCount", { count: clients.length })}
        actions={<Button onClick={onNewClient}>+ {t("clients.newClient")}</Button>}
      />

      {loading ? (
        <div className="text-sm text-ink-soft">{t("clients.loading")}</div>
      ) : loadError ? (
        <div className="text-sm text-danger">{t("clients.errors.loadFailed")}</div>
      ) : clients.length === 0 ? (
        <div className="text-sm text-ink-soft">{t("clients.empty")}</div>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1.6fr_1fr_.9fr_1fr_1fr] py-3 px-5.5 bg-surface-alt font-semibold text-xs uppercase tracking-wide text-ink-soft">
            <div>{t("clients.columns.client")}</div>
            <div>{t("clients.columns.nifCif")}</div>
            <div>{t("clients.columns.prefix")}</div>
            <div>{t("clients.columns.vat")}</div>
            <div>{t("clients.columns.language")}</div>
          </div>
          {clients.map((c) => (
            <div
              key={c.id}
              onClick={() => onOpenClient(c.id)}
              className="grid grid-cols-[1.6fr_1fr_.9fr_1fr_1fr] py-4 px-5.5 border-t border-border items-center cursor-pointer"
            >
              <div>
                <div className="font-semibold text-sm">{c.name}</div>
                <div className="text-xs text-ink-soft">{c.email}</div>
              </div>
              <div className="text-[13px] font-mono font-medium">{c.nifCif}</div>
              <div>
                <span className="font-semibold text-xs font-mono bg-surface-alt px-2 py-1 rounded-md">
                  {c.invoicePrefix}
                </span>
              </div>
              <div className="font-medium text-[13px]">
                {t(`clients.vatTreatment.${c.vatTreatment}`)}
              </div>
              <div className="font-medium text-[13px]">
                {t(`clients.invoiceLanguage.${c.invoiceLanguage}`)}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
