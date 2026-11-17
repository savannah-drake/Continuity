// /api/push (signed in): this phone/browser's push address for refill alerts.
// POST {endpoint, keys: {p256dh, auth}} turns notifications on; DELETE {endpoint} turns them off.
import { getSessionUserId, unauthorizedJson } from "@/lib/session";
import { query } from "@/lib/db";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const b = await req.json().catch(() => null);
  const endpoint = typeof b?.endpoint === "string" && b.endpoint.startsWith("https://") ? b.endpoint.slice(0, 1000) : null;
  const p256dh = typeof b?.keys?.p256dh === "string" ? b.keys.p256dh.slice(0, 200) : null;
  const auth = typeof b?.keys?.auth === "string" ? b.keys.auth.slice(0, 100) : null;
  if (!endpoint || !p256dh || !auth) return Response.json({ error: "bad_subscription" }, { status: 400 });
  await query(
`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth)
VALUES ($1, $2, $3, $4)
ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`, [endpoint, userId, p256dh, auth]);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const b = await req.json().catch(() => null);
  if (typeof b?.endpoint === "string") await query(
`DELETE FROM push_subscriptions
WHERE endpoint = $1
AND user_id = $2`, [b.endpoint, userId]);
  return Response.json({ ok: true });
}
