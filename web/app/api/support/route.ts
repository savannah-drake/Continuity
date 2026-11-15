// GET /api/support?q=I+feel+like+I+can't+go+on&lang=es&student=1
// Public: no account needed, nothing is saved, and the search text is never logged.
import { NextRequest } from "next/server";
import { findSupport } from "@/lib/support";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const result = await findSupport({
    q: p.get("q")?.slice(0, 200) ?? "",
    language: p.get("lang") === "es" ? "es" : "en",
    student: p.get("student") !== "0",
    limit: Math.min(Number(p.get("limit")) || 5, 8),
  });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
