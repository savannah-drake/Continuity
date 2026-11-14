// app/api/bookings/route.ts
// GET  /api/bookings?slotId=12          -> slot + provider details for the confirmation page
// POST /api/bookings { slotId, userId } -> books it (simulated)
import { NextRequest } from "next/server";
import { getSlot, requestSlot } from "@/lib/bookings";

export async function GET(req: NextRequest) {
  const slotId = Number(req.nextUrl.searchParams.get("slotId"));
  if (!slotId) return Response.json({ error: "missing_slot" }, { status: 400 });
  const slot = await getSlot(slotId);
  return slot ? Response.json(slot) : Response.json({ error: "not_found" }, { status: 404 });
}

export async function POST(req: Request) {
  const { slotId, userId } = (await req.json()) as { slotId: number; userId?: number | null };
  if (!slotId) return Response.json({ error: "missing_slot" }, { status: 400 });
  try {
    const result = await requestSlot(Number(slotId), userId ? Number(userId) : null, "web");
    if (!result.ok) return Response.json({ error: result.reason }, { status: result.reason === "taken" ? 409 : 404 });
    return Response.json(result.slot);
  } catch (e) {
    console.error("booking failed", e);
    return Response.json({ error: "booking_failed" }, { status: 500 });
  }
}
