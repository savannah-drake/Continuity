// GET /api/carefund: fund balance, totals and the last 5 payouts (for Insights + the booking card).
import { fundSummary } from "@/lib/carefund";

export async function GET() {
  try {
    return Response.json(await fundSummary());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "fund unavailable" }, { status: 503 });
  }
}
