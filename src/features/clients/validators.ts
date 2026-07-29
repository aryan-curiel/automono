// ponytail: format-only NIF/CIF check (no mod-23/CIF checksum); add if bad
// data reaching legal PDFs becomes a real problem.
const NIF_CIF_PATTERN = /^(\d{8}[A-Z]|[XYZ]\d{7}[A-Z]|[A-HJNP-SUVW]\d{7}[0-9A-J])$/;
// ponytail: non-Spanish tax IDs vary wildly by country, so this just checks
// "looks like an identifier" (5-20 alphanumeric chars) rather than a real format.
const GENERIC_TAX_ID_PATTERN = /^[A-Z0-9]{5,20}$/;
const VAT_NUMBER_PATTERN = /^[A-Z]{2}[A-Z0-9]{2,12}$/;
const INVOICE_PREFIX_PATTERN = /^[A-Z]{3}$/;

export function isValidNifCif(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  return NIF_CIF_PATTERN.test(normalized) || GENERIC_TAX_ID_PATTERN.test(normalized);
}

export function isValidVatNumber(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  return normalized === "" || VAT_NUMBER_PATTERN.test(normalized);
}

export function isValidInvoicePrefix(value: string): boolean {
  return INVOICE_PREFIX_PATTERN.test(value.trim().toUpperCase());
}
