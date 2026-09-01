import { useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { CheckCircle, Info, Warning, WarningCircle, X } from "@phosphor-icons/react";

export type ToastTone = "danger" | "warning" | "info" | "success";

const toneIcons: Record<ToastTone, typeof WarningCircle> = {
  danger: WarningCircle,
  warning: Warning,
  info: Info,
  success: CheckCircle,
};

const toneColors: Record<ToastTone, string> = {
  danger: "text-danger",
  warning: "text-warn",
  info: "text-info",
  success: "text-success",
};

interface ToastProps {
  message: string | null;
  tone?: ToastTone;
  onDismiss: () => void;
  /** Stacking position when more than one toast can be visible at once. */
  offset?: number;
}

export function Toast({ message, tone = "danger", onDismiss, offset = 0 }: ToastProps) {
  const reduceMotion = useReducedMotion();
  const Icon = toneIcons[tone];

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1, top: `${64 + offset * 56}px` }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={
            reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 30 }
          }
          className="fixed right-5 z-50 max-w-sm flex items-start gap-2.5 px-4 py-3
                     rounded-sheet bg-sheet-glass backdrop-blur-xl backdrop-saturate-150
                     border border-glass-border shadow-sheet text-[13px] font-medium text-ink
                     supports-[not(backdrop-filter)]:bg-surface"
        >
          <Icon size={18} weight="regular" className={`${toneColors[tone]} shrink-0 mt-0.5`} />
          <span className="flex-1">{message}</span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Cerrar"
            className="shrink-0 text-ink-soft hover:text-ink cursor-pointer rounded-control
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
