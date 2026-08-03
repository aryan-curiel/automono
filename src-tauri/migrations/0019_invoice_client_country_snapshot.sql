-- Snapshots the client's country onto the invoice at issue time, same rationale as
-- client_name_snapshot/client_nif_snapshot/etc.: whether IRPF applied (and the "foreign
-- client" note shown alongside a 0% IRPF row) must reflect the client as of issuance, not
-- whatever country the client record holds later.
ALTER TABLE invoices ADD COLUMN client_country_snapshot TEXT;

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
  NEW.client_country_snapshot IS NOT OLD.client_country_snapshot OR
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
