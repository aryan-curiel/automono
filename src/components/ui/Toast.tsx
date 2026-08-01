import { useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { WarningCircle } from "@phosphor-icons/react";

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: ToastProps) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.96 }}
        transition={
          reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 30 }
        }
        className="fixed top-16 right-5 z-50 max-w-sm flex items-start gap-2.5 px-4 py-3
                   rounded-sheet bg-sheet-glass backdrop-blur-xl backdrop-saturate-150
                   border border-glass-border shadow-sheet text-[13px] font-medium text-ink
                   supports-[not(backdrop-filter)]:bg-surface"
      >
        <WarningCircle size={18} weight="fill" className="text-danger shrink-0 mt-0.5" />
        {message}
      </motion.div>
    </AnimatePresence>
  );
}
