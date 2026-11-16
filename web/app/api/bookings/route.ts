// app/api/bookings/route.ts
// GET  /api/bookings?slotId=12          -> slot + provider details for the confirmation page
// POST /api/bookings { slotId } -> requests it for the signed-in user (simulated)
import { NextRequest } from "next/server";
import { getSlot, requestSlot } from "@/lib/bookings";
import { getSessionUserId, unauthorizedJson } from "@/lib/session";

export async function GET(req: NextRequest) {
  const slotId = Number(req.nextUrl.searchParams.get("slotId"));
  if (!slotId) return Response.json({ error: "missing_slot" }, { status: 400 });
  const slot = await getSlot(slotId);
  return slot ? Response.json(slot) : Response.json({ error: "not_found" }, { status: 404 });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const { slotId } = (await req.json()) as { slotId: number };
  if (!slotId) return Response.json({ error: "missing_slot" }, { status: 400 });
  try {
    const result = await requestSlot(Number(slotId), userId, "web");
    if (!result.ok) return Response.json({ error: result.reason }, { status: result.reason === "taken" ? 409 : 404 });
    return Response.json(result.slot);
  } catch (e) {
    console.error("booking failed", e);
    return Response.json({ error: "booking_failed" }, { status: 500 });
  }
}
