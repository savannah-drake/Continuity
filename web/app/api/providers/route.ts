// app/api/providers/route.ts
// GET /api/providers?plan=Aetna%20Student%20Health&type=psychiatrist&before=2026-11-25
//   optional: q, language, telehealth=1, lat, lng, limit, slots=1 (include up to 3 open slots each)
import { NextRequest } from "next/server";
import { searchProviders, getOpenSlots } from "@/lib/providers";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  try {
    const providers = await searchProviders({
      q: p.get("q") ?? undefined,
      plan: p.get("plan") ?? undefined,
      type: p.get("type") ?? undefined,
      before: p.get("before") ?? undefined,
      language: p.get("language") ?? undefined,
      telehealth: p.get("telehealth") === "1",
      lat: p.get("lat") ? Number(p.get("lat")) : undefined,
      lng: p.get("lng") ? Number(p.get("lng")) : undefined,
      limit: p.get("limit") ? Number(p.get("limit")) : undefined,
    });
    if (p.get("slots") !== "1") return Response.json(providers);

    const slots = await getOpenSlots(providers.map((x: any) => x.provider_id), p.get("before") ?? undefined);
    return Response.json(providers.map((x: any) => ({ ...x, slots: slots.get(x.provider_id) ?? [] })));
  } catch (e) {
    console.error("provider search failed", e);
    return Response.json({ error: "search_failed" }, { status: 500 });
  }
}
