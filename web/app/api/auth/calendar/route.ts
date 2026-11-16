// DELETE /api/auth/calendar: disconnect Google Calendar (revokes access at Google, removes synced busy times).
// Visits and reminders already on the calendar stay there; they're the person's events now.
import { getSessionUserId, unauthorizedJson } from "@/lib/session";
import { removeConnection } from "@/lib/google";
import { query } from "@/lib/db";

export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  await removeConnection(userId);
  await query(
`DELETE FROM busy_blocks
WHERE user_id = $1
AND source = 'google'`, [userId]);
  return Response.json({ connected: false });
}
