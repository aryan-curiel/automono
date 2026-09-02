import { invoiceNumberLabel } from "./invoice";

// Bank reconciliation (#36): pure logic for turning a bank-statement CSV into normalised
// statement lines and matching credit lines to issued invoices. No IO here — the DB module
// and screen own reading the file and recording payments.
//
// ponytail: assumes a single signed `amount` column (credit positive). Spanish exports that
// split into separate cargo/abono columns would need a debit/credit merge step in
// `toStatementLines` — add it when a real export needs it.

export interface StatementLine {
  /** ISO `YYYY-MM-DD`. */
  valueDate: string;
  /** Signed; a credit (money in) is positive. */
  amount: number;
  description: string;
  reference: string;
}

export type StatementField = "date" | "amount" | "description" | "reference";

/** Column index per field, or -1 when unmapped. `reference` is the only optional field. */
export type ColumnMapping = Record<StatementField, number>;

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

const DELIMITERS = [";", ",", "\t"];

/** Splits one CSV line, honouring `"`-quoted fields (doubled `""` = literal quote). */
function splitRow(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      out.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

export function parseStatementCsv(text: string): ParsedCsv {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [], delimiter: "," };

  // Pick the delimiter that yields the most columns on the header line.
  let delimiter = ",";
  let best = -1;
  for (const d of DELIMITERS) {
    const count = splitRow(lines[0], d).length;
    if (count > best) {
      best = count;
      delimiter = d;
    }
  }

  const headers = splitRow(lines[0], delimiter);
  const rows = lines.slice(1).map((l) => splitRow(l, delimiter));
  return { headers, rows, delimiter };
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Ordered by preference — first header that contains any alias wins the field.
const FIELD_ALIASES: Record<StatementField, string[]> = {
  date: ["fecha valor", "fecha de valor", "f. valor", "fecha operacion", "fecha", "date"],
  amount: ["importe", "amount", "cantidad", "monto", "movimiento"],
  description: ["concepto", "descripcion", "description", "detalle", "observaciones", "concept"],
  reference: ["referencia", "reference", "num. documento", "n. documento", "documento", "ref"],
};

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const norm = headers.map(normalise);
  const mapping: ColumnMapping = { date: -1, amount: -1, description: -1, reference: -1 };
  const taken = new Set<number>();

  for (const field of Object.keys(FIELD_ALIASES) as StatementField[]) {
    for (const alias of FIELD_ALIASES[field]) {
      const idx = norm.findIndex((h, i) => !taken.has(i) && h.includes(alias));
      if (idx !== -1) {
        mapping[field] = idx;
        taken.add(idx);
        break;
      }
    }
  }
  return mapping;
}

/** `1.234,56` / `1,234.56` / `1234.5` / `-45,00` → number. Rightmost separator is the decimal. */
export function parseAmount(raw: string): number {
  let s = raw.replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (!s || s === "-") return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let decimalSep = "";
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSep = lastComma > lastDot ? "," : ".";
  } else if (lastComma >= 0) {
    decimalSep = /,\d{1,2}$/.test(s) ? "," : "";
  } else if (lastDot >= 0) {
    decimalSep = /\.\d{1,2}$/.test(s) && (s.match(/\./g) ?? []).length === 1 ? "." : "";
  }
  if (decimalSep === ",") s = s.replace(/\./g, "").replace(",", ".");
  else if (decimalSep === ".") s = s.replace(/,/g, "");
  else s = s.replace(/[.,]/g, "");
  return parseFloat(s);
}

/** `dd/mm/yyyy`, `dd-mm-yyyy`, `dd.mm.yyyy`, `yyyy-mm-dd` (2-digit years → 20xx) → ISO, or "". */
export function parseStatementDate(raw: string): string {
  const s = raw.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}

export function toStatementLines(rows: string[][], mapping: ColumnMapping): StatementLine[] {
  const lines: StatementLine[] = [];
  for (const row of rows) {
    const valueDate = parseStatementDate(row[mapping.date] ?? "");
    const amount = parseAmount(row[mapping.amount] ?? "");
    if (!valueDate || !Number.isFinite(amount)) continue;
    lines.push({
      valueDate,
      amount,
      description: (mapping.description >= 0 ? row[mapping.description] : "")?.trim() ?? "",
      reference: (mapping.reference >= 0 ? row[mapping.reference] : "")?.trim() ?? "",
    });
  }
  return lines;
}

