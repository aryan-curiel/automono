function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: (string | number)[]): string {
  return values.map(csvEscape).join(",");
}
