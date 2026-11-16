// app/api/agent/status/route.ts
// GET /api/agent/status?userId=1 -> a short, speakable summary of the caller's care plan.
import { NextRequest } from "next/server";
import { getMe } from "@/lib/me";
import { agentAuthorized, unauthorized, spokenDay, spokenWhen } from "@/lib/agentApi";

export async function GET(req: NextRequest) {
  if (!agentAuthorized(req)) return unauthorized();
  const me = await getMe(Number(req.nextUrl.searchParams.get("userId")));
  if (!me) return Response.json({ error: "not_found" }, { status: 404 });

  const m = me.medication;
  const t = me.therapy;
  return Response.json({
    name: me.user.display_name,
    insurance_plan: me.user.insurance_plan,
    medication: m && {
      nickname: m.label,
      days_left: m.daysLeft,
      runs_out: spokenDay(m.supplyEndDate),
      needs_renewal_visit: !!m.bookApptBy,
      renewal_reason: m.renewalReason,
      book_psychiatry_visit_by: m.visitBooked ? null : spokenDay(m.bookApptBy),
      psychiatry_visit_must_happen_by: spokenDay(m.apptBy),
      psychiatry_visit_booked: m.visitBooked,
      status: m.status,
    },
    therapy: t && {
      next_session_by: spokenDay(t.nextSessionBy),
      book_by: t.sessionBooked ? null : spokenDay(t.bookBy),
      session_booked: t.sessionBooked,
    },
    // Every active medication (the first one runs out soonest)
    all_medications: me.medications.map((x) => ({
      nickname: x.label, days_left: x.daysLeft, runs_out: spokenDay(x.supplyEndDate),
      book_visit_by: x.visitBooked ? null : spokenDay(x.bookApptBy), daily_reminder_at: x.reminderTime,
    })),
    upcoming_appointments: me.appointments.map((a: any) => ({
      provider: a.provider_name, type: a.provider_type, when: spokenWhen(a.slot_start), video: a.telehealth, repeats: !!a.recurring,
    })),
    // The person's own providers. To book with them, they use the link or phone in the app (you can't book these yourself).
    care_team: me.careTeam.map((c) => ({
      who: c.provider_name || `their ${c.role}`, role: c.role,
      books_through: c.source_site === "zocdoc" ? "Zocdoc" : c.source_site === "grow" ? "Grow Therapy" : c.source_site === "psychologytoday" ? "Psychology Today" : c.booking_url ? "a booking link" : c.phone ? "phone" : null,
    })),
  });
}
