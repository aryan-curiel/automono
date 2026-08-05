export interface Period {
  from: string;
  to: string;
  label: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function monthRange(year: number, month: number, locale = "es"): Period {
  const label = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );
  return {
    from: iso(year, month, 1),
    to: iso(year, month, lastDayOfMonth(year, month)),
    label: label.charAt(0).toUpperCase() + label.slice(1),
  };
}

export function quarterRange(year: number, quarter: 1 | 2 | 3 | 4): Period {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return {
    from: iso(year, startMonth, 1),
    to: iso(year, endMonth, lastDayOfMonth(year, endMonth)),
    label: `Q${quarter} ${year}`,
  };
}

export function yearRange(year: number): Period {
  return {
    from: iso(year, 1, 1),
    to: iso(year, 12, 31),
    label: String(year),
  };
}

/** The current calendar month, used as the default period for expense screens. */
export function defaultPeriod(): Period {
  const now = new Date();
  return monthRange(now.getFullYear(), now.getMonth() + 1);
}

/** The current quarter, used as the default period for quarterly tax summary screens. */
export function defaultQuarterPeriod(): Period {
  const now = new Date();
  const quarter = (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
  return quarterRange(now.getFullYear(), quarter);
}

/** The quarter key ("YYYY-QN") containing `dateIso`. */
export function quarterKeyOf(dateIso: string): string {
  const [year, month] = dateIso.split("-").map(Number);
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

/** The quarter key ("YYYY-QN") immediately after `key`. */
export function nextQuarterKey(key: string): string {
  const [yearStr, q] = key.split("-Q");
  const year = Number(yearStr);
  const quarter = Number(q);
  return quarter === 4 ? `${year + 1}-Q1` : `${year}-Q${quarter + 1}`;
}

/** Human-readable label for a quarter key, e.g. "2026-Q3" -> "Q3 2026". */
export function quarterKeyLabel(key: string): string {
  const [year, q] = key.split("-Q");
  return `Q${q} ${year}`;
}

/** Quarter keys ("YYYY-QN") overlapping [from, to], inclusive. */
export function quartersInRange(from: string, to: string): string[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const start = fy * 4 + Math.floor((fm - 1) / 3);
  const end = ty * 4 + Math.floor((tm - 1) / 3);
  const keys: string[] = [];
  for (let q = start; q <= end; q++) {
    keys.push(`${Math.floor(q / 4)}-Q${(q % 4) + 1}`);
  }
  return keys;
}

function shiftYear(dateIso: string, deltaYears: number): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const newYear = year + deltaYears;
  const clampedDay = Math.min(day, lastDayOfMonth(newYear, month));
  return iso(newYear, month, clampedDay);
}

/**
 * The same month/quarter/year one year earlier, for YoY comparisons. month/quarter/year
 * periods never cross a calendar-year boundary, so `from` and `to` share one year and the
 * label always contains it — a plain year substring swap is enough.
 */
export function priorYearPeriod(period: Period): Period {
  const [year] = period.from.split("-");
  const priorYear = String(Number(year) - 1);
  return {
    from: shiftYear(period.from, -1),
    to: shiftYear(period.to, -1),
    label: period.label.replace(year, priorYear),
  };
}
