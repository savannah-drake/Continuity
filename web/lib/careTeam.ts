// lib/careTeam.ts: your own providers (found on Zocdoc, Grow Therapy, Psychology Today or anywhere) and the
// visits you schedule with them. Visits, including recurring ones, are mirrored to Google Calendar when it's connected.
import { query } from "./db";
import { getConnection, createEvent, updateEvent, deleteEvent } from "./google";
import { syncMedReminders } from "./medications";
import { siteLabel } from "./me";

export const ROLES = ["psychiatrist", "therapist", "other"] as const;

// Which site a booking link is from (for the label and the Book button)
export function siteFromUrl(url?: string | null) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.endsWith("zocdoc.com")) return "zocdoc";
    if (host.endsWith("growtherapy.com")) return "grow";
    if (host.endsWith("psychologytoday.com")) return "psychologytoday";
    if (host.endsWith("timelycare.com")) return "timelycare";
    return "other";
  } catch { return null; }
}

export function cleanUrl(raw: unknown) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, 500) : null;
  } catch { return null; }
}

export function cleanMember(b: any) {
  const bookingUrl = cleanUrl(b?.bookingUrl);
  const role = ROLES.includes(b?.role) ? b.role : "therapist";
  const name = String(b?.providerName ?? "").trim().slice(0, 80) || null;
  const phone = String(b?.phone ?? "").replace(/[^\d+()\- ]/g, "").slice(0, 25) || null;
  if (!name && !bookingUrl && !phone) return null; // need at least one way to reach them
  return {
    providerName: name, role, phone, bookingUrl,
    sourceSite: siteFromUrl(bookingUrl),
    video: !!b?.video,
    notes: String(b?.notes ?? "").trim().slice(0, 300) || null,
  };
}

export async function addMember(userId: number, m: NonNullable<ReturnType<typeof cleanMember>>) {
  const [row] = await query<{ member_id: number }>(
`INSERT INTO care_team (user_id, provider_name, source_site, role, phone, booking_url, video, notes)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING member_id`, [userId, m.providerName, m.sourceSite, m.role, m.phone, m.bookingUrl, m.video, m.notes]);
  return row.member_id;
}

export async function updateMember(userId: number, memberId: number, m: NonNullable<ReturnType<typeof cleanMember>>) {
  const rows = await query(
`UPDATE care_team
SET provider_name = $3, source_site = $4, role = $5, phone = $6, booking_url = $7, video = $8, notes = $9
WHERE member_id = $2
AND user_id = $1
RETURNING member_id`, [userId, memberId, m.providerName, m.sourceSite, m.role, m.phone, m.bookingUrl, m.video, m.notes]);
  return rows.length > 0;
}

export async function removeMember(userId: number, memberId: number) {
  // Their future visits come off the calendar too
  const visits = await query<{ visit_id: number }>(
`SELECT v.visit_id
FROM visits v
WHERE v.user_id = $1
AND v.member_id = $2
AND v.status = 'scheduled'`, [userId, memberId]);
  for (const v of visits) await cancelVisit(userId, v.visit_id);
  const rows = await query(
`DELETE FROM care_team
WHERE member_id = $2
AND user_id = $1
RETURNING member_id`, [userId, memberId]);
  return rows.length > 0;
}

export type VisitInput = {
  memberId: number; startsAt: Date; durationMin: number; video: boolean;
  repeatEveryWeeks: number | null; repeatUntil: string | null;
};

export function cleanVisit(b: any): VisitInput | null {
  const startsAt = new Date(b?.startsAt);
  const memberId = Number(b?.memberId);
  if (!Number.isInteger(memberId) || memberId <= 0 || Number.isNaN(startsAt.getTime())) return null;
  const weeks = Number(b?.repeatEveryWeeks);
  return {
    memberId, startsAt,
    durationMin: Math.max(10, Math.min(240, Math.round(Number(b?.durationMin) || 50))),
    video: !!b?.video,
    repeatEveryWeeks: Number.isInteger(weeks) && weeks >= 1 && weeks <= 12 ? weeks : null,
    repeatUntil: /^\d{4}-\d{2}-\d{2}$/.test(b?.repeatUntil ?? "") ? b.repeatUntil : null,
  };
}

