// lib/medications.ts: add, edit and remove a user's medications, and keep their Google Calendar reminders in step:
// - a daily "Take <med>" reminder at the time they pick
// - a "Book your visit by <date>" deadline when a renewal visit is needed (moves when dates change, removed once a visit is scheduled)
import type { PoolClient } from "pg";
import { pool, query } from "./db";
import { getConnection, createEvent, updateEvent, deleteEvent } from "./google";
import { getMe } from "./me";

export type MedInput = {
  label: string;
  daysSupplyRemaining: number;
  refillsRemaining: number;
  rxExpiresOn?: string | null;
  requiresAppointmentForRenewal: boolean;
  bookingLeadDays: number;
  reminderTime?: string | null; // "HH:MM" (24h) or null for no daily reminder
};

const todayET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const validTime = (t?: string | null) => (t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null);

export function cleanMed(raw: any): MedInput | null {
  const label = String(raw?.label ?? "").trim().slice(0, 80);
  const days = Number(raw?.daysSupplyRemaining);
  if (!label || !Number.isFinite(days) || days < 0 || days > 365) return null;
  return {
    label,
    daysSupplyRemaining: Math.round(days),
    refillsRemaining: Math.max(0, Math.min(20, Math.round(Number(raw?.refillsRemaining) || 0))),
    rxExpiresOn: /^\d{4}-\d{2}-\d{2}$/.test(raw?.rxExpiresOn ?? "") ? raw.rxExpiresOn : null,
    requiresAppointmentForRenewal: raw?.requiresAppointmentForRenewal !== false,
    bookingLeadDays: Math.max(1, Math.min(120, Math.round(Number(raw?.bookingLeadDays) || 14))),
    reminderTime: validTime(raw?.reminderTime),
  };
}

// Adds a medication, or updates the one with the same name (so redoing setup doesn't duplicate it)
export async function upsertMedication(userId: number, m: MedInput, db: PoolClient | typeof pool = pool) {
  const existing = await db.query(
`SELECT m.medication_id
FROM medications m
WHERE m.user_id = $1
AND m.active
AND lower(m.display_label) = lower($2)
LIMIT 1`, [userId, m.label]);
  if (existing.rows[0]) {
    await updateMedication(userId, existing.rows[0].medication_id, m, db);
    return existing.rows[0].medication_id as number;
  }
  const med = await db.query(
`INSERT INTO medications (user_id, display_label, days_supply_remaining, supply_as_of, reminder_time)
VALUES ($1, $2, $3, $4, $5)
RETURNING medication_id`, [userId, m.label, m.daysSupplyRemaining, todayET(), m.reminderTime ?? null]);
  await db.query(
`INSERT INTO prescriptions (medication_id, refills_remaining, rx_expires_on, requires_appointment_for_renewal, booking_lead_days)
VALUES ($1, $2, $3, $4, $5)`,
    [med.rows[0].medication_id, m.refillsRemaining, m.rxExpiresOn || null, m.requiresAppointmentForRenewal, m.bookingLeadDays]);
  return med.rows[0].medication_id as number;
}

export async function updateMedication(userId: number, medicationId: number, m: MedInput, db: PoolClient | typeof pool = pool) {
  const r = await db.query(
`UPDATE medications
SET display_label = $3, days_supply_remaining = $4, supply_as_of = $5, reminder_time = $6
WHERE medication_id = $2
AND user_id = $1
RETURNING medication_id`, [userId, medicationId, m.label, m.daysSupplyRemaining, todayET(), m.reminderTime ?? null]);
  if (!r.rowCount) return false;
  await db.query(
`UPDATE prescriptions
SET refills_remaining = $2, rx_expires_on = $3, requires_appointment_for_renewal = $4, booking_lead_days = $5
WHERE medication_id = $1`, [medicationId, m.refillsRemaining, m.rxExpiresOn || null, m.requiresAppointmentForRenewal, m.bookingLeadDays]);
  return true;
}

