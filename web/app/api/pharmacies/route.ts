// /api/pharmacies (signed in): the pharmacies you use. The first one you add is preferred.
// POST {name, phone?, address?}   PATCH {pharmacyId, preferred: true}   DELETE ?id=3
import type { NextRequest } from "next/server";
import { getSessionUserId, unauthorizedJson } from "@/lib/session";
import { query } from "@/lib/db";

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const b = await req.json().catch(() => null);
  const name = text(b?.name, 80);
  if (!name) return Response.json({ error: "need_name" }, { status: 400 });
  const phone = text(b?.phone, 30)?.replace(/[^\d+()\-. ]/g, "") || null;
  const [row] = await query<{ pharmacy_id: number }>(
`INSERT INTO pharmacies (user_id, pharmacy_name, phone, address, preferred)
VALUES ($1, $2, $3, $4, NOT EXISTS (SELECT 1 FROM pharmacies ph WHERE ph.user_id = $1))
RETURNING pharmacy_id`, [userId, name, phone, text(b?.address, 160)]);
  return Response.json({ pharmacyId: row.pharmacy_id });
}

export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const b = await req.json().catch(() => null);
  const id = Number(b?.pharmacyId);
  if (!Number.isInteger(id) || b?.preferred !== true) return Response.json({ error: "bad_request" }, { status: 400 });
  await query(
`UPDATE pharmacies
SET preferred = (pharmacy_id = $2)
WHERE user_id = $1`, [userId, id]);
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const id = Number(req.nextUrl.searchParams.get("id"));
  const [gone] = await query<{ preferred: boolean }>(
`DELETE FROM pharmacies
WHERE pharmacy_id = $2
AND user_id = $1
RETURNING preferred`, [userId, id]);
  // Keep one preferred if any are left
  if (gone?.preferred) await query(
`UPDATE pharmacies
SET preferred = true
WHERE pharmacy_id = (SELECT ph.pharmacy_id FROM pharmacies ph WHERE ph.user_id = $1 ORDER BY ph.created_at LIMIT 1)`, [userId]);
  return Response.json({ ok: true });
}
