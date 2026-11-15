// lib/support.ts: find the right help line for what someone describes (Typesense: semantic + keyword).
// Safety rule enforced here, not left to search: anything crisis-related always includes 988 first.
import { typesenseSearch } from "./typesense";
import vetted from "../db/seed/support-resources.json";

export type Resource = {
  id: string; name: string; name_es: string; description: string; description_es: string;
  how: string; how_es: string; call?: string; text_to?: string; text_body?: string; web?: string;
  needs: string[]; audience: string[]; languages: string[]; available_24_7: boolean; crisis: boolean; priority: number;
};

// If Typesense is unreachable, still return the vetted list (988 first). Bundled with the app.
function fallbackList(): Resource[] {
  return [...(vetted as unknown as Resource[])].sort((a, b) => b.priority - a.priority);
}

const CRISIS_WORDS = /suicid|kill (my|him|her)self|want to die|end (my|it)|don'?t want to (be here|live)|self[- ]?harm|cutting|hurt (my|him|her)self|overdose|too many pills|morir|matarme|hacerme daño|no quiero vivir/i;

export async function findSupport(opts: { q?: string; language?: "en" | "es"; student?: boolean; limit?: number }) {
  const q = (opts.q || "").trim();
  const limit = opts.limit ?? 4;
  const audience = opts.student ? "audience:=[everyone,emory_students,lgbtq_youth]" : "audience:=[everyone,lgbtq_youth]";
  const filters = audience;
  let hits: Resource[] = [];
  try {
    const params: any = {
      q: q || "*", filter_by: filters, per_page: limit + 2,
      query_by: "name,keywords,description,name_es,description_es", sort_by: q ? "_text_match:desc,priority:desc" : "priority:desc",
      exclude_fields: "embedding",
    };
    try {
      // Hybrid: words + meaning ("I feel like I can't go on" finds 988 without the word "suicide")
      const r = await typesenseSearch.collections("support_resources").documents().search({
        ...params, query_by: params.query_by + ",embedding", vector_query: "embedding:([], alpha: 0.6)",
      });
      hits = (r.hits ?? []).map((h: any) => h.document);
    } catch {
      const r = await typesenseSearch.collections("support_resources").documents().search(params);
      hits = (r.hits ?? []).map((h: any) => h.document);
    }
  } catch {
    hits = fallbackList().filter((x) => x.audience.includes("everyone") || (opts.student && x.audience.includes("emory_students")));
  }
  // Always lead with 988 when the words suggest a crisis, or when nothing matched
  const isCrisis = CRISIS_WORDS.test(q) || hits.some((h) => h.needs?.includes("suicidal") || h.needs?.includes("self_harm"));
  if (isCrisis || hits.length === 0) {
    const nine88 = hits.find((h) => h.id === "988") ?? fallbackList().find((x) => x.id === "988")!;
    hits = [nine88, ...hits.filter((h) => h.id !== "988")];
    if (/overdose|too many pills|sobredosis/i.test(q)) {
      const er = fallbackList().filter((x) => x.id === "911" || x.id === "poison-control");
      hits = [...er, ...hits.filter((h) => h.id !== "911" && h.id !== "poison-control")];
    }
  }
  return { crisis: isCrisis, resources: hits.slice(0, limit) };
}
