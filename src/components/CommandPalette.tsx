import { useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "motion/react";
import { MagnifyingGlass, Receipt, UsersThree, FileText } from "@phosphor-icons/react";
import { searchEntities, type SearchResult, type SearchResultType } from "../lib/search";
import type { ClientRecord } from "../db/clients";
import type { InvoiceListItem } from "../db/invoices";
import type { ContractRecord } from "../db/contracts";

const TYPE_ICON: Record<SearchResultType, typeof UsersThree> = {
  client: UsersThree,
  invoice: Receipt,
  contract: FileText,
};

const TYPE_LABEL: Record<SearchResultType, string> = {
  client: "Cliente",
  invoice: "Factura",
  contract: "Contrato",
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ClientRecord[];
  invoices: InvoiceListItem[];
  contracts: ContractRecord[];
  onSelect: (result: SearchResult) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  clients,
  invoices,
  contracts,
  onSelect,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => searchEntities(query, clients, invoices, contracts),
    [query, clients, invoices, contracts],
  );

  function handleQueryChange(value: string) {
    setQuery(value);
    setActiveIndex(0);
  }

  function choose(result: SearchResult) {
    onSelect(result);
    onOpenChange(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const result = results[activeIndex];
      if (result) choose(result);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-overlay-scrim"
          />
        </Dialog.Overlay>
        <Dialog.Content
          asChild
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            setQuery("");
            setActiveIndex(0);
            inputRef.current?.focus();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={
              reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }
            }
            className="fixed z-50 top-[18%] left-1/2 -translate-x-1/2 w-full max-w-lg rounded-sheet
                       bg-sheet-glass backdrop-blur-xl backdrop-saturate-150 border border-glass-border
                       shadow-sheet overflow-hidden supports-[not(backdrop-filter)]:bg-surface"
          >
            <Dialog.Title className="sr-only">Buscar</Dialog.Title>
            <Dialog.Description className="sr-only">
              Busca clientes, facturas y contratos por nombre o número
            </Dialog.Description>
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
              <MagnifyingGlass size={16} className="text-ink-soft shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Buscar clientes, facturas, contratos…"
                className="flex-1 bg-transparent border-none outline-none text-[14px] placeholder:text-ink-soft"
              />
            </div>
            <div className="max-h-[320px] overflow-y-auto p-1.5">
              {query.trim() && results.length === 0 && (
                <div className="px-3 py-6 text-center text-[13px] text-ink-soft">Sin resultados</div>
              )}
              {results.map((result, i) => {
                const Icon = TYPE_ICON[result.type];
                return (
                  <div
                    key={`${result.type}-${result.id}`}
                    onClick={() => choose(result)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-control cursor-pointer text-[13.5px]
                                ${i === activeIndex ? "bg-surface-alt" : ""}`}
                  >
                    <Icon size={15} className="text-ink-soft shrink-0" />
                    <span className="font-medium truncate">{result.label}</span>
                    {result.subtitle && (
                      <span className="text-ink-soft truncate">· {result.subtitle}</span>
                    )}
                    <span className="ml-auto text-[11px] text-ink-soft shrink-0">
                      {TYPE_LABEL[result.type]}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
