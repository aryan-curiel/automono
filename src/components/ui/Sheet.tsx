import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { EXIT_SPRING } from "../../lib/motion";

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  maxWidthClassName = "max-w-md",
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  maxWidthClassName?: string;
  /** When false, clicks outside the sheet don't close it (Esc still does). Use
   *  for sheets wrapping an editable form so a stray backdrop click can't
   *  silently discard edits. */
  dismissible?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.15 }}
                className="fixed inset-0 z-40 bg-overlay-scrim"
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              onInteractOutside={dismissible ? undefined : (e) => e.preventDefault()}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  scale: 0.95,
                  y: 8,
                  transition: reduceMotion ? { duration: 0 } : EXIT_SPRING,
                }}
                transition={
                  reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }
                }
                className={`fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                           w-full ${maxWidthClassName} max-h-[86vh] flex flex-col rounded-sheet bg-sheet-glass backdrop-blur-xl backdrop-saturate-150
                           border border-glass-border shadow-sheet p-6
                           supports-[not(backdrop-filter)]:bg-surface`}
              >
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <Dialog.Title className="font-bold text-[15px]">{title}</Dialog.Title>
                  <Dialog.Close className="text-ink-soft hover:text-ink cursor-pointer rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
                    <X size={16} />
                  </Dialog.Close>
                </div>
                <div className="overflow-y-auto min-h-0 -mx-1 px-1">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
