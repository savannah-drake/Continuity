// app/api/agent/calls/route.ts
// POST /api/agent/calls { chertCallId, userId, durationSec, outcome } -> one row in the call_log hypertable.
import { query } from "@/lib/db";
import { agentAuthorized, unauthorized } from "@/lib/agentApi";

export async function POST(req: Request) {
  if (!agentAuthorized(req)) return unauthorized();
  const b = (await req.json()) as { chertCallId?: string; userId?: number; durationSec?: number; outcome?: string };
  await query(
`INSERT INTO call_log (user_id, chert_call_id, duration_sec, call_outcome)
VALUES ($1, $2, $3, $4)`,
    [b.userId ?? null, b.chertCallId ?? null, b.durationSec ?? null, b.outcome ?? null],
  );
  return Response.json({ ok: true });
}
