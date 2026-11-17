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
    // So "Tuesday at 4" can be turned into a date
    today: new Date(`${me.today}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    today_iso: me.today,
    name: me.user.display_name,
    preferred_language: me.user.preferred_language || "en",
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
      id: x.medicationId,
      controlled_new_prescription_each_fill: x.controlled,
      pharmacy: x.pharmacy,
      prescription_sent: !!x.rxSentOn,
      ask_prescriber_by: x.nextAction === "request_rx" ? x.requestRxBy : null,
      nickname: x.label, days_left: x.daysLeft, runs_out: spokenDay(x.supplyEndDate),
      book_visit_by: x.visitBooked ? null : spokenDay(x.bookApptBy), daily_reminder_at: x.reminderTime,
    })),
    upcoming_appointments: me.appointments.map((a: any) => ({
      provider: a.provider_name, type: a.provider_type, when: spokenWhen(a.slot_start), video: a.telehealth, repeats: !!a.recurring,
    })),
    // The person's own providers. They book on that site or by phone; you can't book for them, but you can save a visit they booked (add_visit).
    care_team: me.careTeam.map((c) => ({
      who: c.provider_name || `their ${c.role}`, role: c.role,
      books_through: c.source_site === "zocdoc" ? "Zocdoc" : c.source_site === "grow" ? "Grow Therapy" : c.source_site === "psychologytoday" ? "Psychology Today" : c.source_site === "therapyden" ? "TherapyDen" : c.booking_url ? "a booking link" : c.phone ? "phone" : null,
    })),
  });
}
