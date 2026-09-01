import { useState } from "react";

export interface DraftLine {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

export function mkLine(description: string, quantity: number, unitPrice: number): DraftLine {
  return {
    key: `${Date.now()}-${Math.random()}`,
    description,
    quantity: String(quantity),
    unitPrice: String(unitPrice),
  };
}

export function withUpdatedLine(
  lines: DraftLine[],
  idx: number,
  field: "description" | "quantity" | "unitPrice",
  value: string,
): DraftLine[] {
  return lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l));
}

export function withRemovedLine(lines: DraftLine[], idx: number): DraftLine[] {
  const next = lines.filter((_, i) => i !== idx);
  return next.length ? next : [mkLine("", 1, 0)];
}

export function useInvoiceLines(initial: DraftLine[] = [mkLine("", 1, 0)]) {
  const [lines, setLines] = useState<DraftLine[]>(initial);

  function updateLine(idx: number, field: "description" | "quantity" | "unitPrice", value: string) {
    setLines((ls) => withUpdatedLine(ls, idx, field, value));
  }

  function removeLine(idx: number) {
    setLines((ls) => withRemovedLine(ls, idx));
  }

  function addLine() {
    setLines((ls) => [...ls, mkLine("", 1, 0)]);
  }

  return { lines, setLines, updateLine, removeLine, addLine };
}
