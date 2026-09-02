import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MagnifyingGlass, UsersThree, DotsThreeVertical } from "@phosphor-icons/react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ErrorText, TextInput } from "../components/ui/Field";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
import { Sheet } from "../components/ui/Sheet";
import { DataTable, type DataTableColumn } from "../components/ui/DataTable";
import { PageHeader } from "../components/PageHeader";
import { deleteClient, listClients } from "../db/clients";
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
  const [query, setQuery] = useState("");
  const [deletePending, setDeletePending] = useState<ClientRecord | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [reloadToken, setReloadToken] = useState(0);

  function retry() {
    setLoading(true);
    setLoadError(false);
    setReloadToken((n) => n + 1);
  }

  useEffect(() => {
    listClients()
      .then((rows) => setClients(rows))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [reloadToken]);

  const filtered = clients.filter((c) =>
    `${c.name} ${c.nifCif} ${c.email}`.toLowerCase().includes(query.toLowerCase()),
  );

  const columns: DataTableColumn<ClientRecord>[] = [
    {
      key: "client",
      header: t("clients.columns.client"),
      width: "1.6fr",
      render: (c) => (
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{c.name}</div>
          <div className="text-xs text-ink-soft truncate">{c.email}</div>
        </div>
      ),
    },
    {
      key: "nifCif",
      header: t("clients.columns.nifCif"),
      width: "1fr",
      render: (c) => <div className="text-[13px] font-mono font-medium">{c.nifCif}</div>,
    },
    {
      key: "prefix",
      header: t("clients.columns.prefix"),
      width: ".9fr",
      render: (c) => (
        <div>
          <Badge tone="neutral">
            <span className="font-mono">{c.seriesPrefix}</span>
          </Badge>
        </div>
      ),
    },
    {
      key: "vat",
      header: t("clients.columns.vat"),
      width: "1fr",
      render: (c) => (
        <div className="font-medium text-[13px]">{t(`clients.vatTreatment.${c.vatTreatment}`)}</div>
      ),
    },
    {
      key: "language",
      header: t("clients.columns.language"),
      width: "1fr",
      render: (c) => (
        <div className="font-medium text-[13px]">
          {t(`clients.invoiceLanguage.${c.invoiceLanguage}`)}
        </div>
      ),
    },
  ];

  async function confirmDelete() {
    const client = deletePending;
    if (!client) return;
    setDeleteError(null);
    try {
      await deleteClient(client.id);
      setClients((rows) => rows.filter((r) => r.id !== client.id));
      setDeletePending(null);
    } catch {
      setDeleteError(t("clients.errors.deleteRestricted"));
    }
  }

  return (
    <div className="px-8 pb-15">
      <PageHeader
        title={t("clients.title")}
        subtitle={t("clients.subtitleCount", { count: filtered.length })}
        actions={
          <>
            <div className="relative">
              <MagnifyingGlass
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft"
              />
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("clients.searchPlaceholder")}
                className="w-52 pl-8"
              />
            </div>
            <Button onClick={onNewClient}>+ {t("clients.newClient")}</Button>
          </>
        }
      />

      {loadError ? (
        <div className="flex flex-col items-start gap-2.5">
          <div className="text-sm text-danger">{t("clients.errors.loadFailed")}</div>
          <Button variant="secondary" onClick={retry}>
            {t("common.retry")}
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(c) => c.id}
          onRowActivate={(c) => onOpenClient(c.id)}
          loading={loading}
          empty={
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <UsersThree size={32} className="text-ink-soft/40" />
              <div className="flex flex-col items-center gap-1.5">
                <div className="text-sm font-medium text-ink">{t("clients.empty")}</div>
                <p className="max-w-xs text-sm text-ink-soft">{t("clients.emptyHint")}</p>
              </div>
              <Button variant="secondary" onClick={onNewClient}>
                + {t("clients.newClient")}
              </Button>
            </div>
          }
          rowMenu={(c) => (
            <Menu>
              <MenuTrigger className="p-1.5 rounded-control hover:bg-surface-alt cursor-pointer">
                <DotsThreeVertical size={16} weight="bold" />
              </MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={() => onOpenClient(c.id)}>{t("common.viewDetail")}</MenuItem>
                <MenuItem
                  danger
                  onSelect={() => {
                    setDeleteError(null);
                    setDeletePending(c);
                  }}
                >
                  {t("clients.actions.delete")}
                </MenuItem>
              </MenuContent>
            </Menu>
          )}
        />
      )}

      <Sheet
        open={deletePending !== null}
        onOpenChange={(open) => !open && setDeletePending(null)}
        title={t("clients.actions.delete")}
      >
        <p className="text-[13px] text-ink-soft mb-4">
          {t("clients.actions.confirmDelete", { name: deletePending?.name })}
        </p>
        {deleteError && <ErrorText>{deleteError}</ErrorText>}
        <div className="flex gap-2.5 justify-end mt-4">
          <Button variant="secondary" onClick={() => setDeletePending(null)}>
            {t("clients.actions.cancel")}
          </Button>
          <Button variant="ghost-danger" onClick={() => void confirmDelete()}>
            {t("clients.actions.delete")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
