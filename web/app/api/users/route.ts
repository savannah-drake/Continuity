// app/api/users/route.ts
// POST /api/users: saves onboarding (user + optional medication/prescription) and returns the timeline.
import { pool } from "@/lib/db";
import { computeTimeline, computeTherapyTimeline } from "@/lib/engine";

const todayET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD

type Body = {
  displayName?: string;
  phone: string;
  insurancePlan: string;
  careType: "psychiatry" | "therapy" | "both";
  medication?: {
    label: string;
    daysSupplyRemaining: number;
    refillsRemaining: number;
    rxExpiresOn?: string | null;
    requiresAppointmentForRenewal: boolean;
    bookingLeadDays: number;
  };
  therapy?: { lastSessionDate: string; cadenceDays: number };
};

export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  if (!b.phone || !b.insurancePlan || !b.careType) {
    return Response.json({ error: "missing_fields" }, { status: 400 });
  }

  const today = todayET();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const u = await client.query(
`INSERT INTO users (phone, display_name, insurance_plan, care_type, last_therapy_session, therapy_cadence_days)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (phone) DO UPDATE SET display_name = EXCLUDED.display_name, insurance_plan = EXCLUDED.insurance_plan, care_type = EXCLUDED.care_type, last_therapy_session = EXCLUDED.last_therapy_session, therapy_cadence_days = EXCLUDED.therapy_cadence_days
RETURNING user_id`,
      [b.phone, b.displayName ?? null, b.insurancePlan, b.careType,
       b.therapy?.lastSessionDate ?? null, b.therapy?.cadenceDays ?? null],
    );
    const userId: number = u.rows[0].user_id;

    let timeline = null;
    if (b.medication && b.careType !== "therapy") {
      const m = b.medication;
      const med = await client.query(
`INSERT INTO medications (user_id, display_label, days_supply_remaining, supply_as_of)
VALUES ($1, $2, $3, $4)
RETURNING medication_id`,
        [userId, m.label, m.daysSupplyRemaining, today],
      );
      await client.query(
`INSERT INTO prescriptions (medication_id, refills_remaining, rx_expires_on, requires_appointment_for_renewal, booking_lead_days)
VALUES ($1, $2, $3, $4, $5)`,
        [med.rows[0].medication_id, m.refillsRemaining, m.rxExpiresOn || null,
         m.requiresAppointmentForRenewal, m.bookingLeadDays],
      );
      timeline = computeTimeline(
        { daysSupplyRemaining: m.daysSupplyRemaining, supplyAsOf: today,
          refillsRemaining: m.refillsRemaining, rxExpiresOn: m.rxExpiresOn || null,
          requiresAppointmentForRenewal: m.requiresAppointmentForRenewal,
          bookingLeadDays: m.bookingLeadDays },
        today,
      );
    }

    let therapyTimeline = null;
    if (b.therapy && b.careType !== "psychiatry") {
      therapyTimeline = computeTherapyTimeline(
        { lastSessionDate: b.therapy.lastSessionDate, cadenceDays: b.therapy.cadenceDays }, today,
      );
    }

    await client.query("COMMIT");
    return Response.json({ userId, timeline, therapyTimeline });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("onboarding save failed", e);
    return Response.json({ error: "save_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}