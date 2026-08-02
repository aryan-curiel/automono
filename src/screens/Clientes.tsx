import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MagnifyingGlass, UsersThree, DotsThreeVertical } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
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

  useEffect(() => {
    listClients()
      .then((rows) => setClients(rows))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const filtered = clients.filter((c) =>
    `${c.name} ${c.nifCif} ${c.email}`.toLowerCase().includes(query.toLowerCase()),
  );

  async function handleDelete(client: ClientRecord) {
    if (!window.confirm(t("clients.actions.confirmDelete", { name: client.name }))) return;
    try {
      await deleteClient(client.id);
      setClients((rows) => rows.filter((r) => r.id !== client.id));
    } catch {
      window.alert(t("clients.errors.deleteRestricted"));
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
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar"
                className="w-52 pl-8 pr-3 py-1.5 text-[13px] rounded-control bg-surface-alt border border-transparent
                           focus:border-accent focus:bg-surface focus:outline-none focus:shadow-[0_0_0_3px_var(--color-focus-ring)]
                           transition-[box-shadow,border-color,background-color] duration-150"
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
              className="grid grid-cols-[1.6fr_1fr_.9fr_1fr_1fr_32px] py-3 px-5.5 border-t border-border first:border-t-0"
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
        <div className="text-sm text-danger">{t("clients.errors.loadFailed")}</div>
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
          <div className="grid grid-cols-[1.6fr_1fr_.9fr_1fr_1fr_32px] py-3 px-5.5 bg-surface-alt font-semibold text-xs uppercase tracking-wide text-ink-soft">
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
              className="group grid grid-cols-[1.6fr_1fr_.9fr_1fr_1fr_32px] py-3 px-5.5
                         border-t border-border items-center cursor-pointer
                         transition-colors hover:bg-surface-alt"
            >
              <div>
                <div className="font-semibold text-sm">{c.name}</div>
                <div className="text-xs text-ink-soft">{c.email}</div>
              </div>
              <div className="text-[13px] font-mono font-medium">{c.nifCif}</div>
              <div>
                <span className="font-semibold text-xs font-mono bg-surface-alt px-2 py-1 rounded-control">
                  {c.seriesPrefix}
                </span>
              </div>
              <div className="font-medium text-[13px]">
                {t(`clients.vatTreatment.${c.vatTreatment}`)}
              </div>
              <div className="font-medium text-[13px]">
                {t(`clients.invoiceLanguage.${c.invoiceLanguage}`)}
              </div>
              <div
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <Menu>
                  <MenuTrigger className="p-1.5 rounded-control hover:bg-border cursor-pointer">
                    <DotsThreeVertical size={16} weight="bold" />
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem onSelect={() => onOpenClient(c.id)}>Ver detalle</MenuItem>
                    <MenuItem danger onSelect={() => handleDelete(c)}>
                      {t("clients.actions.delete")}
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
