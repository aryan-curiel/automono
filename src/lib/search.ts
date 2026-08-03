import type { ClientRecord } from "../db/clients";
import type { InvoiceListItem } from "../db/invoices";
import type { ContractRecord } from "../db/contracts";
import { invoiceNumberLabel } from "./invoice";

export type SearchResultType = "client" | "invoice" | "contract";

export interface SearchResult {
  type: SearchResultType;
  id: number;
  label: string;
  subtitle: string | undefined;
}

const MAX_RESULTS = 20;

function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  return fields.some((f) => f?.toLowerCase().includes(query));
}

/** Cross-entity quick-jump search (Cmd+K): clients by name/NIF, invoices by number/client, contracts by title/client. */
export function searchEntities(
  query: string,
  clients: ClientRecord[],
  invoices: InvoiceListItem[],
  contracts: ContractRecord[],
): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const clientNameById = new Map(clients.map((c) => [c.id, c.name]));

  const results: SearchResult[] = [];

  for (const c of clients) {
    if (matches(q, c.name, c.nifCif)) {
      results.push({ type: "client", id: c.id, label: c.name, subtitle: c.nifCif });
    }
  }

  for (const inv of invoices) {
    const label = invoiceNumberLabel(inv);
    if (matches(q, label, inv.clientName)) {
      results.push({ type: "invoice", id: inv.id, label, subtitle: inv.clientName });
    }
  }

  for (const contract of contracts) {
    const clientName = clientNameById.get(contract.clientId);
    if (matches(q, contract.title, clientName)) {
      results.push({
        type: "contract",
        id: contract.id,
        label: contract.title,
        subtitle: clientName,
      });
    }
  }

  return results.slice(0, MAX_RESULTS);
}
