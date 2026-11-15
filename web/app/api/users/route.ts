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
  preferredLanguage?: "en" | "es";
  homeZip?: string;
  homeLat?: number;
  homeLng?: number;
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

// ZIP -> lat/lng with the free Zippopotam.us API (no key). Falls back to Emory's campus.
const EMORY = { lat: 33.7925, lng: -84.324 };
async function zipToCoords(zip?: string) {
  if (!zip || !/^\d{5}$/.test(zip)) return null;
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const place = (await res.json()).places?.[0];
    return place ? { lat: Number(place.latitude), lng: Number(place.longitude) } : null;
  } catch { return null; }
}

export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  if (!b.phone || !b.insurancePlan || !b.careType) {
    return Response.json({ error: "missing_fields" }, { status: 400 });
  }

  const today = todayET();
  const coords = (b.homeLat != null && b.homeLng != null)
    ? { lat: b.homeLat, lng: b.homeLng }
    : (await zipToCoords(b.homeZip)) ?? EMORY;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const u = await client.query(
`INSERT INTO users (phone, display_name, insurance_plan, care_type, last_therapy_session, therapy_cadence_days, preferred_language, home_zip, home_lat, home_lng)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (phone) DO UPDATE SET display_name = EXCLUDED.display_name, insurance_plan = EXCLUDED.insurance_plan, care_type = EXCLUDED.care_type, last_therapy_session = EXCLUDED.last_therapy_session, therapy_cadence_days = EXCLUDED.therapy_cadence_days, preferred_language = EXCLUDED.preferred_language, home_zip = EXCLUDED.home_zip, home_lat = EXCLUDED.home_lat, home_lng = EXCLUDED.home_lng
RETURNING user_id`,
      [b.phone, b.displayName ?? null, b.insurancePlan, b.careType,
       b.therapy?.lastSessionDate ?? null, b.therapy?.cadenceDays ?? null,
       b.preferredLanguage ?? "en", b.homeZip ?? null, coords.lat, coords.lng],
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

// PATCH /api/users: Profile edits. Only these fields; anything else in the body is ignored.
// { userId, displayName?, insurancePlan?, preferredLanguage?, homeZip? }  (ZIP -> lat/lng like onboarding)
export async function PATCH(req: Request) {
  const b = await req.json().catch(() => ({}));
  const userId = Number(b.userId);
  if (!Number.isInteger(userId) || userId <= 0) return Response.json({ error: "userId required" }, { status: 400 });
  const sets: string[] = [];
  const vals: unknown[] = [userId];
  const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (typeof b.displayName === "string" && b.displayName.trim()) add("display_name", b.displayName.trim().slice(0, 60));
  if (typeof b.insurancePlan === "string" && b.insurancePlan.trim()) add("insurance_plan", b.insurancePlan.trim().slice(0, 80));
  if (b.preferredLanguage === "en" || b.preferredLanguage === "es") add("preferred_language", b.preferredLanguage);
  if (typeof b.homeZip === "string" && /^\d{5}$/.test(b.homeZip)) {
    const c = await zipToCoords(b.homeZip);
    if (!c) return Response.json({ error: "zip_not_found" }, { status: 400 });
    add("home_zip", b.homeZip); add("home_lat", c.lat); add("home_lng", c.lng);
  }
  if (!sets.length) return Response.json({ error: "nothing_to_update" }, { status: 400 });
  const r = await pool.query(
`UPDATE users SET ${sets.join(", ")}
WHERE user_id = $1
RETURNING user_id`, vals);
  if (!r.rowCount) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
