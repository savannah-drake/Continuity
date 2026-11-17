// POST /api/medications/rx-sent (signed in): after a psychiatry visit, "Yes, they sent my prescription".
import { getSessionUserId, unauthorizedJson } from "@/lib/session";
import { markRxSent, syncMedReminders } from "@/lib/medications";

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  await markRxSent(userId);
  await syncMedReminders(userId).catch((e) => console.error("reminder sync failed", e));
  return Response.json({ ok: true });
}
