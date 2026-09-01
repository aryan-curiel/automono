import { useTranslation } from "react-i18next";
import type { Modelo349Summary } from "../lib/modelo349";
import { countryName } from "../lib/countries";
import { formatEUR } from "../lib/format";
import { Card } from "./ui/Card";

/** Read-only Modelo 349 (operaciones intracomunitarias) quarter summary: one row per
 * reverse-charge-EU client with their NIF-IVA and total taxable base. Same "type this into AEAT"
 * spirit as `CasillaPrefill`. Renders nothing when the quarter has no intracom operations. */
export function Modelo349Panel({ summary }: { summary: Modelo349Summary }) {
  const { t, i18n } = useTranslation();
  if (summary.rows.length === 0) return null;

  return (
    <Card className="px-5 py-4 mt-4">
      <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-2">
        {t("declarations.modelo349.title")}
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-ink-soft text-left">
            <th className="py-1.5 font-medium">{t("declarations.modelo349.client")}</th>
            <th className="py-1.5 font-medium">{t("declarations.modelo349.vatNumber")}</th>
            <th className="py-1.5 font-medium">{t("declarations.modelo349.country")}</th>
            <th className="py-1.5 font-medium">{t("declarations.modelo349.clave")}</th>
            <th className="py-1.5 font-medium text-right">{t("declarations.modelo349.base")}</th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((r) => (
            <tr key={r.clientId} className="border-t border-border">
              <td className="py-1.5">{r.clientName}</td>
              <td className="py-1.5 font-mono">
                {r.vatNumber ?? (
                  <span className="text-ink-soft">{t("declarations.modelo349.noVatNumber")}</span>
                )}
              </td>
              <td className="py-1.5">{r.country ? countryName(r.country, i18n.language) : "—"}</td>
              <td className="py-1.5">{t("declarations.modelo349.claveS")}</td>
              <td className="py-1.5 text-right font-mono">{formatEUR(r.base)}</td>
            </tr>
          ))}
          <tr className="border-t border-border font-semibold">
            <td className="py-1.5" colSpan={4}>
              {t("declarations.modelo349.total")}
            </td>
            <td className="py-1.5 text-right font-mono">{formatEUR(summary.total)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-ink-soft mt-3">{t("declarations.modelo349.disclaimer")}</p>
    </Card>
  );
}