/** Stable, deterministic hash of a line's identifying fields — the re-import dedupe key. */
export function dedupeKey(l: StatementLine): string {
  const s = `${l.valueDate}|${l.amount.toFixed(2)}|${normalise(l.description)}|${normalise(l.reference)}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

export interface MatchableInvoice {
  id: number;
  seriesPrefix: string | null;
  invoiceNumber: number | null;
  isRectification: boolean;
  issueDate: string | null;
  total: number;
  amountPaid?: number;
  status: string;
}

export type MatchReason = "amount" | "reference" | "date-close";

export interface ProposedMatch {
  line: StatementLine;
  invoice: MatchableInvoice;
  confidence: "high" | "medium" | "low";
  reasons: MatchReason[];
  /** Amount to record against the invoice (the credit line's amount). */
  amount: number;
}

export interface ProposeOptions {
  /** ISO today; unused for now but kept so callers pass a stable clock. */
  today?: string;
  /** How many days before the value date an invoice may have been issued. */
  maxDaysBefore?: number;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return NaN;
  return Math.round((to - from) / 86_400_000);
}

function outstanding(inv: MatchableInvoice): number {
  return inv.total - (inv.amountPaid ?? 0);
}

/**
 * Proposes at most one invoice per credit line. A match REQUIRES the line amount to equal the
 * invoice's outstanding balance or its full total (±1 cent). Reference (invoice number in the
 * description/reference text) and issue-date proximity only raise confidence. Each invoice is
 * offered to a single line (greedy, best reference/date match first).
 */
export function proposeMatches(
  lines: StatementLine[],
  invoices: MatchableInvoice[],
  opts: ProposeOptions = {},
): ProposedMatch[] {
  const maxDaysBefore = opts.maxDaysBefore ?? 120;
  const open = invoices.filter((i) => i.status === "issued" && outstanding(i) > 0.005);
  const used = new Set<number>();
  const matches: ProposedMatch[] = [];

  const credits = lines.filter((l) => l.amount > 0.005);

  for (const line of credits) {
    const haystack = normalise(`${line.description} ${line.reference}`).replace(/\s+/g, "");
    let bestScore = -1;
    let best: ProposedMatch | null = null;

    for (const inv of open) {
      if (used.has(inv.id)) continue;
      const amountMatch =
        Math.abs(line.amount - outstanding(inv)) <= 0.01 ||
        Math.abs(line.amount - inv.total) <= 0.01;
      if (!amountMatch) continue;

      const reasons: MatchReason[] = ["amount"];
      let score = 1;

      const label = normalise(invoiceNumberLabel(inv)).replace(/\s+/g, "");
      const bareNumber = inv.invoiceNumber != null ? String(inv.invoiceNumber) : "";
      const hasRef =
        (label.length >= 3 && haystack.includes(label)) ||
        (bareNumber.length >= 2 && haystack.includes(bareNumber));
      if (hasRef) {
        reasons.push("reference");
        score += 10;
      }

      let delta = NaN;
      if (inv.issueDate) {
        delta = daysBetween(inv.issueDate, line.valueDate);
      }
      const dateClose = !Number.isNaN(delta) && delta >= -3 && delta <= maxDaysBefore;
      if (dateClose) {
        reasons.push("date-close");
        score += Math.max(0, 3 - delta / 45);
      }

      // A coincidental amount match to an invoice with no reference hit and no plausible issue
      // date is noise — only surface it when something else corroborates.
      if (!hasRef && !dateClose) continue;

      if (score > bestScore) {
        bestScore = score;
        const confidence: ProposedMatch["confidence"] = hasRef
          ? "high"
          : !Number.isNaN(delta) && delta <= 45
            ? "medium"
            : "low";
        best = { line, invoice: inv, confidence, reasons, amount: line.amount };
      }
    }

    if (best) {
      used.add(best.invoice.id);
      matches.push(best);
    }
  }

  return matches.sort((a, b) => (a.line.valueDate < b.line.valueDate ? -1 : 1));
}
