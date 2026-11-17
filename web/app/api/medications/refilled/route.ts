// POST /api/medications/refilled {medicationId} (signed in): "Picked up a refill". The countdown starts over.
import { getSessionUserId, unauthorizedJson } from "@/lib/session";
import { markRefilled, syncMedReminders } from "@/lib/medications";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const b = await req.json().catch(() => null);
  const id = Number(b?.medicationId);
  if (!Number.isInteger(id) || !(await markRefilled(userId, id))) return Response.json({ error: "not_found" }, { status: 404 });
  await syncMedReminders(userId).catch((e) => console.error("reminder sync failed", e));
  return Response.json({ ok: true });
}
