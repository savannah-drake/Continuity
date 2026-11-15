// GET /api/suggest?q=zolo -> up to 6 medication suggestions as you type (Typesense prefix + typo tolerance).
// Falls back to a simple local match if Typesense is unreachable. Nothing typed is saved.
import { NextRequest } from "next/server";
import { typesenseSearch } from "@/lib/typesense";
import meds from "@/db/seed/medications.json";

type Med = { id: string; name: string; brands: string[]; kind: string };

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 40);
  if (q.length < 2) return Response.json({ suggestions: [] });
  let found: Med[] = [];
  try {
    const r = await typesenseSearch.collections("medications").documents().search({
      q, query_by: "name,brands", prefix: true, num_typos: 2, per_page: 6,
    });
    found = (r.hits ?? []).map((h: any) => h.document as Med);
  } catch {
    const low = q.toLowerCase();
    found = (meds as Med[]).filter((m) => [m.name, ...m.brands].some((n) => n.toLowerCase().startsWith(low))).slice(0, 6);
  }
  return Response.json({ suggestions: found.map((m) => ({ id: m.id, label: m.name, detail: `${m.brands.join(", ")} · ${m.kind}` })) });
}
