ALTER TABLE clients ADD COLUMN vat_number TEXT;
ALTER TABLE invoices ADD COLUMN client_vat_number_snapshot TEXT;

DROP TRIGGER trg_invoices_lock_after_issue;
CREATE TRIGGER trg_invoices_lock_after_issue
BEFORE UPDATE ON invoices
WHEN OLD.status IN ('issued', 'paid') AND (
  NEW.status = 'draft' OR
  NEW.series_prefix IS NOT OLD.series_prefix OR
  NEW.invoice_number IS NOT OLD.invoice_number OR
  NEW.client_id IS NOT OLD.client_id OR
  NEW.issue_date IS NOT OLD.issue_date OR
  NEW.vat_treatment IS NOT OLD.vat_treatment OR
  NEW.vat_note_text IS NOT OLD.vat_note_text OR
  NEW.language IS NOT OLD.language OR
  NEW.client_name_snapshot IS NOT OLD.client_name_snapshot OR
  NEW.client_address_snapshot IS NOT OLD.client_address_snapshot OR
  NEW.client_nif_snapshot IS NOT OLD.client_nif_snapshot OR
  NEW.client_vat_number_snapshot IS NOT OLD.client_vat_number_snapshot OR
  NEW.subtotal IS NOT OLD.subtotal OR
  NEW.iva_rate IS NOT OLD.iva_rate OR
  NEW.iva_amount IS NOT OLD.iva_amount OR
  NEW.irpf_rate IS NOT OLD.irpf_rate OR
  NEW.irpf_amount IS NOT OLD.irpf_amount OR
  NEW.total IS NOT OLD.total
)
BEGIN
  SELECT RAISE(ABORT, 'issued invoices are immutable');
END;
