// lib/importVisits.ts: auto-import visits from booking confirmations on Google Calendar (OFF unless the user turns it on).
// Zocdoc, Grow Therapy, Psychology Today, TherapyDen and TimelyCare usually put a calendar invite on your calendar.
// We look only for events that mention one of those sites, or the name of someone on your care team.
// Nothing from the event (title, description, place) is stored: only the time, length, who it's with, and the event id
// (so it's imported once). Events Continuity created itself are skipped.
import { query } from "./db";
import { listEvents, type CalEvent } from "./google";

const SITE_PATTERNS: [string, RegExp][] = [
  ["zocdoc", /zocdoc/i],
  ["grow", /grow ?therapy|growtherapy\.com/i],
  ["psychologytoday", /psychology ?today|psychologytoday\.com/i],
  ["therapyden", /therapy ?den|therapyden\.com/i],
  ["timelycare", /timely ?care|timelycare\.com/i],
];
const WEEK = 7 * 24 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;

type Member = { member_id: number; provider_name: string | null; source_site: string | null; role: string; video: boolean };

const text = (e: CalEvent) => [e.summary, e.description, e.location, e.organizer?.email].filter(Boolean).join(" \n ");

function matchEvent(e: CalEvent, team: Member[]) {
  const t = text(e);
  // A care team member by name ("Dr. Amelia Reyes" in the title or invite)
  const byName = team.find((m) => m.provider_name && m.provider_name.replace(/^dr\.?\s+/i, "").length >= 4
    && t.toLowerCase().includes(m.provider_name.replace(/^dr\.?\s+/i, "").toLowerCase()));
  if (byName) return { member: byName, site: byName.source_site };
  const site = SITE_PATTERNS.find(([, re]) => re.test(t))?.[0] ?? null;
  if (!site) return null;
  // Someone on the team booked through that site
  const bySite = team.filter((m) => m.source_site === site);
  return { member: bySite.length === 1 ? bySite[0] : null, site };
}

const guessRole = (e: CalEvent) => (/psychiatr|medication management|med management|psychiatric/i.test(text(e)) ? "psychiatrist" : "therapist");
const guessVideo = (e: CalEvent) => /video|telehealth|virtual|zoom|google meet|doxy/i.test(text(e));

export async function importVisits(userId: number) {
  const [u] = await query<{ auto_import_visits: boolean }>(
`SELECT u.auto_import_visits
FROM users u
WHERE u.user_id = $1`, [userId]).catch(() => []);
  if (!u?.auto_import_visits) return { imported: 0, skipped: "off" as const };

  const from = new Date(Date.now() - DAY);
  const to = new Date(Date.now() + 90 * DAY);
  const events = await listEvents(userId, from, to);
  if (!events) return { imported: 0, skipped: "not_connected" as const };

  const team = await query<Member>(
`SELECT c.member_id, c.provider_name, c.source_site, c.role, c.video
FROM care_team c
WHERE c.user_id = $1`, [userId]);
  // Events Continuity put on the calendar itself (visits and reminders) are never imported back
  const ours = new Set((await query<{ id: string }>(
`SELECT v.google_event_id AS id
FROM visits v
WHERE v.user_id = $1
AND v.google_event_id IS NOT NULL
UNION
SELECT split_part(m.reminder_event_id, '#', 1)
FROM medications m
WHERE m.user_id = $1
AND m.reminder_event_id IS NOT NULL
UNION
SELECT m2.book_by_event_id
FROM medications m2
WHERE m2.user_id = $1
AND m2.book_by_event_id IS NOT NULL`, [userId])).map((r) => r.id));

  // Group instances of a recurring event into one series
  const groups = new Map<string, CalEvent[]>();
  for (const e of events) {
    if (e.status === "cancelled" || !e.start?.dateTime || !e.end?.dateTime) continue; // skip all-day and cancelled
    if (ours.has(e.id) || (e.recurringEventId && ours.has(e.recurringEventId)) || e.source?.title === "Continuity") continue;
    const key = e.recurringEventId || e.id;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  let imported = 0;
  const seen: string[] = [];
  for (const [key, list] of groups) {
    const first = list[0];
    const m = matchEvent(first, team);
    if (!m) continue;
    seen.push(key);

    let member = m.member;
    if (!member) {
      // Booked on a site but nobody from it on the team yet: add them, labeled by the site (no name stored)
      const [row] = await query<Member>(
`INSERT INTO care_team (user_id, source_site, role, video)
VALUES ($1, $2, $3, $4)
RETURNING member_id, provider_name, source_site, role, video`, [userId, m.site, guessRole(first), guessVideo(first)]);
      member = row;
      team.push(row);
    }
    const start = new Date(first.start!.dateTime!);
    const durationMin = Math.max(10, Math.round((new Date(first.end!.dateTime!).getTime() - start.getTime()) / 60000));
    const weeks = list.length > 1 ? Math.round((new Date(list[1].start!.dateTime!).getTime() - start.getTime()) / WEEK) : null;
    const res = await query(
`INSERT INTO visits (user_id, member_id, starts_at, duration_min, video, repeat_every_weeks, source, google_source_event_id)
VALUES ($1, $2, $3, $4, $5, $6, 'imported', $7)
ON CONFLICT (user_id, google_source_event_id) WHERE google_source_event_id IS NOT NULL DO UPDATE SET starts_at = EXCLUDED.starts_at, duration_min = EXCLUDED.duration_min, repeat_every_weeks = EXCLUDED.repeat_every_weeks, status = 'scheduled'
RETURNING (xmax = 0) AS inserted`,
      [userId, member.member_id, start.toISOString(), durationMin, member.video || guessVideo(first), weeks && weeks >= 1 && weeks <= 12 ? weeks : null, key]);
    if (res[0]?.inserted) imported += 1;
  }

  // An imported visit whose invite is gone from the calendar was cancelled or moved away
  await query(
`UPDATE visits
SET status = 'cancelled'
WHERE user_id = $1
AND source = 'imported'
AND status = 'scheduled'
AND starts_at > now()
AND starts_at < $2
AND NOT (google_source_event_id = ANY($3::text[]))`, [userId, to.toISOString(), seen]);

  return { imported };
}
