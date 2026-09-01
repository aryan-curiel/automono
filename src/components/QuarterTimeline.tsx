import { useId } from "react";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "motion/react";
import { CaretLeft, CaretRight, Lock } from "@phosphor-icons/react";
import {
  compareQuarterKeys,
  nextQuarterKey,
  previousQuarterKey,
  quarterKeyLabel,
} from "../lib/dateRange";
import type { DeclarationListItem } from "../db/declarations";

const HALF_WINDOW = 3;

/** A fixed window of quarter keys centered on `currentKey` — it never shifts with selection. */
function centeredWindow(currentKey: string): string[] {
  let start = currentKey;
  for (let i = 0; i < HALF_WINDOW; i++) start = previousQuarterKey(start);

  const keys: string[] = [];
  let key = start;
  for (let i = 0; i < HALF_WINDOW * 2 + 1; i++) {
    keys.push(key);
    key = nextQuarterKey(key);
  }
  return keys;
}

interface QuarterTimelineProps {
  focusedKey: string;
  currentKey: string;
  /** Quarter key containing the autónomo registration date, or null if not set — quarters
   * before it can't have a declaration and are disabled. */
  altaKey: string | null;
  declarations: DeclarationListItem[];
  onSelect: (key: string) => void;
}

export function QuarterTimeline({
  focusedKey,
  currentKey,
  altaKey,
  declarations,
  onSelect,
}: QuarterTimelineProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const layoutId = useId();
  const statusByKey = new Map(declarations.map((d) => [`${d.year}-Q${d.quarter}`, d.status]));
  const keys = centeredWindow(currentKey);

  function isDisabled(key: string): boolean {
    if (compareQuarterKeys(key, currentKey) > 0) return true;
    return altaKey !== null && compareQuarterKeys(key, altaKey) < 0;
  }

  function step(direction: 1 | -1) {
    const target = direction === 1 ? nextQuarterKey(focusedKey) : previousQuarterKey(focusedKey);
    if (!keys.includes(target) || isDisabled(target)) return;
    onSelect(target);
  }

  const prevTarget = previousQuarterKey(focusedKey);
  const nextTarget = nextQuarterKey(focusedKey);

  return (
    <div className="flex items-center gap-1.5 mb-6">
      <button
        type="button"
        aria-label={t("quarterTimeline.previousQuarter")}
        onClick={() => step(-1)}
        disabled={!keys.includes(prevTarget) || isDisabled(prevTarget)}
        className="p-2 rounded-control text-ink-soft hover:text-ink hover:bg-surface-alt cursor-pointer
                   disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-ink-soft
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <CaretLeft size={14} weight="bold" />
      </button>

      <div className="flex-1 flex items-center gap-1 p-1 rounded-control bg-surface-alt border border-border">
        {keys.map((key) => {
          const active = key === focusedKey;
          const isCurrent = key === currentKey;
          const disabled = isDisabled(key);
          const status = statusByKey.get(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              disabled={disabled}
              className={`relative flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-control cursor-pointer
                transition-colors ease-[var(--ease-out)]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring
                disabled:cursor-default disabled:opacity-40 disabled:hover:text-ink-soft
                ${active ? "text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              {active && (
                <motion.div
                  layoutId={`quarter-timeline-selection-${layoutId}`}
                  className="absolute inset-0 rounded-control bg-surface shadow-sm"
                  transition={
                    reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }
                  }
                />
              )}
              {disabled ? (
                <Lock size={10} weight="bold" className="relative z-10 shrink-0" />
              ) : (
                <span
                  className={`relative z-10 w-1.5 h-1.5 rounded-full shrink-0 ${
                    status === "completed"
                      ? "bg-success"
                      : status === "in_progress"
                        ? "bg-info"
                        : "bg-ink-soft/40"
                  } ${isCurrent ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : ""}`}
                />
              )}
              <span className="relative z-10">{quarterKeyLabel(key)}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-label={t("quarterTimeline.nextQuarter")}
        onClick={() => step(1)}
        disabled={!keys.includes(nextTarget) || isDisabled(nextTarget)}
        className="p-2 rounded-control text-ink-soft hover:text-ink hover:bg-surface-alt cursor-pointer
                   disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-ink-soft
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <CaretRight size={14} weight="bold" />
      </button>
    </div>
  );
}
