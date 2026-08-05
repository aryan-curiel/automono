import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FileArrowDown, XCircle } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { EXIT_SPRING } from "../lib/motion";

interface DragDropOverlayProps {
  visible: boolean;
  supported: boolean;
  context?: "expense" | "declaration";
}

export function DragDropOverlay({ visible, supported, context = "expense" }: DragDropOverlayProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const title = supported
    ? context === "declaration"
      ? t("dragDrop.declarationTitle")
      : t("dragDrop.title")
    : t("dragDrop.unsupportedTitle");
  const subtitle = supported
    ? context === "declaration"
      ? t("dragDrop.declarationSubtitle")
      : t("dragDrop.subtitle")
    : context === "declaration"
      ? t("dragDrop.declarationUnsupportedSubtitle")
      : t("dragDrop.unsupportedSubtitle");

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-scrim pointer-events-none"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{
              opacity: 0,
              scale: 0.95,
              transition: reduceMotion ? { duration: 0 } : EXIT_SPRING,
            }}
            transition={
              reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }
            }
            className={`flex flex-col items-center gap-3 px-10 py-8 rounded-sheet border-2 border-dashed
                        bg-sheet-glass backdrop-blur-xl backdrop-saturate-150 shadow-sheet
                        supports-[not(backdrop-filter)]:bg-surface
                        ${supported ? "border-accent" : "border-danger"}`}
          >
            {supported ? (
              <FileArrowDown size={36} weight="regular" className="text-accent" />
            ) : (
              <XCircle size={36} weight="regular" className="text-danger" />
            )}
            <div className="text-center">
              <div className="font-bold text-[15px]">{title}</div>
              <div className="text-[13px] text-ink-soft mt-1">{subtitle}</div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
