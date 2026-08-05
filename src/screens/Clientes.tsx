import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MagnifyingGlass, UsersThree, DotsThreeVertical } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ErrorText, TextInput } from "../components/ui/Field";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
import { Sheet } from "../components/ui/Sheet";
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

      {loading ? (
        <Card className="overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[1.6fr_1fr_.9fr_1fr_1fr_32px] py-3 px-6 border-t border-border first:border-t-0"
            >
              <div className="h-4 w-32 rounded bg-surface-alt animate-pulse" />
              <div className="h-4 w-20 rounded bg-surface-alt animate-pulse" />
              <div className="h-4 w-12 rounded bg-surface-alt animate-pulse" />
              <div className="h-4 w-16 rounded bg-surface-alt animate-pulse" />
              <div className="h-4 w-10 rounded bg-surface-alt animate-pulse" />
            </div>
          ))}
        </Card>
      ) : loadError ? (
        <div className="flex flex-col items-start gap-2.5">
          <div className="text-sm text-danger">{t("clients.errors.loadFailed")}</div>
          <Button variant="secondary" onClick={retry}>
            {t("common.retry")}
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <UsersThree size={32} className="text-ink-soft/40" />
          <div className="text-sm text-ink-soft">{t("clients.empty")}</div>
          <Button variant="secondary" onClick={onNewClient}>
            + {t("clients.newClient")}
          </Button>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1.6fr_1fr_.9fr_1fr_1fr_32px] py-3 px-6 bg-surface-alt font-medium text-xs uppercase tracking-wide text-ink-soft">
            <div>{t("clients.columns.client")}</div>
            <div>{t("clients.columns.nifCif")}</div>
            <div>{t("clients.columns.prefix")}</div>
            <div>{t("clients.columns.vat")}</div>
            <div>{t("clients.columns.language")}</div>
            <div />
          </div>
          {filtered.map((c) => (
            <div
              key={c.id}
              onClick={() => onOpenClient(c.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  if (e.key === " ") e.preventDefault();
                  onOpenClient(c.id);
                }
              }}
              className="group grid grid-cols-[1.6fr_1fr_.9fr_1fr_1fr_32px] py-3 px-6
                         border-t border-border items-center cursor-pointer
                         transition-colors hover:bg-surface-alt
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{c.name}</div>
                <div className="text-xs text-ink-soft truncate">{c.email}</div>
              </div>
              <div className="text-[13px] font-mono font-medium">{c.nifCif}</div>
              <div>
                <Badge tone="neutral">
                  <span className="font-mono">{c.seriesPrefix}</span>
                </Badge>
              </div>
              <div className="font-medium text-[13px]">
                {t(`clients.vatTreatment.${c.vatTreatment}`)}
              </div>
              <div className="font-medium text-[13px]">
                {t(`clients.invoiceLanguage.${c.invoiceLanguage}`)}
              </div>
              <div
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
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
              </div>
            </div>
          ))}
        </Card>
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
          <Button variant="ghost-danger" onClick={confirmDelete}>
            {t("clients.actions.delete")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
