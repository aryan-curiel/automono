UPDATE vat_note_templates
SET note_text = 'Operación no sujeta al IVA español conforme al artículo 69.Uno.1º de la Ley 37/1992. IVA repercutido en destino conforme al artículo 196 de la Directiva 2006/112/CE del Consejo — a autoliquidar por el destinatario.'
WHERE treatment_code = 'reverse_charge_eu' AND language = 'es';

UPDATE vat_note_templates
SET note_text = 'This transaction is not subject to Spanish VAT pursuant to Article 69.One.1º of Law 37/1992. VAT is reverse charged pursuant to Article 196 of Council Directive 2006/112/EC and must be self-assessed by the recipient.'
WHERE treatment_code = 'reverse_charge_eu' AND language = 'en';
