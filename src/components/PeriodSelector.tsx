import { useState } from "react";
import { Select, TextInput } from "./ui/Field";
import { SegmentedControl } from "./ui/SegmentedControl";
import { monthRange, quarterRange, yearRange, type Period } from "../lib/dateRange";

type Kind = "month" | "quarter" | "year";
type Quarter = 1 | 2 | 3 | 4;

interface PeriodSelectorProps {
  onChange: (period: Period) => void;
  defaultKind?: Kind;
}

const now = new Date();
const defaultYear = now.getFullYear();
const defaultMonth = now.getMonth() + 1;
const defaultQuarter = (Math.floor((defaultMonth - 1) / 3) + 1) as Quarter;

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
          onChange(computePeriod(next, year, month, quarter));
        }}
        options={[
          { value: "month", label: "Mes" },
          { value: "quarter", label: "Trimestre" },
          { value: "year", label: "Año" },
        ]}
      />

      {kind === "month" && (
        <TextInput
          type="month"
          value={`${year}-${String(month).padStart(2, "0")}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split("-").map(Number);
            if (!y || !m) return;
            setYear(y);
            setMonth(m);
            onChange(computePeriod(kind, y, m, quarter));
          }}
        />
      )}

      {kind === "quarter" && (
        <>
          <Select
            value={quarter}
            onChange={(e) => {
              const q = Number(e.target.value) as Quarter;
              setQuarter(q);
              onChange(computePeriod(kind, year, month, q));
            }}
          >
            <option value={1}>Q1</option>
            <option value={2}>Q2</option>
            <option value={3}>Q3</option>
            <option value={4}>Q4</option>
          </Select>
          <TextInput
            type="number"
            value={year}
            onChange={(e) => {
              const y = Number(e.target.value);
              setYear(y);
              onChange(computePeriod(kind, y, month, quarter));
            }}
          />
        </>
      )}

      {kind === "year" && (
        <TextInput
          type="number"
          value={year}
          onChange={(e) => {
            const y = Number(e.target.value);
            setYear(y);
            onChange(computePeriod(kind, y, month, quarter));
          }}
        />
      )}
    </div>
  );
}
