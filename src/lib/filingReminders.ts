import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { listDeclarations } from "../db/declarations";
import { formatDate } from "./format";
import i18n from "../i18n";
import { deadlineQuarterKey, nextTaxDeadlines, type TaxDeadline } from "./taxCalendar";

/** Days before a filing deadline at which the user gets nagged. Descending so the message can
 * always report the real days-until, while each threshold is deduped independently. */
export const REMINDER_THRESHOLDS = [7, 3, 1] as const;

const SENT_STORAGE_KEY = "automono.filingRemindersSent";

export interface FilingReminder {
  dueDate: string;
  label: string;
  daysUntil: number;
  /** Every `${dueDate}:${threshold}` key now satisfied — the caller persists all of them, so a
   * looser threshold skipped because the app wasn't opened never fires later out of order. */
  sentKeys: string[];
}

function daysUntil(todayIso: string, dueDate: string): number {
  const day = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / day,
  );
}

/** The reminders that should fire today: for each upcoming deadline whose quarter isn't already
 * filed, one entry per 7/3/1-day threshold reached and not yet in `alreadySent`. Pure. */
export function dueFilingReminders(
  todayIso: string,
  deadlines: TaxDeadline[],
  filedQuarterKeys: Set<string>,
  alreadySent: Set<string>,
): FilingReminder[] {
  const reminders: FilingReminder[] = [];
  for (const deadline of deadlines) {
    const days = daysUntil(todayIso, deadline.dueDate);
    if (days < 0) continue;
    if (filedQuarterKeys.has(deadlineQuarterKey(deadline.dueDate))) continue;
    const reached = REMINDER_THRESHOLDS.filter((t) => days <= t);
    const sentKeys = reached.map((t) => `${deadline.dueDate}:${t}`);
    if (sentKeys.length === 0 || sentKeys.every((k) => alreadySent.has(k))) continue;
    reminders.push({ dueDate: deadline.dueDate, label: deadline.label, daysUntil: days, sentKeys });
  }
  return reminders;
}

function readSent(): Set<string> {
  try {
    const raw = localStorage.getItem(SENT_STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Persists `sent`, dropping keys for deadlines already in the past so the list can't grow forever. */
function writeSent(sent: Set<string>, todayIso: string): void {
  const kept = [...sent].filter((key) => key.slice(0, 10) >= todayIso);
  localStorage.setItem(SENT_STORAGE_KEY, JSON.stringify(kept));
}

function notificationBody(reminder: FilingReminder): string {
  const date = formatDate(reminder.dueDate);
  return reminder.daysUntil === 0
    ? i18n.t("reminders.bodyToday", { label: reminder.label, date })
    : i18n.t("reminders.body", { label: reminder.label, count: reminder.daysUntil, date });
}

/** Startup task: nag with an OS notification for any tax deadline now inside a 7/3/1-day window
 * that hasn't been filed yet. Immediate-only (Tauri can't schedule while closed), so it runs on
 * every app open and dedupes via localStorage — mirrors `checkAutoBackup`. Silently no-ops if the
 * user denied notification permission. */
export async function runFilingReminders(): Promise<void> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const deadlines = nextTaxDeadlines(todayIso, 6);
  const sent = readSent();

  const declarations = await listDeclarations();
  const filedQuarterKeys = new Set(
    declarations.filter((d) => d.status === "completed").map((d) => `${d.year}-Q${d.quarter}`),
  );

  const reminders = dueFilingReminders(todayIso, deadlines, filedQuarterKeys, sent);
  if (reminders.length === 0) {
    writeSent(sent, todayIso);
    return;
  }

  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
  if (!granted) return;

  for (const reminder of reminders) {
    sendNotification({ title: i18n.t("reminders.title"), body: notificationBody(reminder) });
    for (const key of reminder.sentKeys) sent.add(key);
  }
  writeSent(sent, todayIso);
}
