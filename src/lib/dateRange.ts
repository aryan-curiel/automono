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
