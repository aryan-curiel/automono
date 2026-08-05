import { useState } from "react";
import { Select } from "./ui/Field";
import { SegmentedControl } from "./ui/SegmentedControl";
import { monthRange, quarterRange, yearRange, type Period } from "../lib/dateRange";

export type Kind = "month" | "quarter" | "year";
type Quarter = 1 | 2 | 3 | 4;

interface PeriodSelectorProps {
  onChange: (period: Period, kind: Kind) => void;
  defaultKind?: Kind;
}

const MONTH_NAMES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

const now = new Date();
const defaultYear = now.getFullYear();
const defaultMonth = now.getMonth() + 1;
const defaultQuarter = (Math.floor((defaultMonth - 1) / 3) + 1) as Quarter;

const monthOptions: { year: number; month: number }[] = [];
for (let i = 0; i < 24; i++) {
  const monthIndex = defaultYear * 12 + (defaultMonth - 1) - i;
  monthOptions.push({ year: Math.floor(monthIndex / 12), month: (monthIndex % 12) + 1 });
}

const quarterOptions: { year: number; quarter: Quarter }[] = [];
for (let y = defaultYear; y >= defaultYear - 2; y--) {
  for (let q = 4; q >= 1; q--) {
    quarterOptions.push({ year: y, quarter: q as Quarter });
  }
}

const yearOptions: number[] = [];
for (let y = defaultYear; y >= defaultYear - 4; y--) {
  yearOptions.push(y);
}

function computePeriod(kind: Kind, year: number, month: number, quarter: Quarter): Period {
  if (kind === "month") return monthRange(year, month);
  if (kind === "quarter") return quarterRange(year, quarter);
  return yearRange(year);
}

export function PeriodSelector({ onChange, defaultKind = "month" }: PeriodSelectorProps) {
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [quarter, setQuarter] = useState<Quarter>(defaultQuarter);

  return (
    <div className="flex items-center gap-2.5">
      <SegmentedControl
        value={kind}
        onChange={(next: Kind) => {
          setKind(next);
          onChange(computePeriod(next, year, month, quarter), next);
        }}
        options={[
          { value: "month", label: "Mes" },
          { value: "quarter", label: "Trimestre" },
          { value: "year", label: "Año" },
        ]}
      />

      <div className="w-36">
        {kind === "month" && (
          <Select
            value={`${year}-${month}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              setYear(y);
              setMonth(m);
              onChange(computePeriod(kind, y, m, quarter), kind);
            }}
          >
            {monthOptions.map(({ year: y, month: m }) => (
              <option key={`${y}-${m}`} value={`${y}-${m}`}>
                {MONTH_NAMES[m - 1]} {y}
              </option>
            ))}
          </Select>
        )}

        {kind === "quarter" && (
          <Select
            value={`${year}-${quarter}`}
            onChange={(e) => {
              const [y, q] = e.target.value.split("-").map(Number) as [number, Quarter];
              setYear(y);
              setQuarter(q);
              onChange(computePeriod(kind, y, month, q), kind);
            }}
          >
            {quarterOptions.map(({ year: y, quarter: q }) => (
              <option key={`${y}-${q}`} value={`${y}-${q}`}>
                Q{q} {y}
              </option>
            ))}
          </Select>
        )}

        {kind === "year" && (
          <Select
            value={year}
            onChange={(e) => {
              const y = Number(e.target.value);
              setYear(y);
              onChange(computePeriod(kind, y, month, quarter), kind);
            }}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        )}
      </div>
    </div>
  );
}
