// lib/busy.ts: PB-27. Save and read a user's busy times (from lib/calendar.ts) in Tiger.
import { pool, query } from "./db";
import { parseIcs, type Busy } from "./calendar";

const DAY = 24 * 3600 * 1000;

// Replace this user's calendar busy times with the ones in an .ics file (next 90 days)
export async function saveCalendar(userId: number, icsText: string) {
  const now = Date.now();
  const blocks: Busy[] = parseIcs(icsText, { from: new Date(now - DAY), to: new Date(now + 90 * DAY) });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
`DELETE FROM busy_blocks
WHERE user_id = $1
AND source = 'ics'`, [userId]);
    if (blocks.length) {
      await client.query(
`INSERT INTO busy_blocks (user_id, starts_at, ends_at, source)
SELECT $1, b.starts_at, b.ends_at, 'ics'
FROM unnest($2::timestamptz[], $3::timestamptz[]) AS b(starts_at, ends_at)`,
        [userId, blocks.map((b) => b.start.toISOString()), blocks.map((b) => b.end.toISOString())],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return { count: blocks.length, next: blocks.filter((b) => b.end.getTime() > now).slice(0, 3) };
}

export async function clearCalendar(userId: number) {
  await query(
`DELETE FROM busy_blocks
WHERE user_id = $1`, [userId]);
}

export async function calendarSummary(userId: number) {
  const [row] = await query<{ block_count: string; first_busy: string | null }>(
`SELECT count(*)::text AS block_count, min(b.starts_at)::text AS first_busy
FROM busy_blocks b
WHERE b.user_id = $1
AND b.ends_at > now()`, [userId]);
  return { connected: Number(row?.block_count ?? 0) > 0, upcomingBusy: Number(row?.block_count ?? 0) };
}
