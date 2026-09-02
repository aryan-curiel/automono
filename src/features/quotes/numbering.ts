export interface QuoteNumber {
  year: number;
  seq: number;
}

/** Non-fiscal quote reference, e.g. `PRE-2026-007`. Unlike invoice numbers there is no
 * per-client series — the sequence is global per calendar year. */
export function quoteNumberLabel(q: QuoteNumber): string {
  return `PRE-${q.year}-${String(q.seq).padStart(3, "0")}`;
}

/** Next sequence number for a year, given the seq values already used that year. */
export function nextQuoteSeq(existingSeqsForYear: number[]): number {
  return existingSeqsForYear.reduce((max, n) => Math.max(max, n), 0) + 1;
}
