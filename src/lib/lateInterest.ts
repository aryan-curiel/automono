function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** Days past `dueDateIso` as of `todayIso`, floored at 0 (not yet due isn't "negative overdue"). */
export function daysOverdue(dueDateIso: string, todayIso: string): number {
  return Math.max(0, daysBetween(dueDateIso, todayIso));
}

/**
 * Simple daily interest on `principal` at `annualRatePct` for `days` — a stand-in for Spain's
 * Ley 3/2004 statutory late-payment rate (ECB reference + 8 points), which BOE republishes
 * twice a year. That current rate isn't hardcoded here since it changes outside the app's
 * control; the caller supplies it (e.g. a form field defaulting to a value the user updates
 * from BOE), this just does the day-count math.
 */
export function lateInterestOwed(principal: number, annualRatePct: number, days: number): number {
  if (days <= 0) return 0;
  return principal * (annualRatePct / 100) * (days / 365);
}
