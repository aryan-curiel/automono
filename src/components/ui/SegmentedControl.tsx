import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const layoutId = useId();

  return (
    <div className="inline-flex p-0.5 rounded-control bg-surface-alt border border-border">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            className={`relative px-3 py-1 text-xs font-medium rounded-control cursor-pointer
              transition-colors ease-[var(--ease-out)]
              disabled:opacity-50 disabled:cursor-default
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring
              ${active ? "text-ink" : "text-ink-soft hover:text-ink"}`}
          >
            {active && (
              <motion.div
                layoutId={`segmented-selection-${layoutId}`}
                className="absolute inset-0 rounded-control bg-surface"
                transition={
                  reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }
                }
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
