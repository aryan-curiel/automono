import { useEffect, useRef, useState } from "react";

/** Tracks the pixel width of a wrapper element via `ResizeObserver` — the
 * hand-rolled charts' replacement for Recharts' `<ResponsiveContainer>`. The
 * `fallback` is only used for the first paint before the observer fires. */
export function useChartWidth(fallback = 320) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
}
