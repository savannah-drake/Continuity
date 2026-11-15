// POST /api/carefund/pay {slotId, userId}: pay one copay grant for a booked slot (Solana devnet).
import { payCopay } from "@/lib/carefund";

export async function POST(req: Request) {
  const { slotId, userId } = await req.json().catch(() => ({}));
  if (!Number.isInteger(Number(slotId))) return Response.json({ error: "slotId required" }, { status: 400 });
  try {
    const r = await payCopay(Number(slotId), userId ? Number(userId) : null);
    if (r.ok) return Response.json(r);
    const status = r.reason === "not_booked" ? 409 : r.reason === "empty" ? 402 : 502;
    return Response.json(r, { status });
  } catch (e) {
    return Response.json({ ok: false, reason: "chain_error", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
