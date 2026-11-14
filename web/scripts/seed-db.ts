// scripts/seed-db.ts
// Loads Ivy's provider + availability sheet into Tiger (providers + appointment_slots).
// Run from the web folder:
//   npx tsx --env-file=.env.local scripts/seed-db.ts
// Safe to re-run: providers are upserted by NPI and their open slots are replaced.
//
// Sheet columns (one row per open slot; providers with no openings have an empty slot_start):
//   npi, slot_start, duration_min, telehealth, provider_name, specialty, street_address, city,
//   state, zip, lat, lng, in_network_maya_student_plan, in_network_sarah_employer_ppo,
//   fits_maya_calendar, fits_sarah_calendar, record_type
//   optional: languages ("English;Spanish")
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { pool } from "../lib/db";

// The sheet marks in-network status per persona; these are the plan names those flags stand for.
// They must match PLANS in lib/copy.ts.
const MAYA_PLAN = "Aetna Student Health";
const SARAH_PLAN = "Blue Cross Blue Shield";

type Row = Record<string, string>;
const yes = (v?: string) => (v ?? "").trim().toUpperCase() === "Y";

// "Psychiatrist (MD)" -> "psychiatrist", "Therapist (LCSW)" -> "therapist"
const providerType = (specialty: string) => specialty.split("(")[0].trim().toLowerCase();

async function main() {
  const rows: Row[] = parse(readFileSync("db/seed/providers.csv", "utf8"), {
    columns: true, skip_empty_lines: true, trim: true, bom: true,
  });

  // Group rows by provider
  const byNpi = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.npi) continue;
    byNpi.set(r.npi, [...(byNpi.get(r.npi) ?? []), r]);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let slotCount = 0;

    for (const [npi, provRows] of byNpi) {
      const p = provRows[0];
      const plans = [
        ...(yes(p.in_network_maya_student_plan) ? [MAYA_PLAN] : []),
        ...(yes(p.in_network_sarah_employer_ppo) ? [SARAH_PLAN] : []),
      ];
      const languages = p.languages ? p.languages.split(";").map((s) => s.trim()).filter(Boolean) : ["English"];
      const address = `${p.street_address}, ${p.city}, ${p.state} ${p.zip}`;

      const res = await client.query(
`INSERT INTO providers (npi, provider_name, provider_type, specialty, address, lat, lng, insurance_plans, languages, telehealth, is_synthetic)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT (npi) DO UPDATE SET provider_name = EXCLUDED.provider_name, provider_type = EXCLUDED.provider_type, specialty = EXCLUDED.specialty, address = EXCLUDED.address, lat = EXCLUDED.lat, lng = EXCLUDED.lng, insurance_plans = EXCLUDED.insurance_plans, languages = EXCLUDED.languages, telehealth = EXCLUDED.telehealth, is_synthetic = EXCLUDED.is_synthetic
RETURNING provider_id`,
        [npi, p.provider_name, providerType(p.specialty), p.specialty, address,
         Number(p.lat), Number(p.lng), plans, languages,
         provRows.some((r) => yes(r.telehealth)), p.record_type === "SYNTHETIC_DEMO"],
      );
      const providerId = res.rows[0].provider_id;

      // Replace this provider's open slots (booked/requested slots are kept)
      await client.query(
`DELETE FROM appointment_slots
WHERE provider_id = $1
AND slot_status = 'open'`,
        [providerId],
      );

      for (const r of provRows) {
        if (!r.slot_start) continue; // provider with no openings
        await client.query(
`INSERT INTO appointment_slots (provider_id, slot_start, duration_min, telehealth, fits_maya_calendar, fits_sarah_calendar)
VALUES ($1, ($2::timestamp AT TIME ZONE 'America/New_York'), $3, $4, $5, $6)`,
          [providerId, r.slot_start, Number(r.duration_min), yes(r.telehealth),
           yes(r.fits_maya_calendar), yes(r.fits_sarah_calendar)],
        );
        slotCount++;
      }
    }

    await client.query("COMMIT");
    console.log(`Seeded ${byNpi.size} providers and ${slotCount} open slots`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
