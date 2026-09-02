import { Fragment, type ReactNode } from "react";
import { Card } from "./Card";
import { ListRow } from "./ListRow";

export interface DataTableColumn<T> {
  /** Stable identity for the column (used as React key). */
  key: string;
  header: ReactNode;
  /** A single CSS grid track: `"1.3fr"`, `".9fr"`, `"32px"`. */
  width: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowActivate: (row: T) => void;
  loading?: boolean;
  /** Rendered as-is when not loading and there are no rows (keep the caller's
   *  centered icon / text / CTA here). */
  empty?: ReactNode;
  /** Per-row menu slot — rendered in a trailing 32px column with the shared
   *  hover/focus reveal and click-isolation so a row's menu never activates the
   *  row. */
  rowMenu?: (row: T) => ReactNode;
  skeletonRows?: number;
  /** Horizontal padding utility for header / rows (screens differ: `px-6` vs
   *  `px-5.5`). */
  padX?: string;
  className?: string;
}

const MENU_TRACK = "32px";

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowActivate,
  loading = false,
  empty = null,
  rowMenu,
  skeletonRows = 4,
  padX = "px-6",
  className = "overflow-hidden",
}: DataTableProps<T>) {
  const tracks = columns.map((c) => c.width);
  if (rowMenu) tracks.push(MENU_TRACK);
  const gridTemplateColumns = tracks.join(" ");
  const cellPad = `py-3 ${padX}`;

  if (loading) {
    return (
      <Card className={className}>
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <div
            key={i}
            className={`grid ${cellPad} border-t border-border first:border-t-0`}
            style={{ gridTemplateColumns }}
          >
            {columns.map((c) => (
              <div
                key={c.key}
                className={`h-4 rounded bg-surface-alt animate-pulse ${
                  c.align === "right" ? "w-12 ml-auto" : "w-24"
                }`}
              />
            ))}
          </div>
        ))}
      </Card>
    );
  }

  if (rows.length === 0) return <>{empty}</>;

  return (
    <Card className={className}>
      <div
        className={`grid ${cellPad} bg-surface-alt font-medium text-xs uppercase tracking-wide text-ink-soft`}
        style={{ gridTemplateColumns }}
      >
        {columns.map((c) => (
          <div key={c.key} className={c.align === "right" ? "text-right" : undefined}>
            {c.header}
          </div>
        ))}
        {rowMenu && <div />}
      </div>
      {rows.map((row) => (
        <ListRow
          key={rowKey(row)}
          onActivate={() => onRowActivate(row)}
          className={`group grid ${cellPad} border-t border-border items-center`}
          style={{ gridTemplateColumns }}
        >
          {columns.map((c) => (
            <Fragment key={c.key}>{c.render(row)}</Fragment>
          ))}
          {rowMenu && (
            <div
              className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              {rowMenu(row)}
            </div>
          )}
        </ListRow>
      ))}
    </Card>
  );
}
