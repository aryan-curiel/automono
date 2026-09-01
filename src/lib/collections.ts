import { formatDate, formatEUR } from "./format";
import { lateInterestOwed } from "./lateInterest";

export type CollectionsLocale = "es" | "en";

export interface ReminderParams {
  businessName: string;
  clientName: string;
  /** Display label, e.g. "2026-014". */
  invoiceNumber: string;
  issueDate: string | null;
  dueDate: string | null;
  /** Full invoice total. */
  total: number;
  /** Amount still owed (total minus payments received). */
  outstanding: number;
  daysOverdue: number;
  iban?: string | null;
}

export interface LateInterestLetterParams extends ReminderParams {
  /** Annual statutory rate (Ley 3/2004: ECB reference + 8 points), user-supplied. */
  annualRatePct: number;
  /** Date the letter is written, ISO `YYYY-MM-DD`. */
  today: string;
}

/**
 * Plain-text payment reminder the user can paste into an email or message. Deliberately
 * plain text — no HTML, no sending. Tone shifts from a nudge to a firm notice once the
 * invoice is actually overdue.
 */
export function paymentReminder(p: ReminderParams, locale: CollectionsLocale): string {
  const amount = formatEUR(p.outstanding);
  const partial = p.outstanding + 0.005 < p.total;

  if (locale === "en") {
    const lines = [
      `Subject: Invoice ${p.invoiceNumber} — ${p.daysOverdue > 0 ? "payment overdue" : "payment reminder"}`,
      "",
      `Dear ${p.clientName},`,
      "",
      p.daysOverdue > 0
        ? `Our invoice ${p.invoiceNumber}, dated ${formatDate(p.issueDate)}, was due on ${formatDate(p.dueDate)} and is now ${p.daysOverdue} day(s) overdue.`
        : `This is a friendly reminder that our invoice ${p.invoiceNumber}, dated ${formatDate(p.issueDate)}, is due on ${formatDate(p.dueDate)}.`,
      "",
      partial
        ? `Outstanding balance: ${amount} (of ${formatEUR(p.total)}).`
        : `Amount due: ${amount}.`,
      p.iban ? `Please transfer to IBAN ${p.iban}, quoting ${p.invoiceNumber} as the reference.` : "",
      "",
      p.daysOverdue > 0
        ? "Please arrange payment within the next 7 days. If payment has already been sent, kindly disregard this message."
        : "If payment is already scheduled, please disregard this message.",
      "",
      "Kind regards,",
      p.businessName,
    ];
    return lines.filter((l, i) => l !== "" || lines[i - 1] !== "").join("\n");
  }

  const lines = [
    `Asunto: Factura ${p.invoiceNumber} — ${p.daysOverdue > 0 ? "pago vencido" : "recordatorio de pago"}`,
    "",
    `Estimado/a ${p.clientName}:`,
    "",
    p.daysOverdue > 0
      ? `Nuestra factura ${p.invoiceNumber}, de fecha ${formatDate(p.issueDate)}, venció el ${formatDate(p.dueDate)} y acumula ${p.daysOverdue} día(s) de retraso.`
      : `Le recordamos que nuestra factura ${p.invoiceNumber}, de fecha ${formatDate(p.issueDate)}, vence el ${formatDate(p.dueDate)}.`,
    "",
    partial
      ? `Importe pendiente: ${amount} (de ${formatEUR(p.total)}).`
      : `Importe a abonar: ${amount}.`,
    p.iban ? `Puede realizar la transferencia al IBAN ${p.iban}, indicando ${p.invoiceNumber} como concepto.` : "",
    "",
    p.daysOverdue > 0
      ? "Le rogamos regularice el pago en un plazo de 7 días. Si ya ha efectuado el abono, disculpe este mensaje."
      : "Si el pago ya está programado, puede ignorar este mensaje.",
    "",
    "Un cordial saludo,",
    p.businessName,
  ];
  return lines.filter((l, i) => l !== "" || lines[i - 1] !== "").join("\n");
}

/**
 * Ley 3/2004 late-payment interest claim letter, plain text. Surfaces the interest figure
 * from `lateInterestOwed` (the app's existing day-count math). The rate is caller-supplied
 * because BOE republishes it twice a year — the letter notes it must be verified.
 */
export function lateInterestLetter(
  p: LateInterestLetterParams,
  locale: CollectionsLocale,
): string {
  const interest = lateInterestOwed(p.outstanding, p.annualRatePct, p.daysOverdue);
  const totalClaim = p.outstanding + interest;

  if (locale === "en") {
    return [
      `${p.businessName}`,
      `${formatDate(p.today)}`,
      "",
      `To: ${p.clientName}`,
      "",
      `Re: Overdue invoice ${p.invoiceNumber} — formal notice and claim for late-payment interest`,
      "",
      `Dear Sir or Madam,`,
      "",
      `Invoice ${p.invoiceNumber}, issued on ${formatDate(p.issueDate)} and due on ${formatDate(p.dueDate)}, remains unpaid ${p.daysOverdue} day(s) after its due date.`,
      "",
      `Under Ley 3/2004 of 29 December, on measures to combat late payment in commercial transactions, statutory default interest accrues automatically, without the need for a reminder, from the day following the due date.`,
      "",
      `Principal outstanding:      ${formatEUR(p.outstanding)}`,
      `Late-payment interest:      ${formatEUR(interest)}  (${p.annualRatePct}% annual, ${p.daysOverdue} days)`,
      `Total now claimed:          ${formatEUR(totalClaim)}`,
      "",
      `The rate applied is the statutory late-payment rate (ECB main refinancing rate + 8 percentage points) as published in the BOE for the current half-year; please verify the exact figure applicable to the period.`,
      "",
      `We request payment of the total above within 15 days of this letter. Failing that, we reserve the right to claim the fixed EUR 40 recovery compensation and to pursue the debt through the courts.`,
      "",
      `Yours faithfully,`,
      p.businessName,
    ].join("\n");
  }

  return [
    `${p.businessName}`,
    `${formatDate(p.today)}`,
    "",
    `A la atención de: ${p.clientName}`,
    "",
    `Asunto: Factura ${p.invoiceNumber} impagada — requerimiento y reclamación de intereses de demora`,
    "",
    `Muy señores míos:`,
    "",
    `La factura ${p.invoiceNumber}, emitida el ${formatDate(p.issueDate)} y con vencimiento el ${formatDate(p.dueDate)}, continúa impagada ${p.daysOverdue} día(s) después de su vencimiento.`,
    "",
    `Conforme a la Ley 3/2004, de 29 de diciembre, por la que se establecen medidas de lucha contra la morosidad en las operaciones comerciales, el interés de demora se devenga automáticamente, sin necesidad de aviso previo, desde el día siguiente al de vencimiento.`,
    "",
    `Principal pendiente:        ${formatEUR(p.outstanding)}`,
    `Intereses de demora:       ${formatEUR(interest)}  (${p.annualRatePct}% anual, ${p.daysOverdue} días)`,
    `Total reclamado:           ${formatEUR(totalClaim)}`,
    "",
    `El tipo aplicado es el interés legal de demora (tipo de referencia del BCE + 8 puntos porcentuales) publicado en el BOE para el semestre en curso; verifique la cifra exacta aplicable al periodo.`,
    "",
    `Les requerimos el pago del importe total indicado en el plazo de 15 días desde la presente. En caso contrario, nos reservamos el derecho a reclamar la indemnización fija de 40 € por costes de cobro y a reclamar la deuda por vía judicial.`,
    "",
    `Atentamente,`,
    p.businessName,
  ].join("\n");
}
