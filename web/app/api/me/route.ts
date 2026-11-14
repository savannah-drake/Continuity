// app/api/me/route.ts
// GET /api/me?userId=1 -> everything the home dashboard and timeline need for one user.
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { computeTimeline, computeTherapyTimeline, diffDays } from "@/lib/engine";

const todayET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export async function GET(req: NextRequest) {
  const userId = Number(req.nextUrl.searchParams.get("userId"));
  if (!userId) return Response.json({ error: "missing_user" }, { status: 400 });
  const today = todayET();

  const users = await query(
`SELECT u.user_id, u.display_name, u.insurance_plan, u.care_type, to_char(u.last_therapy_session, 'YYYY-MM-DD') AS last_therapy_session, u.therapy_cadence_days
FROM users u
WHERE u.user_id = $1`,
    [userId],
  );
  const user = users[0];
  if (!user) return Response.json({ error: "not_found" }, { status: 404 });

  const meds = await query(
`SELECT m.display_label, m.days_supply_remaining, to_char(m.supply_as_of, 'YYYY-MM-DD') AS supply_as_of, p.refills_remaining, to_char(p.rx_expires_on, 'YYYY-MM-DD') AS rx_expires_on, p.requires_appointment_for_renewal, p.booking_lead_days
FROM medications m
JOIN prescriptions p ON p.medication_id = m.medication_id
WHERE m.user_id = $1
ORDER BY m.medication_id DESC
LIMIT 1`,
    [userId],
  );

  const appointments = await query(
`SELECT DISTINCT s.slot_id, s.slot_start, s.duration_min, s.telehealth, p.provider_name, p.provider_type, p.specialty
FROM booking_events b
JOIN appointment_slots s ON s.slot_id = b.slot_id
JOIN providers p ON p.provider_id = s.provider_id
WHERE b.user_id = $1
AND b.event_type = 'confirmed'
AND s.slot_status = 'booked'
AND s.slot_start > now()
ORDER BY s.slot_start
LIMIT 5`,
    [userId],
  );
  const apptDate = (a: any) => new Date(a.slot_start).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  let medication = null;
  if (meds[0]) {
    const m = meds[0];
    const t = computeTimeline(
      { daysSupplyRemaining: m.days_supply_remaining, supplyAsOf: m.supply_as_of, refillsRemaining: m.refills_remaining,
        rxExpiresOn: m.rx_expires_on, requiresAppointmentForRenewal: m.requires_appointment_for_renewal,
        bookingLeadDays: m.booking_lead_days ?? 14 },
      today,
    );
    // A psychiatry visit booked on or before the appointment deadline satisfies the renewal step
    const psychVisit = t.apptBy
      ? appointments.find((a: any) => a.provider_type === "psychiatrist" && apptDate(a) <= t.apptBy!)
      : undefined;
    medication = {
      label: m.display_label || "Your medication",
      daysLeft: Math.max(0, diffDays(today, t.supplyEndDate)),
      ...t,
      visitBooked: !!psychVisit,
      nextAction: psychVisit ? "visit_booked" : t.nextAction,
      status: psychVisit ? "green" : t.status,
    };
  }

  let therapy = null;
  if (user.last_therapy_session && user.therapy_cadence_days) {
    const t = computeTherapyTimeline({ lastSessionDate: user.last_therapy_session, cadenceDays: user.therapy_cadence_days }, today);
    const session = appointments.find((a: any) => a.provider_type !== "psychiatrist" && apptDate(a) <= t.nextSessionBy);
    therapy = { ...t, sessionBooked: !!session, nextAction: session ? "visit_booked" : t.nextAction, status: session ? "green" : t.status };
  }

  return Response.json({ today, user, medication, therapy, appointments });
}
