function csvEscape(value: string | number): string {
  let s = String(value);
  // Neutralise spreadsheet formula injection: a text field starting with one of
  // these is executed as a formula by Excel/Sheets. Numbers can't carry a
  // payload, so a bare negative amount stays untouched.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: (string | number)[]): string {
  return values.map(csvEscape).join(",");
}
