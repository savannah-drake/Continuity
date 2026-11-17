// GET /api/pharmacies/search?zip=30322&q=cvs (signed in): walk-in pharmacies near a ZIP, closest first.
// Without a ZIP it uses your home ZIP, or your saved location (Emory if you never gave one).
import type { NextRequest } from "next/server";
import { getSessionUserId, unauthorizedJson } from "@/lib/session";
import { query } from "@/lib/db";
import { pharmaciesNear } from "@/lib/pharmacySearch";

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const params = req.nextUrl.searchParams;
  const typed = params.get("zip") ?? "";
  const [u] = await query<{ home_zip: string | null; home_lat: number | null; home_lng: number | null }>(
`SELECT u.home_zip, u.home_lat, u.home_lng
FROM users u
WHERE u.user_id = $1`, [userId]);
  const zip = /^\d{5}$/.test(typed) ? typed : u?.home_zip ?? null;
  const pharmacies = await pharmaciesNear({ zip, lat: zip ? null : u?.home_lat, lng: zip ? null : u?.home_lng, q: params.get("q") ?? "" });
  return Response.json({ zip, pharmacies });
}
