import { useTranslation } from "react-i18next";
import { Info } from "@phosphor-icons/react";
import { Tooltip } from "./ui/Tooltip";
import type { DeclarationBasis } from "../lib/quarterlyDeclaration";

/** One-line "which tax basis produced these figures" caption. Accrual (devengo) is the Spanish
 * default for Modelo 303/130; cash (criterio de caja) is the opt-in from Ajustes (#31). Pass
 * `"accrual"` for a frozen snapshot whose `basis` field is missing (pre-#2). */
export function BasisNote({ basis }: { basis: DeclarationBasis }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-soft">
      <span>{t(`declarations.basis.${basis}.label`)}</span>
      <Tooltip label={t(`declarations.basis.${basis}.hint`)}>
        <button
          type="button"
          className="text-ink-soft/70 hover:text-ink-soft cursor-help outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-full"
          aria-label={t(`declarations.basis.${basis}.hint`)}
        >
          <Info size={13} />
        </button>
      </Tooltip>
    </div>
  );
}
