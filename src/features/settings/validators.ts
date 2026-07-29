const IBAN_FORMAT_PATTERN = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/;

export function isValidIban(value: string): boolean {
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  if (!IBAN_FORMAT_PATTERN.test(normalized)) return false;

  // ISO 7064 mod-97-10 checksum: move the first 4 characters to the end, convert
  // letters to numbers (A=10..Z=35), and check the resulting number mod 97 === 1.
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));

  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
