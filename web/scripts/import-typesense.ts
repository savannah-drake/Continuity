// scripts/import-typesense.ts
// Syncs providers from Tiger into Typesense (Tiger is the source of truth).
// Run after seed-db.ts, and again whenever slots change:
//   npx tsx --env-file=.env.local scripts/import-typesense.ts
// Safe to re-run: drops and recreates the collection.
import { pool, query } from "../lib/db";
import { typesenseAdmin as ts, NO_OPENINGS } from "../lib/typesense";

type ProviderRow = {
  provider_id: number; npi: string; provider_name: string; provider_type: string; specialty: string;
  address: string; lat: number; lng: number; insurance_plans: string[]; languages: string[] | null;
  open_slot_count: string; next_open_slot: Date | null; offers_telehealth: boolean | null;
};

async function main() {
  const rows = await query<ProviderRow>(
`SELECT p.provider_id, p.npi, p.provider_name, p.provider_type, p.specialty, p.address, p.lat, p.lng, p.insurance_plans, p.languages, count(s.slot_id) FILTER (WHERE s.slot_status = 'open' AND s.slot_start > now()) AS open_slot_count, min(s.slot_start) FILTER (WHERE s.slot_status = 'open' AND s.slot_start > now()) AS next_open_slot, bool_or(s.telehealth) AS offers_telehealth
FROM providers p
LEFT JOIN appointment_slots s ON s.provider_id = p.provider_id
GROUP BY p.provider_id`,
  );

  try { await ts.collections("providers").delete(); } catch { /* first run */ }
  await ts.collections().create({
    name: "providers",
    fields: [
      { name: "provider_id", type: "int32" },
      { name: "provider_name", type: "string" },
      { name: "provider_type", type: "string", facet: true },   // psychiatrist / therapist / psychologist
      { name: "specialty", type: "string" },                     // "Therapist (LCSW)"
      { name: "address", type: "string" },
      { name: "insurance_plans", type: "string[]", facet: true },
      { name: "languages", type: "string[]", facet: true },
      { name: "telehealth", type: "bool", facet: true },
      { name: "open_slot_count", type: "int32" },
      { name: "next_open_slot", type: "int64" },                 // unix seconds; NO_OPENINGS if none
      { name: "location", type: "geopoint" },                    // [lat, lng]
    ],
  } as any);

  const docs = rows.map((r) => ({
    id: r.npi,
    provider_id: r.provider_id,
    provider_name: r.provider_name,
    provider_type: r.provider_type,
    specialty: r.specialty,
    address: r.address,
    insurance_plans: r.insurance_plans ?? [],
    languages: r.languages ?? ["English"],
    telehealth: !!r.offers_telehealth,
    open_slot_count: Number(r.open_slot_count),
    next_open_slot: r.next_open_slot ? Math.floor(new Date(r.next_open_slot).getTime() / 1000) : NO_OPENINGS,
    location: [Number(r.lat), Number(r.lng)],
  }));

  const result = await ts.collections("providers").documents().import(docs, { action: "upsert" });
  const ok = result.filter((x: any) => x.success).length;
  console.log(`Typesense: ${ok}/${docs.length} providers indexed`);
  result.filter((x: any) => !x.success).forEach((x: any) => console.error(x.error, x.document));
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
