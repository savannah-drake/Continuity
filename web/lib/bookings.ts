// lib/bookings.ts
// Simulated booking. Shared by the web booking page and (later) the FaceTime agent's request_slot tool.
// Booking = slot marked booked + events in the booking_events hypertable + an appointment care step,
// then the provider's Typesense record is refreshed so the slot disappears from search.
import { pool, query } from "./db";
import { typesenseAdmin, NO_OPENINGS } from "./typesense";

export type SlotDetail = {
  slot_id: number; slot_start: string; duration_min: number; telehealth: boolean; slot_status: string;
  provider_id: number; npi: string; provider_name: string; specialty: string; address: string;
};

export async function getSlot(slotId: number) {
  const rows = await query<SlotDetail>(
`SELECT s.slot_id, s.slot_start, s.duration_min, s.telehealth, s.slot_status, p.provider_id, p.npi, p.provider_name, p.specialty, p.address
FROM appointment_slots s
JOIN providers p ON p.provider_id = s.provider_id
WHERE s.slot_id = $1`,
    [slotId],
  );
  return rows[0] ?? null;
}

export type BookingResult =
  | { ok: true; slot: SlotDetail }
  | { ok: false; reason: "taken" | "not_found" };

export async function requestSlot(slotId: number, userId: number | null, source: "web" | "facetime") {
  const client = await pool.connect();
  let providerId: number | null = null;
  try {
    await client.query("BEGIN");

    // Only an open slot can be booked; this also stops two people grabbing the same one
    const upd = await client.query(
`UPDATE appointment_slots
SET slot_status = 'booked'
WHERE slot_id = $1
AND slot_status = 'open'
RETURNING provider_id, slot_start`,
      [slotId],
    );
    if (upd.rowCount === 0) {
      await client.query("ROLLBACK");
      const exists = await getSlot(slotId);
      return { ok: false, reason: exists ? "taken" : "not_found" } as BookingResult;
    }
    providerId = upd.rows[0].provider_id;

    // Simulated flow: request is sent and (instantly, for the demo) confirmed
    await client.query(
`INSERT INTO booking_events (user_id, slot_id, event_type, event_source)
VALUES ($1, $2, 'requested', $3), ($1, $2, 'confirmed', $3)`,
      [userId, slotId, source],
    );

    if (userId) {
      await client.query(
`INSERT INTO care_steps (user_id, step_type, step_status, due_by, completed_at)
VALUES ($1, 'appointment', 'booked', ($2::timestamptz AT TIME ZONE 'America/New_York')::date, now())`,
        [userId, upd.rows[0].slot_start],
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  await refreshProviderInSearch(providerId!);
  return { ok: true, slot: (await getSlot(slotId))! } as BookingResult;
}

// Keep Typesense's soonest-opening info in sync after a booking
export async function refreshProviderInSearch(providerId: number) {
  const rows = await query<{ npi: string; open_slot_count: string; next_open_slot: string | null }>(
`SELECT p.npi, count(s.slot_id) FILTER (WHERE s.slot_status = 'open' AND s.slot_start > now()) AS open_slot_count, min(s.slot_start) FILTER (WHERE s.slot_status = 'open' AND s.slot_start > now()) AS next_open_slot
FROM providers p
LEFT JOIN appointment_slots s ON s.provider_id = p.provider_id
WHERE p.provider_id = $1
GROUP BY p.npi`,
    [providerId],
  );
  const r = rows[0];
  if (!r) return;
  try {
    await typesenseAdmin.collections("providers").documents(r.npi).update({
      open_slot_count: Number(r.open_slot_count),
      next_open_slot: r.next_open_slot ? Math.floor(new Date(r.next_open_slot).getTime() / 1000) : NO_OPENINGS,
    });
  } catch (e) {
    console.error("Typesense refresh failed (booking still saved)", e);
  }
}
