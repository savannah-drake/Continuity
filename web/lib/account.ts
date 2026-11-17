// lib/account.ts: delete an account and everything Continuity stored for it (Profile → Delete my account).
// Google access is revoked first. Events Continuity added to Google Calendar stay in the person's calendar.
import { query } from "./db";
import { removeConnection } from "./google";

export async function deleteAccount(userId: number) {
  await removeConnection(userId).catch(() => {});
  // Children first; tables that only exist in some setups are skipped if missing
  const steps = [
`DELETE FROM care_steps
WHERE user_id = $1`,
`DELETE FROM prescriptions
WHERE medication_id IN (SELECT m.medication_id FROM medications m WHERE m.user_id = $1)`,
`DELETE FROM medications
WHERE user_id = $1`,
`DELETE FROM visits
WHERE user_id = $1`,
`DELETE FROM care_team
WHERE user_id = $1`,
`DELETE FROM busy_blocks
WHERE user_id = $1`,
`DELETE FROM calendar_blocks
WHERE user_id = $1`,
`DELETE FROM import_dismissed
WHERE user_id = $1`,
`DELETE FROM booking_events
WHERE user_id = $1`,
`DELETE FROM call_log
WHERE user_id = $1`,
`DELETE FROM care_fund_payouts
WHERE user_id = $1`,
  ];
  for (const sql of steps) {
    await query(sql, [userId]).catch((e: any) => { if (e?.code !== "42P01") throw e; }); // 42P01 = table doesn't exist
  }
  // Pharmacies, push subscriptions, sent alerts and the trusted person go with the user (ON DELETE CASCADE)
  await query(
`DELETE FROM users
WHERE user_id = $1`, [userId]);
}
