# Future Features

## Verifactu compliance

Spain's new anti-fraud invoicing standard. Not a new tax — a technical/security
standard invoicing software must meet, enforced by AEAT (the tax agency).

**Deadlines** (confirmed pushed back from the original 2026 dates):
- Corporate-tax companies: mandatory from **Jan 1, 2027**.
- Everyone else, including autónomos: mandatory from **July 1, 2027**.

**What compliant software must do:**
- Generate an immutable "invoicing record" for every invoice — corrections/
  cancellations create a *new* record, never edit or delete the old one.
- Chain each record to the previous one via hash, forming a tamper-evident
  sequential log (this is exactly the append-only shape AutoMono's issued-invoice
  lock triggers already assume — Verifactu just adds the hash chain and AEAT
  submission on top).
- Print `VERIFACTU` and a verification QR code on the invoice.
- Transmit each record to AEAT in real time (or queue and flush — the two
  legal modes are "Verifactu" and "no-Verifactu", the former requiring
  immediate submission).
- Keep a separate event log (system starts/stops, exports, etc.).

**Implementation path — don't build the AEAT connection yourself.** Several
providers (Verifacti, B2Brouter, Kreyo, efsta) sell certified Verifactu-as-a-
service: you POST structured invoice data (series, number, dates, type
F1/F3/R1-R5, line items, recipient NIF), they handle the hash chain, QR, XML,
and AEAT transmission, and return status. This is a thin Rust HTTP client
(new `verifactu.rs` module) plus a "Verifactu" toggle + provider API key field
in Ajustes → Datos, not a new subsystem. Given the deadline is 11 months out,
this doesn't need to be built now, but the invoice model should stay
append-only-friendly (it already is) so bolting this on later is a small diff.

- [ ] Pick a Verifactu API provider, add a Rust client + submit-on-issue hook
- [ ] Store `verifactu_status` / `verifactu_qr_url` per invoice
- [ ] Render QR + "VERIFACTU" marker on the generated PDF (`pdf.rs`)
- [ ] Settings toggle + API credentials in Ajustes

No rush (deadline is July 2027), but keep the invoice model append-only as it
already is, so this stays a bolt-on later.

---

## Sources

- [Verifactu para autónomos: guía para adaptarte en 2026](https://docuten.com/es/blog/verifactu-para-autonomos-que-saber/)
- [Nuevos plazos para Verifactu en 2027](https://www.autonomosyemprendedor.es/articulo/autonomos/nuevos-plazos-verifactu-2027-que-autonomos-van-tener-que-cambiar-programas-facturacion/20251230143941047321.html)
- [¿Es VeriFactu obligatorio para autónomos? Plazos y Guía 2026](https://www.b2brouter.net/es/verifactu-obligatorio-autonomos/)
- [VeriFactu Regulation in Spain: What Businesses Need to Know for 2026](https://meridianglobalservices.com/verifactu-regulation-in-spain-what-businesses-need-to-know-for-2026/)
- [VeriFactu in Spain: Technical requirements and operational readiness](https://www.avalara.com/blog/en/europe/2026/05/verifactu-technical-requirements.html)
- [Verifactu API Documentation (Verifacti)](https://www.verifacti.com/en/docs)
