import { useTranslation } from "react-i18next";
import type { Modelo347Summary } from "../lib/modelo347";
import { formatEUR } from "../lib/format";
import { Card } from "./ui/Card";

/** Read-only Modelo 347 (operaciones con terceros) annual summary: one row per client (sales)
 * or provider (purchases) whose IVA-included annual total tops €3.005,06, with a per-quarter
 * breakdown. Same "type this into AEAT" spirit as `Modelo349Panel`. */
export function Modelo347Panel({ summary }: { summary: Modelo347Summary }) {
  const { t } = useTranslation();

  if (summary.rows.length === 0) {
    return (
      <Card className="px-5 py-4">
        <p className="text-[13px] text-ink-soft">
          {t("declarations.modelo347.empty", { year: summary.year })}
        </p>
      </Card>
    );
  }

  return (
    <Card className="px-5 py-4">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-ink-soft text-left">
            <th className="py-1.5 font-medium">{t("declarations.modelo347.type")}</th>
            <th className="py-1.5 font-medium">{t("declarations.modelo347.name")}</th>
            <th className="py-1.5 font-medium">{t("declarations.modelo347.nif")}</th>
            <th className="py-1.5 font-medium text-right">T1</th>
            <th className="py-1.5 font-medium text-right">T2</th>
            <th className="py-1.5 font-medium text-right">T3</th>
            <th className="py-1.5 font-medium text-right">T4</th>
            <th className="py-1.5 font-medium text-right">{t("declarations.modelo347.total")}</th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((r) => (
            <tr key={r.key} className="border-t border-border">
              <td className="py-1.5">
                {r.side === "sales"
                  ? t("declarations.modelo347.typeSales")
                  : t("declarations.modelo347.typePurchases")}
              </td>
              <td className="py-1.5">{r.name}</td>
              <td className="py-1.5 font-mono">
                {r.nif ?? (
                  <span className="text-ink-soft">{t("declarations.modelo347.noNif")}</span>
                )}
              </td>
              {r.quarters.map((q, i) => (
                <td key={i} className="py-1.5 text-right font-mono">
                  {q === 0 ? <span className="text-ink-soft">—</span> : formatEUR(q)}
                </td>
              ))}
              <td className="py-1.5 text-right font-mono font-medium">{formatEUR(r.total)}</td>
            </tr>
          ))}
          <tr className="border-t border-border font-semibold">
            <td className="py-1.5" colSpan={7}>
              {t("declarations.modelo347.grandTotal")}
            </td>
            <td className="py-1.5 text-right font-mono">{formatEUR(summary.total)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-ink-soft mt-3">{t("declarations.modelo347.disclaimer")}</p>
    </Card>
  );
}
