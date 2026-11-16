// lib/me.ts
// Everything known about one user's care plan: used by /api/me (web) and /api/agent/status (voice agent).
// v2: every active medication gets its own timeline (Home leads with whichever runs out first),
// plus your care team and upcoming visits (one-off or recurring).
import { query } from "./db";
import { computeTimeline, computeTherapyTimeline, diffDays } from "./engine";

const todayET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const dayET = (d: Date | string) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const WEEK = 7 * 24 * 3600 * 1000;

export type CareMember = {
  member_id: number; provider_name: string | null; source_site: string | null; role: string;
  phone: string | null; booking_url: string | null; video: boolean; notes: string | null;
};

export type VisitOccurrence = {
  visit_id: number; member_id: number | null; starts_at: string; duration_min: number; video: boolean;
  repeat_every_weeks: number | null; provider_name: string | null; source_site: string | null; role: string | null;
};

// Upcoming occurrences of one-off and recurring visits (next 90 days)
export function expandVisits(rows: (Omit<VisitOccurrence, "starts_at"> & { starts_at: string; repeat_until: string | null })[], limit = 8) {
  const now = Date.now();
  const horizon = now + 90 * 24 * 3600 * 1000;
  const out: VisitOccurrence[] = [];
  for (const v of rows) {
    const first = new Date(v.starts_at).getTime();
    const until = v.repeat_until ? new Date(`${v.repeat_until}T23:59:59-05:00`).getTime() : Infinity;
    if (!v.repeat_every_weeks) {
      if (first > now) out.push({ ...v, starts_at: new Date(first).toISOString() });
      continue;
    }
    const step = v.repeat_every_weeks * WEEK;
    // jump to the first occurrence after now, then walk forward
    let t = first > now ? first : first + Math.ceil((now - first) / step) * step;
    for (; t <= horizon && t <= until; t += step) out.push({ ...v, starts_at: new Date(t).toISOString() });
  }
  return out.sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, limit);
}

export async function getMe(userId: number) {
  const today = todayET();

  const users = await query(
`SELECT u.user_id, u.display_name, u.email, u.auto_import_visits, u.insurance_plan, u.care_type, u.home_lat, u.home_lng, u.home_zip, u.preferred_language, to_char(u.last_therapy_session, 'YYYY-MM-DD') AS last_therapy_session, u.therapy_cadence_days
FROM users u
WHERE u.user_id = $1`,
    [userId],
  );
  const user = users[0];
  if (!user) return null;

  const meds = await query(
`SELECT m.medication_id, m.display_label, m.days_supply_remaining, to_char(m.supply_as_of, 'YYYY-MM-DD') AS supply_as_of, m.reminder_time, p.refills_remaining, to_char(p.rx_expires_on, 'YYYY-MM-DD') AS rx_expires_on, p.requires_appointment_for_renewal, p.booking_lead_days
FROM medications m
JOIN prescriptions p ON p.medication_id = m.medication_id
WHERE m.user_id = $1
AND m.active
ORDER BY m.supply_as_of + m.days_supply_remaining, m.medication_id`,
    [userId],
  );

  // Your own providers and the visits you scheduled with them
  const careTeam = await query<CareMember>(
`SELECT c.member_id, c.provider_name, c.source_site, c.role, c.phone, c.booking_url, c.video, c.notes
FROM care_team c
WHERE c.user_id = $1
ORDER BY c.created_at`,
    [userId],
  ).catch(() => [] as CareMember[]); // before v2-accounts.sql has been run
  const visitRows = await query(
`SELECT v.visit_id, v.member_id, v.starts_at, v.duration_min, v.video, v.repeat_every_weeks, v.source, to_char(v.repeat_until, 'YYYY-MM-DD') AS repeat_until, c.provider_name, c.source_site, c.role
FROM visits v
LEFT JOIN care_team c ON c.member_id = v.member_id
WHERE v.user_id = $1
AND v.status = 'scheduled'`,
    [userId],
  ).catch(() => []);
  const visits = expandVisits(visitRows as any);

  // One list of upcoming appointments for Home, Timeline and the agent
  const appointments = [
    ...visits.map((v) => ({
      slot_id: null, visit_id: v.visit_id, slot_start: v.starts_at, duration_min: v.duration_min, telehealth: v.video,
      provider_name: v.provider_name || siteLabel(v.source_site, v.role), provider_type: v.role === "psychiatrist" ? "psychiatrist" : "therapist",
      specialty: null, recurring: !!v.repeat_every_weeks, source: "care_team", imported: (v as any).source === "imported",
    })),
  ].sort((a, b) => String(a.slot_start).localeCompare(String(b.slot_start))).slice(0, 8);

  const medications = meds.map((m: any) => {
    const t = computeTimeline(
      { daysSupplyRemaining: m.days_supply_remaining, supplyAsOf: m.supply_as_of, refillsRemaining: m.refills_remaining,
        rxExpiresOn: m.rx_expires_on, requiresAppointmentForRenewal: m.requires_appointment_for_renewal,
        bookingLeadDays: m.booking_lead_days ?? 14 },
      today,
    );
    // Never show a date that already passed. If the ideal book-by date is gone, it's "book now"; if the ideal visit
    // date is gone too, the goal becomes a visit before the supply runs out (or as soon as possible).
    if (t.bookApptBy && t.bookApptBy < today) t.bookApptBy = today;
    if (t.apptBy && t.apptBy < today) t.apptBy = t.supplyEndDate > today ? t.supplyEndDate : today;
    // A psychiatry visit on or before the appointment deadline satisfies the renewal step
    const psychVisit = t.apptBy
      ? appointments.find((a: any) => a.provider_type === "psychiatrist" && dayET(a.slot_start) <= t.apptBy!)
      : undefined;
    return {
      medicationId: m.medication_id as number,
      label: m.display_label || "Your medication",
      reminderTime: (m.reminder_time as string | null) ?? null,
      refillsRemaining: Number(m.refills_remaining ?? 0),
      rxExpiresOn: (m.rx_expires_on as string | null) ?? null,
      requiresAppointmentForRenewal: Boolean(m.requires_appointment_for_renewal),
      bookingLeadDays: Number(m.booking_lead_days ?? 14),
      daysLeft: Math.max(0, diffDays(today, t.supplyEndDate)),
      ...t,
      visitBooked: !!psychVisit,
      nextAction: psychVisit ? "visit_booked" : t.nextAction,
      status: psychVisit ? "green" : t.status,
    };
  });

  let therapy = null;
  if (user.last_therapy_session && user.therapy_cadence_days) {
    const t = computeTherapyTimeline({ lastSessionDate: user.last_therapy_session, cadenceDays: user.therapy_cadence_days }, today);
    const session = appointments.find((a: any) => a.provider_type !== "psychiatrist" && dayET(a.slot_start) <= t.nextSessionBy);
    therapy = { ...t, sessionBooked: !!session, nextAction: session ? "visit_booked" : t.nextAction, status: session ? "green" : t.status };
  }

  return {
    today, user, needsOnboarding: !user.insurance_plan,
    medication: medications[0] ?? null, // the one that runs out first (Home leads with it)
    medications, therapy, appointments, careTeam,
  };
}

export const SITES: Record<string, string> = {
  zocdoc: "Zocdoc", grow: "Grow Therapy", psychologytoday: "Psychology Today", therapyden: "TherapyDen", timelycare: "TimelyCare",
};
export function siteLabel(site: string | null, role?: string | null) {
  const who = role === "psychiatrist" ? "psychiatrist" : "therapist";
  return site && SITES[site] ? `Your ${who} (${SITES[site]})` : `Your ${who}`;
}
