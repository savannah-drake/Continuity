// lib/busy.ts: PB-27. Save and read a user's busy times in Tiger.
// Two sources: an uploaded .ics file/link ('ics'), or Google Calendar ('google', refreshed live from Google's free/busy).
import { pool, query } from "./db";
import { parseIcs, type Busy } from "./calendar";
import { freeBusy, getConnection } from "./google";
import { importVisits } from "./importVisits";
import { syncMedReminders } from "./medications";

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

// Google Calendar: refresh busy times if the last sync is older than 10 minutes (or when forced)
const STALE_MS = 10 * 60 * 1000;
export async function syncGoogleBusy(userId: number, opts: { force?: boolean } = {}) {
  const conn = await getConnection(userId);
  if (!conn) return { synced: false, reason: "not_connected" as const };
  if (!opts.force && conn.last_synced_at && Date.now() - new Date(conn.last_synced_at).getTime() < STALE_MS) {
    return { synced: false, reason: "fresh" as const };
  }
  const from = new Date(Date.now() - DAY);
  const to = new Date(Date.now() + 60 * DAY);
  let blocks: Busy[] | null;
  try {
    blocks = await freeBusy(userId, from, to);
  } catch (e) {
    await query(
`UPDATE google_connections
SET last_error = $2
WHERE user_id = $1`, [userId, String(e).slice(0, 300)]);
    return { synced: false, reason: "error" as const };
  }
  if (!blocks) return { synced: false, reason: "no_token" as const };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
`DELETE FROM busy_blocks
WHERE user_id = $1
AND source = 'google'`, [userId]);
    if (blocks.length) {
      await client.query(
`INSERT INTO busy_blocks (user_id, starts_at, ends_at, source)
SELECT $1, b.starts_at, b.ends_at, 'google'
FROM unnest($2::timestamptz[], $3::timestamptz[]) AS b(starts_at, ends_at)`,
        [userId, blocks.map((b) => b.start.toISOString()), blocks.map((b) => b.end.toISOString())],
      );
    }
    await client.query(
`UPDATE google_connections
SET last_synced_at = now(), last_error = NULL
WHERE user_id = $1`, [userId]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  // Auto-import booking confirmations (no-op unless the user turned it on in Profile)
  try {
    const r = await importVisits(userId);
    if (r.imported) await syncMedReminders(userId); // a new visit can clear a "book by" deadline
  } catch (e) { console.error("visit import failed", e); }
  return { synced: true, count: blocks.length };
}

// Remove the uploaded calendar (.ics); a Google connection is removed separately (DELETE /api/auth/calendar)
export async function clearCalendar(userId: number) {
  await query(
`DELETE FROM busy_blocks
WHERE user_id = $1
AND source = 'ics'`, [userId]);
}

export async function calendarSummary(userId: number) {
  await syncGoogleBusy(userId).catch((e) => console.error("calendar sync failed", e));
  const [row] = await query<{ block_count: string; ics_count: string }>(
`SELECT count(*)::text AS block_count, count(*) FILTER (WHERE b.source = 'ics')::text AS ics_count
FROM busy_blocks b
WHERE b.user_id = $1
AND b.ends_at > now()`, [userId]);
  const conn = await getConnection(userId);
  return {
    connected: Number(row?.block_count ?? 0) > 0 || !!conn,
    upcomingBusy: Number(row?.block_count ?? 0),
    fileBusy: Number(row?.ics_count ?? 0),
    google: conn ? { connected: true, lastSynced: conn.last_synced_at, needsReconnect: !!conn.last_error } : { connected: false },
  };
}

// Busy times for the week view (start/end only; there is nothing else stored)
export async function busyBetween(userId: number, from: Date, to: Date) {
  await syncGoogleBusy(userId).catch((e) => console.error("calendar sync failed", e));
  return query<{ starts_at: string; ends_at: string }>(
`SELECT b.starts_at, b.ends_at
FROM busy_blocks b
WHERE b.user_id = $1
AND b.ends_at > $2
AND b.starts_at < $3
ORDER BY b.starts_at`, [userId, from.toISOString(), to.toISOString()]);
}
