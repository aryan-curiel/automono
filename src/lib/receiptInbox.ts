/** Pure queue/dedupe logic for the receipt inbox. The folder scan itself lives in Rust
 * (`list_receipt_inbox_files_cmd`); this decides which of the scanned files to actually
 * ingest, given what's already queued. */

export const RECEIPT_INBOX_EXTENSIONS = ["pdf", "png", "jpg", "jpeg"];

function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

/** A file the inbox will accept: a supported receipt extension, not a dotfile (.DS_Store etc.). */
export function isIngestableReceipt(path: string): boolean {
  const name = basename(path);
  if (!name || name.startsWith(".")) return false;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  return RECEIPT_INBOX_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase());
}

/**
 * Which scanned files to ingest now: supported receipts whose filename isn't already in the
 * queue. The Rust sweep deletes originals after copying them in, so on a settled folder this is
 * just "everything"; the dedupe matters when a window-focus poll fires again while a previous
 * sweep is still mid-ingest, or when the user quick-adds a file that also sits in the folder.
 *
 * ponytail: dedupe is by basename, so re-adding a differently-named copy of the same receipt
 * won't be caught (and two genuinely different receipts with the same filename would collide) —
 * fine for a single-user inbox; the review step is the real backstop.
 */
export function receiptsToIngest(
  scannedPaths: string[],
  queuedSourceNames: Iterable<string>,
): string[] {
  const seen = new Set(queuedSourceNames);
  return scannedPaths.filter((p) => isIngestableReceipt(p) && !seen.has(basename(p)));
}
