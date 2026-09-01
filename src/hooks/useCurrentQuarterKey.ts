import { useEffect, useState } from "react";
import { defaultQuarterPeriod, quarterKeyOf } from "../lib/dateRange";

const RECHECK_MS = 60 * 60 * 1000; // hourly is plenty for a quarter/day boundary

function currentKey(): string {
  return quarterKeyOf(defaultQuarterPeriod().from);
}

/** The quarter key ("YYYY-QN") for today, re-checked hourly so a window left open
 * across a quarter (or day, near year-end) boundary doesn't keep showing a stale
 * "current" until the app is relaunched. */
export function useCurrentQuarterKey(): string {
  const [key, setKey] = useState(currentKey);
  useEffect(() => {
    // React bails on a same-value string update, so no manual diffing needed.
    const id = setInterval(() => setKey(currentKey()), RECHECK_MS);
    return () => clearInterval(id);
  }, []);
  return key;
}
