// POST /api/alerts/run (signed in): check my real alerts now and send anything that's due (same as the 8:30 AM run).
// Each alert still only goes out once, so pressing it twice doesn't repeat them.
import { getSessionUserId, unauthorizedJson } from "@/lib/session";
import { runAlerts } from "@/lib/alerts";

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  return Response.json(await runAlerts(userId));
}
