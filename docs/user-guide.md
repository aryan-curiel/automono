# AutoMono user guide

AutoMono is a macOS app for Spanish freelancers (_autónomos_). It keeps your clients, contracts,
quotes, invoices, payments and expenses in one place, and turns them into the figures you need for
your quarterly and annual tax returns.

Everything stays on your Mac. There is no account and no server. See [PRIVACY.md](../PRIVACY.md)
for the few things that can leave your machine (optional AI features and web fonts).

The interface is in Spanish by default. This guide is in English, but it shows the Spanish labels
you will see on screen, with the English meaning in brackets, for example **Facturas** (Invoices).

> **Not tax advice.** AutoMono's IVA, IRPF and _modelo_ figures are indicative. They can contain
> errors or fall behind changes in the rules. Always check them with your _gestor_ or tax advisor
> before you file anything with the AEAT. AutoMono is not certified for Verifactu.

## Contents

1. [First run: set up your business](#1-first-run-set-up-your-business)
2. [Find your way around](#2-find-your-way-around)
3. [Clients](#3-clients)
4. [Contracts and recurring billing](#4-contracts-and-recurring-billing)
5. [Quotes](#5-quotes)
6. [Invoices](#6-invoices)
7. [Payments and collections](#7-payments-and-collections)
8. [Bank reconciliation](#8-bank-reconciliation)
9. [Expenses](#9-expenses)
10. [Quarterly summary and declarations](#10-quarterly-summary-and-declarations)
11. [Annual summary](#11-annual-summary)
12. [Settings](#12-settings)
13. [The assistant](#13-the-assistant)
14. [Where your data lives](#14-where-your-data-lives)
15. [Updates](#15-updates)
16. [FAQ and troubleshooting](#16-faq-and-troubleshooting)

---

## 1. First run: set up your business

The first time you open AutoMono, a four-step setup appears. You can press **Saltar por ahora**
(Skip for now) on any step and fill things in later under **Ajustes** (Settings). What you have
typed so far is saved.

| Step | Title on screen                                 | What you enter                                                                                                                                                                                                                                  |
| ---- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Documentos de alta** (Registration documents) | Optional. Drop your registration paperwork (certificado censal, alta en RETA, modelo 036/037…) as PDF, PNG or JPG. If you have set up an AI key, AutoMono reads them and pre-fills the next steps. Without a key the documents are just stored. |
| 2    | **Bienvenido a AutoMono** (Welcome)             | **Nombre / Razón social** (name, required), **NIF**, **Número de IVA** (VAT number), **Dirección fiscal** (fiscal address) and an optional **Logo**. The VAT number fills itself in as `ES` + your NIF until you edit it.                       |
| 3    | **Cuenta bancaria** (Bank account)              | **Nombre del banco**, **IBAN**, **BIC / SWIFT**. These are printed on your invoices as payment details. The IBAN is checked for a valid format and check digits.                                                                                |
| 4    | **Preferencias** (Preferences)                  | **Modo oscuro** (dark mode), **Idioma** (interface language: Español or English), **IVA por defecto (%)** and **IRPF por defecto (%)**.                                                                                                         |

Press **Finalizar** (Finish) to start using the app.

About the default IRPF rate: new autónomos can apply a reduced 7% withholding in the year they
register and the two calendar years after. After that the standard rate is 15%. If AutoMono knows
your registration date, it suggests the matching rate.

You can change all business and bank details later in **Ajustes → Datos**. The interface language
and the default IVA/IRPF rates are only asked for in this setup; there is no control for them in
**Ajustes** at the moment.

## 2. Find your way around

### The sidebar

| Section               | Item                                       | What it is for                                              |
| --------------------- | ------------------------------------------ | ----------------------------------------------------------- |
|                       | **Inicio** (Home)                          | What needs your attention today                             |
|                       | **Clientes** (Clients)                     | Your clients, their contracts and balances                  |
| **Ingresos** (Income) | **Facturas** (Invoices)                    | Invoices, plus a **Cobros** (Collections) tab               |
|                       | **Presupuestos** (Quotes)                  | Quotes that can become invoices                             |
|                       | **Conciliación** (Reconciliation)          | Match bank statement lines to invoices                      |
| **Gastos** (Expenses) | **Gastos** (Expenses)                      | Expenses, plus a **Bandeja de recibos** (Receipt inbox) tab |
| **Impuestos** (Taxes) | **Resumen trimestral** (Quarterly summary) | Quarterly figures and declarations                          |
|                       | **Resumen anual** (Annual summary)         | Multi-year view, profit and loss, Modelo 347                |
|                       | **Asistente** (Assistant)                  | Optional AI chat about your own figures                     |

At the bottom of the sidebar you see your business name and NIF. The gear icon opens **Ajustes**
(Settings). A number on **Gastos** shows how many receipts are waiting in the receipt inbox.

### The home screen

**Inicio** lists only what needs doing:

- Overdue invoices and the amount outstanding, with a link to **Cobros**.
- The next tax filing deadline, with a link to **Resumen trimestral**.
- Recurring invoices that are ready, with a **Generar** (Generate) button.
- Receipts waiting for review, with a **Revisar** (Review) button.

When nothing is pending it says you are all caught up. Buttons at the top create a new invoice or a
new expense (**Gasto**).

### Keyboard shortcuts

| Shortcut    | Action                                                               |
| ----------- | -------------------------------------------------------------------- |
| Cmd+K       | Open search. Find clients, invoices and contracts by name or number. |
| Cmd+Shift+U | Pick receipt files and add them straight to the receipt inbox.       |

### Drag and drop

- Drop a PDF, PNG or JPG anywhere in the window to start a new expense with that file as the
  receipt.
- On **Resumen trimestral**, drop a _modelo_ PDF to review it and attach it to the quarter's
  declaration (see [section 10](#10-quarterly-summary-and-declarations)).

### Unsaved changes

If you leave a form, or close the window, with unsaved changes, AutoMono asks whether to
**Descartar** (Discard) or **Seguir editando** (Keep editing).

## 3. Clients

You must add at least one client before you can create an invoice or a quote.

### Add a client

1. Go to **Clientes** and press **Nuevo cliente** (New client).
2. Fill in the fields:

| Field                                             | Notes                                                                                                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nombre** (Name)                                 | Required.                                                                                                                                          |
| **NIF/CIF**                                       | Checked for a valid Spanish format.                                                                                                                |
| **Número IVA** (VAT number)                       | For EU clients. Must start with a 2-letter country code, e.g. `BG123456789`.                                                                       |
| **País** (Country)                                | Choosing a country suggests the VAT treatment (see below).                                                                                         |
| **Dirección**, **Email**, **Teléfono**, **Notas** | Optional.                                                                                                                                          |
| **Serie de factura** (Invoice series)             | Pick an existing series or **+ Nueva serie** (New series). A series prefix is exactly 3 letters, e.g. `IMO`. Several clients can share one series. |
| **Tratamiento IVA** (VAT treatment)               | See the table below.                                                                                                                               |
| **Idioma de factura** (Invoice language)          | Español, English or Català.                                                                                                                        |

3. Press **Guardar** (Save).

VAT treatments:

| Option                                               | When it is suggested     | Effect on invoices                          |
| ---------------------------------------------------- | ------------------------ | ------------------------------------------- |
| **Estándar** (Standard)                              | Spain, or no country set | Normal IVA rate applies                     |
| **Inversión sujeto pasivo (UE)** (EU reverse charge) | Another EU country       | IVA is 0%, with a legal note on the invoice |
| **Exportación (fuera UE)** (Export outside the EU)   | Outside the EU           | IVA is 0%, with a legal note on the invoice |
| **Exenta (otro)** (Exempt, other)                    | Never automatic          | IVA is 0%, with a legal note on the invoice |

IRPF withholding only applies to clients in Spain. For a client with a foreign country, IRPF is
always 0% and the invoice says "cliente extranjero" (foreign client).

### Client detail

Open a client to see their details, their contracts and invoices, and a **Balance** with
**Total facturado** (total invoiced), **Total cobrado** (total paid) and **Pendiente de cobro**
(outstanding).

You cannot delete a client who has invoices.

## 4. Contracts and recurring billing

Contracts belong to a client. Create one from the client's detail page with **+ Nuevo contrato**
(New contract).

| Field                                                 | Notes                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Cliente** (Client)                                  | Required.                                                                        |
| **Título** (Title)                                    | Required.                                                                        |
| **Fecha de inicio / Fecha de fin** (Start / end date) | The start date also decides which year folder the contract file is stored in.    |
| **Estado** (Status)                                   | **Activo** (Active), **Vencido** (Expired) or **Terminado** (Terminated).        |
| **Frecuencia de facturación** (Billing cadence)       | **Sin facturación recurrente** (none), **Mensual**, **Trimestral** or **Anual**. |
| **Fecha de la próxima factura** (Next invoice date)   | Required when a cadence is set.                                                  |
| **Archivo** (File)                                    | Attach the signed contract with **Adjuntar archivo**.                            |
| **Notas**                                             | Optional.                                                                        |

### Extract terms from a contract file

If you have set up an AI key, **Extraer del contrato** (Extract from contract) reads the attached
PDF and fills in the billing terms. It also shows a **Sugerencia de primera factura** (Suggested
first invoice) with concept, base, IRPF and IVA. Review the values; you create the first invoice
yourself. The PDF needs a text layer (not a scanned image).

### How recurring billing works

Each time you open AutoMono, it checks every contract that has a billing cadence. When the next
invoice date has arrived:

1. It copies that client's last invoice into a new **draft** invoice.
2. It moves the contract's next invoice date forward by one period.
3. It sends a macOS notification.

Things to know:

- The client needs at least one earlier invoice to copy. Issue the first one by hand.
- Drafts are never issued automatically. Open the draft, check it and issue it.
- If the app was closed for several periods, it creates one draft, not one per missed period.
- The home screen also suggests clients you invoiced last month but not yet this month.

## 5. Quotes

Quotes (_presupuestos_) have no fiscal value. Use them for work a client has not accepted yet.

### Create a quote

1. Go to **Presupuestos** and press **Nuevo presupuesto** (New quote).
2. Choose the client, the date, **Válido hasta** (Valid until), the IVA rate, the IRPF withholding
   and the language. Add lines and optional **Notas** (terms, delivery times, payment method).
3. Press **Guardar**. The number is assigned on save, in the form `PRE-2026-001`.

You can download a PDF with **Descargar PDF**.

### Quote status

Set the status as things move: **Borrador** (Draft), **Enviado** (Sent), **Aceptado** (Accepted),
**Rechazado** (Rejected) or **Caducado** (Expired).

### Turn a quote into an invoice

When a quote is **Aceptado**, a **Convertir en factura** (Convert to invoice) button appears. It
creates a draft invoice with the same lines and opens it. The quote is then marked
**Convertido** (Converted) and can no longer be edited.

## 6. Invoices

### Issue an invoice

1. Go to **Facturas** and press **Nueva factura** (New invoice).
2. Choose the **Cliente**. The IVA and IRPF rates fill in from your defaults and the client's
   VAT treatment and country.
3. Set the **Fecha de emisión** (Issue date), **Tipo de IVA** (VAT rate), **Retención IRPF**
   (IRPF withholding) and **Idioma de la factura** (Invoice language).
4. Add lines with **+ Añadir línea**: **Descripción**, **Cant.** (quantity) and **Precio** (price).
5. Check the **Totales**: **Base imponible** (taxable base), IVA, IRPF and **Total**.
6. Press **Guardar borrador** (Save draft) to keep working on it later, or **Emitir factura**
   (Issue invoice) to finalise it.

Rate options:

| IVA                       | IRPF                             |
| ------------------------- | -------------------------------- |
| 21% — general             | 15% — estándar                   |
| 10% — reducido            | 7% — reducida (inicio actividad) |
| 4% — superreducido        | 0% — no aplica                   |
| 0% — tratamiento especial |                                  |

Total = base + IVA − IRPF.

### What happens when you issue

- The invoice gets the next number in the client's series, for example `IMO-001`, `IMO-002`.
  Numbers are assigned at the moment of issue, so there are no gaps or duplicates.
- The client's name, address, NIF and VAT number are copied onto the invoice. Changing the client
  later does not change issued invoices.
- If no due date is set, it is set to 30 days after the issue date.
- The invoice is **locked**. You can no longer edit its lines, rates or client. To correct it, issue
  a rectifying invoice.

Only drafts can be edited or deleted (**Eliminar borrador**).

Invoice status: **Borrador** (Draft), **Emitida** (Issued), **Pagada** (Paid).

### Download the PDF

On the invoice detail, press **Descargar PDF**. The first time, AutoMono generates the PDF and
opens it. The arrow next to the button has **Generar y descargar** (Generate and download), which
rebuilds the PDF, for example after you change your logo or bank details.

The PDF includes your logo (if set), your business and bank details, the client's details, the
lines, the totals and, where needed, the VAT legal note.

PDF language: invoices print in Spanish or English. If you choose Català, the PDF currently uses
the Spanish labels.

### Duplicate an invoice

In the invoice detail, open **Más acciones** (More actions) and choose **Duplicar factura**. This
creates a new draft with the same lines.

### Correct an issued invoice (rectifying invoice)

1. Open the issued invoice and press **Crear rectificativa** (Create rectification).
2. Choose the **Tipo** (Type):
   - **Anulación completa** (Full cancellation): creates negative lines that cancel the whole
     original total.
   - **Corrección parcial** (Partial correction): starts blank; add only the lines that correct the
     original amount.
3. Enter the **Motivo** (Reason). It is required.
4. Press **Emitir rectificativa** (Issue rectification).

Rules:

- IVA and IRPF are inherited from the original invoice and cannot be changed.
- Rectifying invoices have their own numbering in the same series, for example `IMO-R001`.
- An invoice can be rectified only once, and you cannot rectify a draft or another rectification.
- The original shows "rectificada por" (rectified by) and the rectification shows "rectifica"
  (rectifies), with links between them.

## 7. Payments and collections

### Mark an invoice as paid

On the invoice detail, press **Marcar como pagada** (Mark as paid) and confirm. The full amount is
recorded as paid today.

### Record a partial payment

Go to **Facturas → Cobros** (Collections). Every issued invoice that is not fully paid is listed,
grouped by how late it is:

- **Aún no vencidas** (Not due yet)
- **1–30 días de retraso** (1–30 days overdue)
- **31–60 días de retraso**
- **60+ días de retraso**

Press **Registrar cobro** (Record payment), enter the **Importe** (amount) and **Fecha de cobro**
(payment date), and save. The payment is added to what was already paid. When the total is
reached, the invoice becomes **Pagada**.

### Chase a late payment

From **Cobros** you can copy ready-made text to paste into an email:

- **Copiar recordatorio de pago** (Copy payment reminder): a polite reminder.
- **Copiar carta Ley 3/2004** (Copy Ley 3/2004 letter): a formal claim for late-payment interest.

The text is written in the interface language (Spanish or English).

### Late-payment interest

Overdue invoices show an **Interés de demora (Ley 3/2004)** box on the invoice detail. It shows
the days overdue and the **Interés adeudado** (interest owed). The annual rate starts at 8% and you
can change it. The real rate is the legal interest rate plus 8 points, published in the BOE every
six months. Check the current rate before you claim it.

## 8. Bank reconciliation

**Conciliación** matches money coming into your bank account with your issued invoices.

### Import a statement

1. Export a statement from your bank as a CSV (or TXT) file.
2. In **Conciliación**, press **Importar extracto** (Import statement) and choose the file.
3. In **Asignar columnas** (Map columns), check which column holds each field:
   **Fecha valor** (value date), **Importe** (amount), **Concepto** (description) and the optional
   **Referencia** (reference). AutoMono guesses from the column headers.
4. Press **Importar**.

What the file should look like:

| Requirement | Details                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| First row   | Column headers. Spanish and English names are recognised (e.g. "Fecha valor", "Importe", "Concepto", "Referencia"). |
| Separator   | Semicolon, comma or tab, detected automatically.                                                                    |
| Dates       | `dd/mm/yyyy`, `dd-mm-yyyy`, `dd.mm.yyyy` or `yyyy-mm-dd`.                                                           |
| Amounts     | One signed amount column: money in is positive. Both `1.234,56` and `1,234.56` work.                                |

Statements that split money in and out into two separate columns (cargo/abono) are not supported;
combine them into one signed column first.

Rows without a readable date or amount are skipped. Importing the same statement twice is safe:
lines already imported are skipped and counted.

### Review the matches

Incoming payments are sorted into three groups:

- **Coincidencias propuestas** (Proposed matches). A match needs the amount to equal the invoice's
  outstanding balance or its total (to the cent). The invoice number appearing in the description,
  and an issue date close to the payment, raise the confidence: **Alta**, **Media** or **Baja**.
  Press **Confirmar** to record the payment on the invoice, or **Descartar** to dismiss it.
- **Ingresos sin conciliar** (Unmatched credits). Use **Conciliar manualmente** (Match manually) to
  pick the invoice yourself.
- **Movimientos conciliados** (Reconciled lines). **Deshacer** (Undo) unlinks a line. It does not
  remove the payment from the invoice; adjust that in **Cobros** if needed.

## 9. Expenses

### Add an expense

Go to **Gastos** and press **Nuevo gasto** (New expense), or drop a receipt file onto the window.

| Field                                          | Notes                                                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fecha** (Date)                               | Required. Decides the quarter and the year folder for the receipt.                                                                            |
| **Fecha de pago** (Payment date)               | Used when you work on a cash basis (criterio de caja).                                                                                        |
| **Proveedor** (Provider)                       | Supplier name.                                                                                                                                |
| **Categoría** (Category)                       | From your list in **Ajustes → Categorías**.                                                                                                   |
| **Descripción**                                |                                                                                                                                               |
| **Importe** (Amount)                           | Required.                                                                                                                                     |
| **Importe IVA** (VAT amount)                   | The IVA shown on the receipt.                                                                                                                 |
| **% deducible** (Deductible %)                 | Defaults to 100.                                                                                                                              |
| **% deducible IVA** (Deductible VAT %)         | Leave blank to use the same % as above. Set it separately when they differ, e.g. a mixed-use car (50% IVA) or home-office utilities (0% IVA). |
| **% Retención IRPF / Importe retenido (IRPF)** | For invoices from professionals where you withhold IRPF. These feed Modelo 111.                                                               |
| **Declarar en** (Declare in)                   | Defaults to **Automático** (the quarter of the expense date). Choose a later quarter for an expense you are declaring late.                   |
| **Factura o recibo** (Invoice or receipt)      | Attach a PDF, PNG or JPG.                                                                                                                     |

### Automatic receipt reading

When you attach a receipt, AutoMono tries to fill in the date, amount, IVA, IRPF and provider
before you save:

- **With an AI key** (see [Settings](#12-settings)): works for PDFs and photos, and also picks a
  category.
- **Without a key**: a built-in, offline reader works on PDFs that contain text. It does not read
  photos or scanned images.

A message tells you which method was used. Always check the fields before saving.

### The receipt inbox

The inbox is a review queue for receipts. Open it from **Gastos → Bandeja de recibos**.

To fill it automatically:

1. Go to **Ajustes → General → Bandeja de recibos**.
2. Choose a **Carpeta vigilada** (Watched folder) and switch **Activar** (Enable) on.
3. Drop PDF, JPG or PNG files into that folder (for example from a phone scan app or your email).

AutoMono checks the folder when it starts and every time its window comes back to the front. Each
new file is copied into AutoMono's data folder and **removed from the watched folder**, then
appears in the inbox.

You can also add files by hand with **Añadir recibo** (Add receipt) or Cmd+Shift+U. Files you pick
by hand are not deleted from where they are.

For each receipt, check the **Importe**, **Proveedor**, **Descripción** and category, then press
**Confirmar** to create the expense, or **Descartar** to drop it.

### Expense list

- Switch the period between **Mes**, **Trimestre** and **Año** (month, quarter, year).
- The summary shows **Total gastos**, **Total deducible** and **IVA deducible**.
- **Conviene revisar** (Worth a second look) flags possible problems: likely duplicate receipts, a
  quarter with unusually high deductible IVA, an amount far above what is normal for its category,
  and IRPF that does not fit the category.
- Expenses included in a completed quarterly declaration show a **Declarada** (Declared) badge. You
  can also set it by hand with **Marcar como declarada** / **Marcar como no declarada** from the
  expense list or the expense's **Más acciones** menu.

### Categories

Manage categories in **Ajustes → Categorías**. The starting list is Suministros, Material,
Software, Alquiler, Transporte and Otros. You can add and rename categories. A category that is in
use cannot be deleted until you move its expenses to another category.

## 10. Quarterly summary and declarations

**Resumen trimestral** gives you the figures for Modelo 303 (IVA), 130 (IRPF installment) and, if
you file it, 111 (withholdings).

### Read the summary

Use the timeline at the top to pick a quarter. Until you start a declaration, the screen is a
**Proyección — aún sin declarar** (Projection — not declared yet) and updates as your data
changes. It shows:

- **Total facturado (base)**, **IRPF retenido (facturas)**, **IRPF retenido (gastos)**,
  **Ingreso neto estimado** (estimated net income) and **Margen (tras IRPF)** (margin after IRPF),
  with the change against the same quarter last year.
- The quarter's invoices and expenses, which you can filter by month.
- **IVA repercutido por tipo** (VAT charged by rate) and **Gastos deducibles del trimestre**.
- **Modelo 349**: intra-EU operations for clients on EU reverse charge.
- **Últimos cuatro trimestres** (Last four quarters): IVA due per quarter, paid versus outstanding,
  and your top expense category.

**Exportar CSV** saves the quarter's figures as a CSV file.

### Accrual or cash basis

By default AutoMono uses the **Criterio de devengo** (accrual basis): every invoice issued in the
quarter counts, paid or not, and expenses count by their date.

If you are registered for the **Criterio de caja** (cash basis), switch it on in
**Ajustes → Datos**. Then only paid invoices count, and expenses count by their payment date.
Modelo 349 always uses the accrual basis.

### File a quarter step by step

1. On the quarter, press **Iniciar declaración** (Start declaration).
2. **Confirma las facturas del trimestre** (Confirm the quarter's invoices), then **Continuar**.
3. **Confirma los gastos** (Confirm the expenses), then **Continuar**.
4. **Resumen** (Summary): check the totals and the **Gastos de difícil justificación** rate (5% of
   net income under estimación directa simplificada, capped at 2,000 € a year). Press
   **Crear declaración** (Create declaration).

The declaration is now **En curso** (In progress). While it is in progress, its figures still
update if you edit invoices or expenses.

5. Use **Casillas para el Modelo …** (Boxes for Modelo …) to fill in the AEAT forms. Each box shows
   AutoMono's value with a **Copiar valor** (Copy value) button. The boxes covered are:

   | Modelo | Boxes AutoMono fills                                                   |
   | ------ | ---------------------------------------------------------------------- |
   | 303    | IVA devengado, IVA deducible, result before offsetting earlier periods |
   | 130    | Year-to-date net income and the installment (pago fraccionado)         |
   | 111    | Withholding base and withholdings paid                                 |

   The 303 result does not include amounts carried over from earlier periods or annual
   adjustments. Check every value against your own records.

6. File the _modelos_ on the AEAT website (Sede Electrónica). AutoMono does not file anything for
   you.
7. Attach each filed PDF under **Documentación presentada** (Filed documentation) with
   **Adjuntar PDF**, or drag the PDFs onto the window. AutoMono reads each PDF, checks it is
   Modelo 303, 130 or 111 for the right quarter, and shows a **Informe de comparación**
   (Comparison report) of its figures against yours: **Coincide** (Match), **No coincide**
   (Mismatch) or **No encontrado** (Not found). Press **Aprobar y adjuntar** (Approve & attach).
8. When every required modelo is attached, press **Marcar como completada** (Mark as completed).
   The figures are frozen and the included expenses are marked **Declarada**.

Modelo 111 is required only if **Presento el Modelo 111** (I file Modelo 111) is on in
**Ajustes → Datos**.

**Descargar ZIP** (Download ZIP) on a declaration saves a bundle for your _gestor_: the invoice
PDFs in a `facturas` folder, the receipts in a `gastos` folder, and a `resumen.csv`. Only invoice
PDFs that have already been generated are included, so open and download each invoice's PDF first.

To start over, an in-progress declaration can be deleted from **Más acciones → Eliminar
declaración**. Your invoices and expenses are not affected.

### Filing reminders

AutoMono knows these deadlines:

| Modelo             | Deadline                      |
| ------------------ | ----------------------------- |
| 130 / 303, Q1–Q3   | 20 April, 20 July, 20 October |
| 130 / 303, Q4      | 30 January                    |
| 190 / 390 (annual) | 30 January                    |

A deadline that falls on a weekend moves to the next Monday. Public holidays are not taken into
account.

When you open the app 7, 3 and 1 days before a deadline, you get a macOS notification, unless that
quarter's declaration is already completed. The next deadline is also shown on **Inicio**.

## 11. Annual summary

**Resumen anual** has three tabs:

- **Plurianual** (Multi-year): revenue, expenses and net result per year, with year-on-year change.
- **Pérdidas y ganancias** (Profit & loss): revenue, expenses and net result for one year,
  revenue by client, expenses by category, and revenue composition (top client and repeat
  clients). Amounts exclude IVA and use the accrual basis. This tab also has an **Estimación de
  IRPF (Renta)**: a rough estimate of your income tax from net profit, with the effective and
  marginal rate. It uses a general combined scale and a flat personal allowance. It ignores your
  region's own scale, family allowances, simplified-regime reductions and tax already withheld.
  It is not a tax return.
- **Modelo 347**: clients and suppliers whose yearly total (IVA included) is over 3,005.06 €.
  Intra-EU operations and operations with IRPF withholding are left out. Use the arrows to change
  year and **Exportar CSV** to export the list.

## 12. Settings

Open **Ajustes** with the gear icon at the bottom of the sidebar.

### General

- **Apariencia** (Appearance): **Modo oscuro** (dark mode).
- **Extracción de recibos con IA** (Receipt AI extraction): choose a **Proveedor** (Anthropic,
  OpenAI or OpenRouter), paste your **Clave API** (API key) and optionally a **Modelo** (model
  name). Press **Guardar**. Leave the key blank to use only the offline PDF reader. The same key
  is used for receipt reading, contract extraction, registration-document extraction and the
  assistant. Keys are stored in the macOS Keychain, not in the database.
- **Bandeja de recibos** (Receipt inbox): the watched folder (see [section 9](#9-expenses)).
- **Estado de la base de datos** (Database status): shows whether the database is connected.
- **Acerca de** (About): version, licence, the tax disclaimer and **Buscar actualizaciones**
  (Check for updates).

### Datos (Details)

Your business details (**Nombre / Razón social**, **NIF**, **Número de IVA**, **Dirección
fiscal**), and:

- **Fecha de alta como autónomo** (Self-employment start date): used to suggest the IRPF rate.
- **Presento el Modelo 111**: adds Modelo 111 to quarterly declarations.
- **Criterio de caja**: switches quarterly figures to the cash basis.
- **Logo**: printed in the corner of your invoices (PNG or JPG).
- **Datos bancarios**: bank name, IBAN, BIC / SWIFT.

Press **Guardar** to save.

### Documentos (Documents)

Upload your registration paperwork (certificado censal, RETA, etc.). With an AI key, AutoMono
extracts your details and fills in blank fields on the **Datos** tab; remember to save there.

**Contexto del usuario** (User context) is an editable summary of your situation as an autónomo,
generated from these documents. The assistant uses it. **Regenerar desde documentos** rebuilds it.

### Categorías (Categories)

Manage expense categories (see [section 9](#categories)).

### Copia de seguridad (Backup)

A backup copies the database plus your contracts, receipts, invoice PDFs, filed modelos,
registration documents and logo into a new dated folder (`backup-<date-time>`).

1. **Carpeta de destino** (Destination folder): **Elegir carpeta**. Pick a folder that is itself
   backed up or synced, such as iCloud Drive, Google Drive or an external disk.
2. **Conservar copias (días)** (Keep backups, days): older backups in that folder are deleted.
   0 keeps them forever.
3. **Copia automática** (Automatic backup) and **Repetir cada (días)** (Repeat every, days): when a
   backup is due, it runs when you open the app, and also when you close it.
4. **Copia de seguridad ahora** (Back up now) runs one immediately.

Each backup includes a checksum list, so a damaged backup is detected.

### Restore from a backup

1. Press **Restaurar desde copia** (Restore from backup) and choose the backup folder.
2. Pick one backup from the list.
3. Confirm. This **replaces all your current data** with the backup.

AutoMono checks the backup is a complete, valid AutoMono database before touching anything, then
restarts with the restored data.

## 13. The assistant

**Asistente** is an optional chat for questions about your own figures, such as "¿Cuánto llevo
facturado este año?" (How much have I invoiced this year?) or "¿Cuánto tengo pendiente de cobro?"
(How much am I owed?).

- It needs an AI provider and key in **Ajustes → General**.
- Your question is sent directly from your Mac to the provider you chose, together with a summary
  of your figures: quarter and year totals, your top 5 clients by name and amount, unpaid totals,
  upcoming deadlines and your user context. See [PRIVACY.md](../PRIVACY.md).
- The conversation is not saved. Leaving the screen or restarting the app clears it.
- It does not replace your _gestor_.

## 14. Where your data lives

Everything is in one folder on your Mac:

```
~/Library/Application Support/com.nagarestudio.automono/
```

To open it in Finder, press Cmd+Shift+G and paste the path.

| Path                            | Contents                                                             |
| ------------------------------- | -------------------------------------------------------------------- |
| `automono.db`                   | The database: clients, invoices, expenses, settings, everything else |
| `expenses/<year>/receipts/`     | Expense receipts                                                     |
| `contracts/<year>/<client id>/` | Contract files                                                       |
| `invoices/`                     | Generated invoice PDFs                                               |
| `declarations/<year>/`          | Filed modelo PDFs, e.g. `2026-Q1_modelo303.pdf`                      |
| `documentos_autonomo/`          | Registration documents                                               |
| `branding/`                     | Your logo                                                            |
| `contexto_usuario.md`           | The user context summary                                             |
| `pre-update-backups/`           | Backups taken before an update, only if no backup folder is set      |

Receipts and contracts are named `<date>_<description>.<ext>`, using the expense date or contract
start date, so the folder reads like an archive your accountant can browse.

Do not edit or move files in this folder by hand. Use the app, and use backups to copy your data.

## 15. Updates

AutoMono checks GitHub Releases for a new version each time it starts. If there is one, a message
says so. Install it from **Ajustes → General → Acerca de** with **Instalar la versión … y
reiniciar** (Install version … and restart). You can also check by hand with **Buscar
actualizaciones**.

Before installing, AutoMono backs up all your data: into your backup folder if you set one, or
into `pre-update-backups/` inside the data folder otherwise. Your data is kept across updates.

If you are offline, the check fails silently. Try again later from **Ajustes**.

## 16. FAQ and troubleshooting

**I can't create an invoice or quote.**
Add a client first. Invoices and quotes need a client.

**I made a mistake on an issued invoice.**
Issued invoices are locked by design. Create a rectifying invoice (**Crear rectificativa**). Only
drafts can be edited or deleted.

**The invoice PDF doesn't show my new logo or bank details.**
Open the invoice and use **Generar y descargar** from the arrow next to **Descargar PDF** to
rebuild it.

**Why is IVA 0% on this invoice?**
The client's VAT treatment is not **Estándar** (EU reverse charge, export or exempt). Non-standard
treatments always use 0% IVA. Check **Tratamiento IVA** on the client.

**Why is there no IRPF on this invoice?**
The client's country is not Spain. IRPF withholding only applies to Spanish clients.

**My recurring invoice wasn't created.**
The client needs at least one earlier invoice to copy. Also check that the contract has a billing
cadence and a next invoice date, and that you opened the app on or after that date.

**A receipt dropped in the watched folder doesn't appear.**
Check that the inbox is enabled in **Ajustes → General**, the file is a PDF, JPG or PNG, and
switch away from AutoMono and back to trigger a new check.

**The receipt fields stay empty.**
Without an AI key, only PDFs with real text can be read. Photos and scanned PDFs need an AI key, or
you can type the fields in.

**My bank CSV won't import or shows no rows.**
Make sure the first row has column headers, there is one signed amount column, and dates are in
one of the supported formats. Check the column mapping before pressing **Importar**.

**Contract extraction fails.**
It needs an AI key and a PDF with a text layer, not a scanned image.

**The assistant says to set up a provider.**
Add a provider and API key in **Ajustes → General**.

**How do I change the interface language?**
The language is chosen during first-run setup. There is currently no language control in
**Ajustes**.

**How do I move to a new Mac?**
Make a backup to a folder you can reach from the new Mac (an external disk or a synced folder).
On the new Mac, install AutoMono, skip the first-run setup, then go to **Ajustes → Copia de
seguridad**, use **Restaurar desde copia** and pick that backup.

**The figures in AutoMono don't match my gestor's.**
AutoMono's figures are indicative. Your gestor's numbers and the AEAT rules take priority.
