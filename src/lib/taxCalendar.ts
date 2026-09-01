export interface TaxDeadline {
  model: "130/303" | "190/390";
  label: string;
  dueDate: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Quarterly Modelo 130 (IRPF)/303 (IVA) deadline: the 20th of the month after the quarter ends,
 * except Q4 which is the 30th of January (aligned with the annual summary). */
function quarterlyDeadline(year: number, quarter: 1 | 2 | 3 | 4): TaxDeadline {
  const dueDay = quarter === 4 ? 30 : 20;
  const dueMonth = quarter * 3 + 1;
  const dueDate = dueMonth > 12 ? iso(year + 1, dueMonth - 12, dueDay) : iso(year, dueMonth, dueDay);
  return { model: "130/303", label: `Modelo 130/303 (${quarter}T)`, dueDate };
}

/** Recovers the "YYYY-QN" quarter a 130/303 deadline reports on, from its due date (the 20th
 * of the month after that quarter ends — the inverse of `quarterlyDeadline` above). */
export function deadlineQuarterKey(dueDate: string): string {
  const [yearStr, monthStr] = dueDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (month === 1) return `${year - 1}-Q4`;
  const quarter = (month - 4) / 3 + 1;
  return `${year}-Q${quarter}`;
}

/** Annual Modelo 190/390 summary deadline: Jan 30 of the year after the reported year. */
function annualDeadline(reportedYear: number): TaxDeadline {
  return {
    model: "190/390",
    label: "Modelo 190/390 (anual)",
    dueDate: iso(reportedYear + 1, 1, 30),
  };
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
  return candidates
    .filter((d) => d.dueDate >= todayIso)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, count);
}
