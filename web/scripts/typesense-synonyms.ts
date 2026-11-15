// scripts/typesense-synonyms.ts: PB-36. Teaches provider search everyday + Spanish words.
// "shrink", "counselor", "psiquiatra", "terapeuta"... find the right providers, no code changes in search.
// Run: cd web && npx tsx --env-file=.env.local scripts/typesense-synonyms.ts   (safe to re-run)
// Works on Typesense Cloud before and after v30 (collection synonyms → synonym sets).
const HOST = `https://${process.env.TYPESENSE_HOST}`;
const KEY = process.env.TYPESENSE_ADMIN_KEY!;
const COLLECTION = "providers";
const SET = "continuity-synonyms";

type Syn = { id: string; synonyms: string[]; root?: string };

// Ivy: add or edit words here, then re-run.
const SYNONYMS: Syn[] = [
  // multi-way: any of these finds the others
  { id: "psychiatry", synonyms: ["psychiatrist", "psychiatry", "psych", "shrink", "medication doctor", "meds doctor", "psiquiatra", "psiquiatría", "psiquiatria"] },
  { id: "therapy", synonyms: ["therapist", "therapy", "counselor", "counsellor", "counseling", "talk therapy", "terapeuta", "terapia", "consejero", "consejera"] },
  { id: "psychology", synonyms: ["psychologist", "psychology", "psicólogo", "psicologo", "psicóloga", "psicologa"] },
  { id: "lcsw", synonyms: ["lcsw", "social worker", "clinical social worker", "trabajador social"] },
  { id: "lmft", synonyms: ["lmft", "marriage and family therapist", "family therapist", "couples therapist"] },
  { id: "lpc", synonyms: ["lpc", "licensed professional counselor"] },
  // one-way: searching the root also finds these (not the other way round)
  { id: "adhd", root: "adhd", synonyms: ["psychiatrist"] },
  { id: "refill", root: "refill", synonyms: ["psychiatrist"] },
  { id: "receta", root: "receta", synonyms: ["psiquiatra", "psychiatrist"] },
];

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${HOST}${path}`, {
    method,
    headers: { "X-TYPESENSE-API-KEY": KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, text: await res.text() };
}

async function main() {
  // Older Typesense: synonyms live on the collection.
  const first = await call("PUT", `/collections/${COLLECTION}/synonyms/${SYNONYMS[0].id}`, { synonyms: SYNONYMS[0].synonyms });
  if (first.status < 300) {
    for (const s of SYNONYMS) {
      const r = await call("PUT", `/collections/${COLLECTION}/synonyms/${s.id}`, s.root ? { root: s.root, synonyms: s.synonyms } : { synonyms: s.synonyms });
      if (r.status >= 300) throw new Error(`${s.id}: ${r.status} ${r.text}`);
    }
    console.log(`Typesense: ${SYNONYMS.length} synonym rules on '${COLLECTION}'`);
    return;
  }

  // Typesense v30+: a named synonym set, attached to the collection.
  const set = await call("PUT", `/synonym_sets/${SET}`, { items: SYNONYMS });
  if (set.status >= 300) throw new Error(`synonym set: ${set.status} ${set.text} (collection API said ${first.status} ${first.text})`);
  const link = await call("PATCH", `/collections/${COLLECTION}`, { synonym_sets: [SET] });
  if (link.status >= 300) throw new Error(`attach set: ${link.status} ${link.text}`);
  console.log(`Typesense: synonym set '${SET}' (${SYNONYMS.length} rules) attached to '${COLLECTION}'`);
}

main().catch((e) => { console.error(e); process.exit(1); });
