// scripts/reset-demo.ts
// Puts a demo user back to "your next visit isn't booked yet" before a demo or judging.
// Run from the web folder:
//   npx tsx --env-file=.env.local scripts/reset-demo.ts 1        (1 = Maya's user_id)
//
// What it does (nothing is deleted from history, so the Tiger dashboard keeps its data):
//   - reopens every slot this user has booked, and logs a 'cancelled' booking event for each
//   - clears their appointment care steps
//   - restarts their medication supply count from today (so "20 days left" stays 20)
//   - refreshes those providers in Typesense so the slots show up in search again
import { pool, query } from "../lib/db";
import { refreshProviderInSearch } from "../lib/bookings";

async function main() {
  const userId = Number(process.argv[2] || 1);

  const booked = await query<{ slot_id: number; provider_id: number }>(
`SELECT DISTINCT s.slot_id, s.provider_id
FROM booking_events b
JOIN appointment_slots s ON s.slot_id = b.slot_id
WHERE b.user_id = $1
AND b.event_type = 'confirmed'
AND s.slot_status = 'booked'`,
    [userId],
  );
  const slotIds = booked.map((r) => r.slot_id);

  if (slotIds.length) {
    await query(
`UPDATE appointment_slots
SET slot_status = 'open'
WHERE slot_id = ANY($1)`,
      [slotIds],
    );
    await query(
`INSERT INTO booking_events (user_id, slot_id, event_type, event_source)
SELECT $1, x.slot_id, 'cancelled', 'demo_reset'
FROM unnest($2::int[]) AS x(slot_id)`,
      [userId, slotIds],
    );
  }

  await query(
`DELETE FROM care_steps
WHERE user_id = $1
AND step_type = 'appointment'`,
    [userId],
  );
  await query(
`UPDATE medications
SET supply_as_of = (now() AT TIME ZONE 'America/New_York')::date
WHERE user_id = $1`,
    [userId],
  );

  for (const providerId of new Set<number>(booked.map((r) => r.provider_id))) {
    await refreshProviderInSearch(providerId);
  }

  console.log(`Reset user ${userId}: reopened ${slotIds.length} booked slot(s), cleared appointment steps, supply restarted from today.`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
