// scripts/import-support.ts: loads db/seed/support-resources.json into a Typesense collection.
// Every number in that file was checked against the official source (Nov 14, 2026). Re-check before launch.
// Run: cd web && npx tsx --env-file=.env.local scripts/import-support.ts
// Keyword search + synonyms by default. Our 0.5 GB cluster runs out of memory loading the built-in embedding
// model, so semantic search is opt-in: add --semantic only on a bigger cluster.
import { readFileSync } from "node:fs";
import { typesenseAdmin } from "../lib/typesense";

const NAME = "support_resources";
const docs = JSON.parse(readFileSync("db/seed/support-resources.json", "utf8"));

const baseFields = [
  { name: "name", type: "string" },
  { name: "name_es", type: "string" },
  { name: "description", type: "string" },
  { name: "description_es", type: "string" },
  { name: "keywords", type: "string" },
  { name: "how", type: "string", index: false, optional: true },
  { name: "how_es", type: "string", index: false, optional: true },
  { name: "call", type: "string", index: false, optional: true },
  { name: "text_to", type: "string", index: false, optional: true },
  { name: "text_body", type: "string", index: false, optional: true },
  { name: "web", type: "string", index: false, optional: true },
  { name: "needs", type: "string[]", facet: true },
  { name: "audience", type: "string[]", facet: true },
  { name: "languages", type: "string[]", facet: true },
  { name: "available_24_7", type: "bool", facet: true },
  { name: "crisis", type: "bool", facet: true },
  { name: "priority", type: "int32" },
  { name: "location", type: "geopoint", optional: true },
];
const embedding = {
  name: "embedding", type: "float[]",
  embed: { from: ["name", "description", "keywords"], model_config: { model_name: "ts/all-MiniLM-L12-v2" } },
};

async function create(withEmbedding: boolean) {
  try { await typesenseAdmin.collections(NAME).delete(); } catch { /* first run */ }
  await typesenseAdmin.collections().create({
    name: NAME, default_sorting_field: "priority",
    fields: (withEmbedding ? [...baseFields, embedding] : baseFields) as any,
  });
}

async function importDocs() {
  const res = await typesenseAdmin.collections(NAME).documents().import(docs, { action: "upsert" });
  return (res as unknown as { success: boolean }[]).filter((r) => !r.success);
}

async function main() {
  let semantic = process.argv.includes("--semantic");
  let failed: unknown[] = [];
  try {
    await create(semantic);
    failed = await importDocs();
  } catch (e) {
    if (!semantic) throw e;
    console.warn("Semantic search didn't fit on this cluster, switching to keyword search:", (e as Error).message);
    semantic = false;
    await create(false); // deletes the semantic collection first, which frees its memory
    failed = await importDocs();
  }
  if (failed.length) console.error("Some resources failed:", failed);

  // Everyday words -> the right kind of help (works with or without the semantic model)
  const synonyms: Record<string, string[]> = {
    suicide: ["suicide", "suicidal", "kill myself", "end my life", "want to die", "don't want to be here", "suicidio", "quiero morir"],
    selfharm: ["self harm", "self-harm", "cutting", "hurt myself", "hacerme daño"],
    overdose: ["overdose", "took too many pills", "too much medication", "sobredosis"],
    lgbtq: ["lgbtq", "lgbt", "gay", "lesbian", "bisexual", "trans", "transgender", "queer", "nonbinary"],
    meds: ["ran out of meds", "out of medication", "no pills left", "me quedé sin medicamento", "refill"],
  };
  for (const [id, words] of Object.entries(synonyms)) {
    try { await (typesenseAdmin.collections(NAME) as any).synonyms().upsert(id, { synonyms: words }); } catch { /* v30 uses synonym sets; keywords field still covers these */ }
  }
  console.log(`Typesense: ${docs.length - failed.length}/${docs.length} support resources in '${NAME}' (${semantic ? "semantic + keyword" : "keyword"} search)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