export async function removeMedication(userId: number, medicationId: number) {
  const [row] = await query<{ reminder_event_id: string | null; book_by_event_id: string | null }>(
`UPDATE medications
SET active = false
WHERE medication_id = $2
AND user_id = $1
RETURNING reminder_event_id, book_by_event_id`, [userId, medicationId]);
  if (!row) return false;
  for (const id of [row.reminder_event_id?.split("#")[0], row.book_by_event_id]) {
    if (id) await deleteEvent(userId, id).catch((e) => console.error("remove reminder failed", e));
  }
  return true;
}

// Bring Google Calendar reminders in line with the current medications and timeline. Safe to call often.
export async function syncMedReminders(userId: number) {
  if (!(await getConnection(userId))) return { synced: false };
  const me = await getMe(userId);
  if (!me) return { synced: false };
  const rows = await query<{ medication_id: number; reminder_event_id: string | null; reminder_time: string | null; book_by_event_id: string | null; book_by_date: string | null }>(
`SELECT m.medication_id, m.reminder_event_id, m.reminder_time, m.book_by_event_id, to_char(m.book_by_date, 'YYYY-MM-DD') AS book_by_date
FROM medications m
WHERE m.user_id = $1
AND m.active`, [userId]);

  for (const row of rows) {
    const med = me.medications.find((x) => x.medicationId === row.medication_id);
    if (!med) continue;

    // 1) Daily "take your medication" reminder. Re-created when the time changes (simplest way to move a series).
    const wantTime = validTime(row.reminder_time);
    const [hh, mm] = (wantTime ?? "00:00").split(":").map(Number);
    const reminderKey = wantTime ? `${wantTime}` : null;
    try {
      if (row.reminder_event_id && (!reminderKey || !row.reminder_event_id.endsWith(`#${reminderKey}`))) {
        await deleteEvent(userId, row.reminder_event_id.split("#")[0]);
        await query(
`UPDATE medications
SET reminder_event_id = NULL
WHERE medication_id = $1`, [row.medication_id]);
        row.reminder_event_id = null;
      }
      if (reminderKey && !row.reminder_event_id) {
        const start = etDateTime(me.today, hh, mm);
        const id = await createEvent(userId, {
          title: `Take ${med.label}`, details: "Daily reminder from Continuity. Change or turn it off in the app.",
          start, durationMin: 5, rrule: "RRULE:FREQ=DAILY", reminderMinutes: [0],
        });
        if (id) await query(
`UPDATE medications
SET reminder_event_id = $2
WHERE medication_id = $1`, [row.medication_id, `${id}#${reminderKey}`]);
      }
    } catch (e) { console.error("daily reminder sync failed", e); }

    // 2) "Book your visit by" deadline, only while a visit still needs booking
    const needsBooking = med.bookApptBy && !med.visitBooked && (med.nextAction === "book_appointment" || med.nextAction === "book_today");
    const wantDate = needsBooking ? (med.bookApptBy as string) : null;
    try {
      if (!wantDate && row.book_by_event_id) {
        await deleteEvent(userId, row.book_by_event_id);
        await query(
`UPDATE medications
SET book_by_event_id = NULL, book_by_date = NULL
WHERE medication_id = $1`, [row.medication_id]);
      } else if (wantDate && wantDate !== row.book_by_date) {
        const visit = {
          title: `Book your visit for ${med.label}`,
          details: `Book a visit with your prescriber by today so your ${med.label} refill doesn't lapse. Open Continuity to find a time that fits.`,
          start: etDateTime(wantDate, 9, 0), durationMin: 15, reminderMinutes: [3 * 24 * 60, 0],
        };
        if (row.book_by_event_id) await updateEvent(userId, row.book_by_event_id, visit);
        const id = row.book_by_event_id ?? (await createEvent(userId, visit));
        await query(
`UPDATE medications
SET book_by_event_id = $2, book_by_date = $3
WHERE medication_id = $1`, [row.medication_id, id, wantDate]);
      }
    } catch (e) { console.error("booking deadline sync failed", e); }
  }
  return { synced: true };
}

// A wall-clock time in New York on a given day, as a Date
export function etDateTime(day: string, hour: number, minute: number) {
  // Try both possible offsets (EST/EDT) and keep the one that reads back as the wanted local time
  for (const off of ["-05:00", "-04:00"]) {
    const d = new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${off}`);
    const local = d.toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    if (local === `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`) return d;
  }
  return new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-05:00`);
}
