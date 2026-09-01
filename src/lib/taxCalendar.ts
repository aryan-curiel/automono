export interface TaxDeadline {
  model: string;
  label: string;
  dueDate: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Bumps a due date off a Saturday/Sunday onto the following Monday — AEAT deadlines that land on a
 * weekend roll to the next business day.
 * ponytail: weekend-only. National/regional holidays (which also roll the deadline) need an AEAT
 * calendar we don't ship yet — add that lookup here when filing reminders land (issue #30). */
function rollOffWeekend(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2);
  else if (dow === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Quarterly Modelo 130 (IRPF)/303 (IVA) deadline: the 20th of the month after the quarter ends,
 * except Q4 which is the 30th of January (aligned with the annual summary). */
function quarterlyDeadline(year: number, quarter: 1 | 2 | 3 | 4): TaxDeadline {
  const dueDay = quarter === 4 ? 30 : 20;
  const dueMonth = quarter * 3 + 1;
  const dueDate = dueMonth > 12 ? iso(year + 1, dueMonth - 12, dueDay) : iso(year, dueMonth, dueDay);
  return { model: "130/303", label: `Modelo 130/303 (${quarter}T)`, dueDate: rollOffWeekend(dueDate) };
}

/** Recovers the "YYYY-QN" quarter a 130/303 deadline reports on, from its due date (the month after
 * that quarter ends — Apr/Jul/Oct, or Jan for Q4, possibly a few days later after a weekend roll). */
export function deadlineQuarterKey(dueDate: string): string {
  const [yearStr, monthStr] = dueDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (month <= 3) return `${year - 1}-Q4`;
  return `${year}-Q${Math.floor((month - 4) / 3) + 1}`;
}

/** Annual Modelo 190/390 summary deadline: Jan 30 of the year after the reported year. */
function annualDeadline(reportedYear: number): TaxDeadline {
  return {
    model: "190/390",
    label: "Modelo 190/390 (anual)",
    dueDate: rollOffWeekend(iso(reportedYear + 1, 1, 30)),
  };
}

/** Collapses deadlines that fall on the same day (the Q4 130/303 and the annual 190/390 both land
 * on ~30 Jan) into a single row so the caller never shows two entries for one date. */
function mergeSameDay(deadlines: TaxDeadline[]): TaxDeadline[] {
  const byDate = new Map<string, TaxDeadline>();
  for (const d of deadlines) {
    const existing = byDate.get(d.dueDate);
    if (existing) {
      existing.model = `${existing.model} + ${d.model}`;
      existing.label = `${existing.label} + ${d.label}`;
    } else {
      byDate.set(d.dueDate, { ...d });
    }
  }
  return [...byDate.values()];
}

/** The next `count` upcoming Spanish autónomo tax filing deadlines on or after `todayIso`. */
export function nextTaxDeadlines(todayIso: string, count: number): TaxDeadline[] {
  const [todayYear] = todayIso.split("-").map(Number);
  const candidates: TaxDeadline[] = [];
  for (const year of [todayYear - 1, todayYear, todayYear + 1]) {
    for (const quarter of [1, 2, 3, 4] as const) {
      candidates.push(quarterlyDeadline(year, quarter));
    }
    candidates.push(annualDeadline(year));
  }
  return mergeSameDay(candidates.sort((a, b) => a.dueDate.localeCompare(b.dueDate)))
    .filter((d) => d.dueDate >= todayIso)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, count);
}
