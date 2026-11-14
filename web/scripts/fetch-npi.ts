// scripts/fetch-npi.ts
// Pulls REAL mental-health providers near Emory from the public NPPES NPI Registry,
// geocodes their addresses with the US Census Geocoder, then adds DEMO insurance + availability
// (no public source exists for those). Writes db/seed/providers_npi.csv in the same format as
// Ivy's sheet, so seed-db.ts can load it.
//
// Run from the web folder (needs internet, takes ~1–3 minutes):
//   npx tsx scripts/fetch-npi.ts
//
// Sources (both free, no key):
//   https://npiregistry.cms.hhs.gov/api/      provider names, credentials, practice addresses
//   https://geocoding.geo.census.gov/geocoder/ address -> lat/lng
import { writeFileSync } from "node:fs";

// ZIPs within a few miles of Emory (Druid Hills, Decatur, Midtown, Virginia-Highland, Toco Hills…)
const NEARBY_ZIPS = new Set(["30322", "30329", "30306", "30307", "30030", "30033", "30317", "30324", "30345", "30308", "30309", "30319", "30002"]);
const CITIES = ["ATLANTA", "DECATUR"];

// NPPES taxonomy descriptions -> our provider types
const TAXONOMIES: { query: string; type: string; label: string }[] = [
  { query: "Psychiatry", type: "psychiatrist", label: "Psychiatrist" },
  { query: "Psychologist", type: "psychologist", label: "Psychologist" },
  { query: "Clinical Social Worker", type: "therapist", label: "Therapist" },
  { query: "Counselor", type: "therapist", label: "Therapist" },
  { query: "Marriage & Family Therapist", type: "therapist", label: "Therapist" },
];

const MAX_PROVIDERS = 80;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Deterministic "random" so re-running produces the same demo data
function rng(seedStr: string) {
  let h = 2166136261;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

type Provider = {
  npi: string; name: string; specialty: string; type: string;
  street: string; city: string; state: string; zip: string; lat?: number; lng?: number;
};

const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

async function fetchNppes(taxonomy: string, city: string) {
  const url = new URL("https://npiregistry.cms.hhs.gov/api/");
  url.search = new URLSearchParams({
    version: "2.1", enumeration_type: "NPI-1", taxonomy_description: taxonomy,
    city, state: "GA", limit: "200",
  }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NPPES ${res.status}`);
  const data: any = await res.json();
  return (data.results ?? []) as any[];
}

async function geocode(p: Provider) {
  const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  url.search = new URLSearchParams({
    address: `${p.street}, ${p.city}, ${p.state} ${p.zip}`, benchmark: "Public_AR_Current", format: "json",
  }).toString();
  try {
    const res = await fetch(url);
    const data: any = await res.json();
    const m = data?.result?.addressMatches?.[0]?.coordinates;
    if (m) { p.lat = Number(m.y.toFixed(5)); p.lng = Number(m.x.toFixed(5)); }
  } catch { /* leave ungeocoded; skipped below */ }
}

function demoSlots(npi: string) {
  const r = rng(npi);
  const slots: { start: string; duration: number; tele: boolean; fitsMaya: boolean; fitsSarah: boolean }[] = [];
  const count = r() < 0.12 ? 0 : 1 + Math.floor(r() * 5); // ~12% have no openings
  const base = new Date("2026-11-16T00:00:00Z");
  for (let i = 0; i < count; i++) {
    let d = new Date(base.getTime() + Math.floor(r() * 18) * 86400000);
    while ([0, 6].includes(d.getUTCDay())) d = new Date(d.getTime() + 86400000); // weekdays only
    const hour = 9 + Math.floor(r() * 9);
    const min = [0, 15, 30, 45][Math.floor(r() * 4)];
    const date = d.toISOString().slice(0, 10);
    slots.push({
      start: `${date} ${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
      duration: [30, 45, 50, 60][Math.floor(r() * 4)],
      tele: r() < 0.6, fitsMaya: r() < 0.45, fitsSarah: r() < 0.35,
    });
  }
  return slots;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
  const found = new Map<string, Provider>();

  for (const t of TAXONOMIES) {
    for (const city of CITIES) {
      try {
        const results = await fetchNppes(t.query, city);
        for (const r of results) {
          const loc = (r.addresses ?? []).find((a: any) => a.address_purpose === "LOCATION");
          if (!loc) continue;
          const zip = String(loc.postal_code ?? "").slice(0, 5);
          if (!NEARBY_ZIPS.has(zip) || found.has(String(r.number))) continue;
          const b = r.basic ?? {};
          const credential = (b.credential ?? "").replace(/\./g, "").trim();
          const name = `${title(`${b.first_name ?? ""} ${b.last_name ?? ""}`.trim())}${credential ? `, ${credential}` : ""}`;
          const tax = (r.taxonomies ?? []).find((x: any) => x.primary) ?? r.taxonomies?.[0];
          found.set(String(r.number), {
            npi: String(r.number), name, type: t.type,
            specialty: `${t.label}${credential ? ` (${credential})` : ""}`,
            street: title(`${loc.address_1 ?? ""} ${loc.address_2 ?? ""}`.trim()),
            city: title(loc.city ?? city), state: loc.state ?? "GA", zip,
          });
        }
        console.log(`${t.query} / ${city}: ${found.size} nearby providers so far`);
      } catch (e) {
        console.warn(`Skipped ${t.query} / ${city}:`, (e as Error).message);
      }
      await sleep(300);
    }
  }

  const providers = [...found.values()].slice(0, MAX_PROVIDERS);
  console.log(`Geocoding ${providers.length} addresses…`);
  for (const p of providers) { await geocode(p); await sleep(150); }
  const located = providers.filter((p) => p.lat && p.lng);

  const header = "npi,slot_start,duration_min,telehealth,provider_name,specialty,street_address,city,state,zip,lat,lng,in_network_maya_student_plan,in_network_sarah_employer_ppo,fits_maya_calendar,fits_sarah_calendar,record_type";
  const lines = [header];
  for (const p of located) {
    const r = rng(`plans-${p.npi}`);
    const maya = r() < 0.55 ? "Y" : "N";
    const sarah = r() < 0.55 ? "Y" : "N";
    const base = [p.name, p.specialty, p.street, p.city, p.state, p.zip, p.lat!, p.lng!];
    const slots = demoSlots(p.npi);
    if (slots.length === 0) {
      lines.push([p.npi, "", "", "", ...base, maya, sarah, "", "", "REAL_NPI_DEMO_AVAILABILITY"].map(csvCell).join(","));
    }
    for (const s of slots) {
      lines.push([p.npi, s.start, s.duration, s.tele ? "Y" : "N", ...base, maya, sarah,
        s.fitsMaya ? "Y" : "N", s.fitsSarah ? "Y" : "N", "REAL_NPI_DEMO_AVAILABILITY"].map(csvCell).join(","));
    }
  }

  writeFileSync("db/seed/providers_npi.csv", lines.join("\n") + "\n");
  console.log(`Wrote db/seed/providers_npi.csv: ${located.length} real providers (${providers.length - located.length} skipped, address not found)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
