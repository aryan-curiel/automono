import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Check } from "@phosphor-icons/react";
import { expectedCasillas, type Modelo, type Modelo130Ytd } from "../lib/modeloReport";
import type { DeclarationSnapshot } from "../lib/quarterlyDeclaration";
import { formatEUR } from "../lib/format";
import { Card } from "./ui/Card";

/** Read-only "type these into AEAT" helper: AutoMono's own computed value for each casilla it can
 * derive, per modelo. Never authoritative — the disclaimer says to check against your own
 * records. Reuses `expectedCasillas`, the same function the upload-review flow compares against
 * (#38). */
export function CasillaPrefill({
  modelo,
  snapshot,
  ytd130,
}: {
  modelo: Modelo;
  snapshot: DeclarationSnapshot;
  ytd130?: Modelo130Ytd;
}) {
  const { t } = useTranslation();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const rows = expectedCasillas(modelo, snapshot, ytd130);

  async function copy(key: string, value: number) {
    await navigator.clipboard.writeText(value.toFixed(2));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  }

  return (
    <Card className="px-5 py-4">
      <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-2">
        {t("declarations.prefill.title", { modelo })}
      </div>
      <table className="w-full text-[13px]">
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-border first:border-t-0">
              <td className="py-1.5">
                {r.label}
                {r.informational && (
                  <span className="text-ink-soft"> · {t("declarations.prefill.informational")}</span>
                )}
              </td>
              <td className="py-1.5 text-right font-mono">{formatEUR(r.expected)}</td>
              <td className="py-1.5 pl-2 text-right w-6">
                <button
                  type="button"
                  onClick={() => void copy(r.key, r.expected)}
                  className="text-ink-soft hover:text-ink cursor-pointer transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
                  aria-label={t("declarations.prefill.copy")}
                >
                  {copiedKey === r.key ? (
                    <Check size={13} className="text-success" />
                  ) : (
                    <Copy size={13} />
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-ink-soft mt-3">{t("declarations.prefill.disclaimer")}</p>
    </Card>
  );
}
