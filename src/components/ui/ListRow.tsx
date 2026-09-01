import type { HTMLAttributes } from "react";

const base =
  "cursor-pointer transition-colors hover:bg-surface-alt " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

interface ListRowProps extends HTMLAttributes<HTMLDivElement> {
  onActivate: () => void;
}

/** A clickable list row: div role="button" with Enter/Space keyboard activation.
 *  Callers pass layout classes (grid/flex, padding, borders, `group`) via className. */
export function ListRow({ onActivate, className = "", onKeyDown, ...props }: ListRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          if (e.key === " ") e.preventDefault();
          onActivate();
        }
        onKeyDown?.(e);
      }}
      className={`${base} ${className}`}
      {...props}
    />
  );
}
