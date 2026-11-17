// POST /api/alerts/test (signed in): send a test alert to this person's phones and email.
import { getSessionUserId, unauthorizedJson } from "@/lib/session";
import { runAlerts } from "@/lib/alerts";

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  return Response.json(await runAlerts(userId, { test: true }));
}
