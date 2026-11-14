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
    upcoming_appointments: me.appointments.map((a: any) => ({
      provider: a.provider_name, type: a.provider_type, when: spokenWhen(a.slot_start), video: a.telehealth,
    })),
  });
}
