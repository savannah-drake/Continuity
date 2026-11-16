// app/api/me/route.ts
// GET /api/me -> everything Home, Timeline and Profile need for the signed-in user. 401 when signed out.
import { getMe } from "@/lib/me";
import { getSessionUserId, unauthorizedJson } from "@/lib/session";
import { syncGoogleBusy } from "@/lib/busy";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  await syncGoogleBusy(userId).catch((e) => console.error("calendar sync failed", e));
  const me = await getMe(userId);
  if (!me) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(me);
}
