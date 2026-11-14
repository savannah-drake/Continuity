// app/api/agent/book/route.ts
// POST /api/agent/book { userId, slotId } -> books (simulated) after the caller said yes on FaceTime.
import { requestSlot } from "@/lib/bookings";
import { agentAuthorized, unauthorized, spokenWhen } from "@/lib/agentApi";

export async function POST(req: Request) {
  if (!agentAuthorized(req)) return unauthorized();
  const { userId, slotId } = (await req.json()) as { userId: number; slotId: number };
  if (!slotId) return Response.json({ error: "missing_slot" }, { status: 400 });

  const result = await requestSlot(Number(slotId), userId ? Number(userId) : null, "facetime");
  if (!result.ok) return Response.json({ booked: false, reason: result.reason });
  return Response.json({
    booked: true,
    provider: result.slot.provider_name,
    when: spokenWhen(result.slot.slot_start),
    video_visit: result.slot.telehealth,
  });
}
