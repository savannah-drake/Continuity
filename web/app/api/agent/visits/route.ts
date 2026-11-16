// POST /api/agent/visits (agent only, x-agent-key): the caller says they booked a visit ("therapy Tuesday at 4, every two weeks").
// Body {userId, role: "therapist"|"psychiatrist", who?, date: "YYYY-MM-DD", time: "HH:MM" (24h, Eastern), durationMin?, video?, repeatEveryWeeks?}
// Uses the matching person on their care team (by name, or the only one with that role), or adds them. Goes on Google Calendar too.
import { query } from "@/lib/db";
import { agentAuthorized, unauthorized, spokenWhen } from "@/lib/agentApi";
import { addMember, addVisit, cleanVisit } from "@/lib/careTeam";
import { etDateTime } from "@/lib/medications";

export async function POST(req: Request) {
  if (!agentAuthorized(req)) return unauthorized();
  const b = await req.json().catch(() => null);
  const userId = Number(b?.userId);
  const role = b?.role === "psychiatrist" ? "psychiatrist" : b?.role === "therapist" ? "therapist" : null;
  const time = /^(\d{1,2}):(\d{2})$/.exec(b?.time ?? "");
  if (!Number.isInteger(userId) || userId <= 0 || !role || !/^\d{4}-\d{2}-\d{2}$/.test(b?.date ?? "") || !time) {
    return Response.json({ added: false, reason: "bad_request" }, { status: 400 });
  }
  const startsAt = etDateTime(b.date, Number(time[1]), Number(time[2]));
  if (!startsAt || startsAt.getTime() < Date.now() - 3600e3) return Response.json({ added: false, reason: "in_the_past" });

  const who = typeof b?.who === "string" ? b.who.trim().slice(0, 80) : "";
  const team = await query<{ member_id: number; provider_name: string | null; role: string }>(
`SELECT c.member_id, c.provider_name, c.role
FROM care_team c
WHERE c.user_id = $1`, [userId]);
  const bare = (s: string) => s.toLowerCase().replace(/^dr\.?\s+/, "");
  const byName = who ? team.find((m) => m.provider_name && (bare(m.provider_name).includes(bare(who)) || bare(who).includes(bare(m.provider_name)))) : undefined;
  const byRole = team.filter((m) => m.role === role);
  const memberId = byName?.member_id
    ?? (!who && byRole.length === 1 ? byRole[0].member_id : null)
    ?? (await addMember(userId, { providerName: who || null, role, phone: null, bookingUrl: null, sourceSite: null, video: !!b?.video, notes: null }));

  const v = cleanVisit({ memberId, startsAt: startsAt.toISOString(), durationMin: b?.durationMin, video: b?.video, repeatEveryWeeks: b?.repeatEveryWeeks });
  if (!v) return Response.json({ added: false, reason: "bad_request" }, { status: 400 });
  const r = await addVisit(userId, v);
  return Response.json(r.ok
    ? { added: true, when: spokenWhen(startsAt.toISOString()), on_google_calendar: r.calendar === "added", repeats_every_weeks: v.repeatEveryWeeks }
    : { added: false, reason: r.reason });
}
