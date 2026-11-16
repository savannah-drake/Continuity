// app/api/me/route.ts
// GET /api/me -> everything Home, Timeline and Profile need for the signed-in user. 401 when signed out.
import { getMe } from "@/lib/me";
import { getSessionUserId, unauthorizedJson } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const me = await getMe(userId);
  if (!me) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(me);
}
