// scripts/import-medications.ts: a small Typesense collection of common psychiatric medications
// (generic + brand names) so onboarding can suggest as you type, with typo tolerance ("zolof" -> Sertraline).
// Run: cd web && npx tsx --env-file=.env.local scripts/import-medications.ts   (safe to re-run)
import { readFileSync } from "node:fs";
import { typesenseAdmin } from "../lib/typesense";

const NAME = "medications";
const meds = JSON.parse(readFileSync("db/seed/medications.json", "utf8"));

async function main() {
  try { await typesenseAdmin.collections(NAME).delete(); } catch { /* first run */ }
  await typesenseAdmin.collections().create({
    name: NAME,
    fields: [
      { name: "name", type: "string" },
      { name: "brands", type: "string[]" },
      { name: "kind", type: "string", facet: true },
    ],
  } as any);
  const res = (await typesenseAdmin.collections(NAME).documents().import(meds, { action: "upsert" })) as unknown as { success: boolean }[];
  console.log(`Typesense: ${res.filter((r) => r.success).length}/${meds.length} medications in '${NAME}'`);
}
main().catch((e) => { console.error(e); process.exit(1); });