async function memberFor(userId: number, memberId: number) {
  const [m] = await query<{ member_id: number; provider_name: string | null; source_site: string | null; role: string; phone: string | null; booking_url: string | null }>(
`SELECT c.member_id, c.provider_name, c.source_site, c.role, c.phone, c.booking_url
FROM care_team c
WHERE c.user_id = $1
AND c.member_id = $2`, [userId, memberId]);
  return m ?? null;
}

function calendarVisit(m: NonNullable<Awaited<ReturnType<typeof memberFor>>>, v: VisitInput) {
  const who = m.provider_name || siteLabel(m.source_site, m.role);
  const details = [
    v.video ? "Video visit." : "In-person visit.",
    m.phone ? `Phone: ${m.phone}` : null,
    m.booking_url ? `Booking: ${m.booking_url}` : null,
    "Added by Continuity.",
  ].filter(Boolean).join("\n");
  return {
    title: `${m.role === "psychiatrist" ? "Psychiatry" : m.role === "therapist" ? "Therapy" : "Visit"} with ${who}`,
    details, start: v.startsAt, durationMin: v.durationMin,
    repeatEveryWeeks: v.repeatEveryWeeks, repeatUntil: v.repeatUntil,
  };
}

export async function addVisit(userId: number, v: VisitInput) {
  const m = await memberFor(userId, v.memberId);
  if (!m) return { ok: false as const, reason: "unknown_provider" };
  let eventId: string | null = null;
  let calendar: "added" | "not_connected" | "failed" = "not_connected";
  if (await getConnection(userId)) {
    try { eventId = await createEvent(userId, calendarVisit(m, v)); calendar = eventId ? "added" : "failed"; }
    catch (e) { console.error("add visit to calendar failed", e); calendar = "failed"; }
  }
  const [row] = await query<{ visit_id: number }>(
`INSERT INTO visits (user_id, member_id, starts_at, duration_min, video, repeat_every_weeks, repeat_until, google_event_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING visit_id`,
    [userId, v.memberId, v.startsAt.toISOString(), v.durationMin, v.video, v.repeatEveryWeeks, v.repeatUntil, eventId]);
  await syncMedReminders(userId).catch((e) => console.error("reminder sync failed", e)); // a visit can clear a "book by" deadline
  return { ok: true as const, visitId: row.visit_id, calendar };
}

export async function updateVisit(userId: number, visitId: number, v: VisitInput) {
  const m = await memberFor(userId, v.memberId);
  if (!m) return false;
  const [row] = await query<{ google_event_id: string | null }>(
`UPDATE visits
SET member_id = $3, starts_at = $4, duration_min = $5, video = $6, repeat_every_weeks = $7, repeat_until = $8
WHERE visit_id = $2
AND user_id = $1
RETURNING google_event_id`,
    [userId, visitId, v.memberId, v.startsAt.toISOString(), v.durationMin, v.video, v.repeatEveryWeeks, v.repeatUntil]);
  if (!row) return false;
  if (row.google_event_id) await updateEvent(userId, row.google_event_id, calendarVisit(m, v)).catch((e) => console.error("update visit on calendar failed", e));
  await syncMedReminders(userId).catch(() => {});
  return true;
}

export async function cancelVisit(userId: number, visitId: number) {
  const [row] = await query<{ google_event_id: string | null }>(
`UPDATE visits
SET status = 'cancelled'
WHERE visit_id = $2
AND user_id = $1
RETURNING google_event_id`, [userId, visitId]);
  if (!row) return false;
  if (row.google_event_id) await deleteEvent(userId, row.google_event_id).catch((e) => console.error("remove visit from calendar failed", e));
  await syncMedReminders(userId).catch(() => {});
  return true;
}
