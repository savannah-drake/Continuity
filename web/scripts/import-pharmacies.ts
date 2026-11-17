// scripts/import-pharmacies.ts: loads walk-in pharmacies into Typesense so "Add a pharmacy" can search by distance.
// Source: the public CMS NPI Registry (names, addresses, phones). Locations: US Census batch geocoder (exact address),
// falling back to the ZIP's center. Both free, no key.
//
// Run from the web folder (needs internet, a few minutes for Georgia):
//   npx tsx --env-file=.env.local scripts/import-pharmacies.ts                 # Georgia (default)
//   npx tsx --env-file=.env.local scripts/import-pharmacies.ts --zips=606,607  # add areas by ZIP prefix (here: Chicago)
// Safe to re-run: pharmacies are upserted by NPI. Add --reset to drop and rebuild the collection.
import { typesenseAdmin } from "../lib/typesense";

const NAME = "pharmacies";
const GEORGIA = [...Array.from({ length: 20 }, (_, i) => String(300 + i)), "398", "399"];
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const PREFIXES = arg("zips")?.split(",").map((s) => s.trim()).filter((s) => /^\d{3,5}$/.test(s)) ?? GEORGIA;
const WALK_IN = new Set(["3336C0003X", "333600000X", "3336C0004X", "3336C0002X"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())
  .replace(/\b(Cvs|Llc|Inc|Rx|Ii|Iii|Us|Usa)\b/g, (w) => w.toUpperCase()).replace(/\bOf\b/g, "of");
const phoneFmt = (p?: string) => {
  const d = (p ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : "";
};
const CHAIN = (name: string) =>
  /\bcvs\b|target/i.test(name) ? "CVS" : /walgreen|duane reade/i.test(name) ? "Walgreens" : /walmart/i.test(name) ? "Walmart"
  : /kroger/i.test(name) ? "Kroger" : /publix/i.test(name) ? "Publix" : /costco/i.test(name) ? "Costco" : /sam'?s club/i.test(name) ? "Sam's Club" : "Independent";

type Row = { id: string; name: string; street: string; city: string; state: string; zip: string; phone: string; chain: string; lat?: number; lng?: number };

async function npiPage(prefix: string, skip: number) {
  const url = new URL("https://npiregistry.cms.hhs.gov/api/");
  url.search = new URLSearchParams({ version: "2.1", taxonomy_description: "Pharmacy", enumeration_type: "NPI-2", postal_code: `${prefix}*`, limit: "200", skip: String(skip) }).toString();
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url).catch(() => null);
    if (res?.ok) return (await res.json()).results ?? [];
    await sleep(1500);
  }
  console.warn(`  NPI request failed for ${prefix}* (skip ${skip})`);
  return [];
}

async function pharmaciesFor(prefix: string) {
  const rows: Row[] = [];
  for (let skip = 0; skip <= 1000; skip += 200) {
    const page = await npiPage(prefix, skip);
    for (const r of page) {
      const tax = (r.taxonomies ?? []).find((t: any) => t.primary) ?? r.taxonomies?.[0];
      if (!tax || !WALK_IN.has(tax.code)) continue;
      const loc = (r.addresses ?? []).find((a: any) => a.address_purpose === "LOCATION");
      if (!loc || loc.country_code !== "US") continue;
      const zip = String(loc.postal_code ?? "").slice(0, 5);
      if (!zip.startsWith(prefix)) continue;
      const dba = (r.other_names ?? []).find((o: any) => /business as/i.test(o.type ?? "") && o.organization_name)?.organization_name;
      const name = title(dba || r.basic?.organization_name || "");
      if (!name) continue;
      rows.push({ id: String(r.number), name, chain: CHAIN(name), zip, state: loc.state, city: title(loc.city ?? ""),
        street: title([loc.address_1, loc.address_2].filter(Boolean).join(" ")), phone: phoneFmt(loc.telephone_number) });
    }
    if (page.length < 200) break;
    await sleep(300);
  }
  return rows;
}

// US Census batch geocoder: up to 10,000 addresses per request; we send 1,000 at a time
async function geocode(rows: Row[]) {
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const csv = chunk.map((r) => [r.id, r.street, r.city, r.state, r.zip].map((v) => `"${v.replace(/"/g, "")}"`).join(",")).join("\n");
    const form = new FormData();
    form.append("benchmark", "Public_AR_Current");
    form.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
    const res = await fetch("https://geocoding.geo.census.gov/geocoder/locations/addressbatch", { method: "POST", body: form }).catch(() => null);
    if (!res?.ok) { console.warn("  census geocoder failed; using ZIP centers"); continue; }
    const byId = new Map(chunk.map((r) => [r.id, r]));
    for (const line of (await res.text()).split("\n")) {
      // "id","input address","Match","Exact","matched address","lon,lat","tigerid","side"
      const cells = line.match(/"([^"]*)"/g)?.map((c) => c.slice(1, -1));
      if (!cells || cells[2] !== "Match") continue;
      const [lon, lat] = (cells[5] ?? "").split(",").map(Number);
      const r = byId.get(cells[0]);
      if (r && Number.isFinite(lat) && Number.isFinite(lon)) { r.lat = lat; r.lng = lon; }
    }
  }
  // Anything the census couldn't place: center of its ZIP
  const zipCache = new Map<string, [number, number] | null>();
  for (const r of rows.filter((x) => x.lat == null)) {
    if (!zipCache.has(r.zip)) {
      const z = await fetch(`https://api.zippopotam.us/us/${r.zip}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      const p = z?.places?.[0];
      zipCache.set(r.zip, p ? [Number(p.latitude), Number(p.longitude)] : null);
      await sleep(100);
    }
    const c = zipCache.get(r.zip);
    if (c) { r.lat = c[0]; r.lng = c[1]; }
  }
}

async function ensureCollection() {
  if (process.argv.includes("--reset")) { try { await typesenseAdmin.collections(NAME).delete(); } catch { /* none yet */ } }
  try { await typesenseAdmin.collections(NAME).retrieve(); return; } catch { /* create it */ }
  await typesenseAdmin.collections().create({
    name: NAME,
    fields: [
      { name: "name", type: "string" },
      { name: "street", type: "string" },
      { name: "city", type: "string", facet: true },
      { name: "state", type: "string", facet: true },
      { name: "zip", type: "string", facet: true },
      { name: "phone", type: "string", index: false, optional: true },
      { name: "chain", type: "string", facet: true },
      { name: "location", type: "geopoint" },
    ],
  });
}

async function main() {
  await ensureCollection();
  let total = 0;
  for (const prefix of PREFIXES) {
    const rows = await pharmaciesFor(prefix);
    await geocode(rows);
    const docs = rows.filter((r) => r.lat != null).map(({ lat, lng, ...r }) => ({ ...r, location: [lat!, lng!] }));
    if (docs.length) {
      const results = await typesenseAdmin.collections(NAME).documents().import(docs, { action: "upsert" });
      const failed = (results as any[]).filter((x) => !x.success).length;
      if (failed) console.warn(`  ${failed} failed to import`);
    }
    total += docs.length;
    console.log(`${prefix}*: ${docs.length} pharmacies`);
  }
  console.log(`Done: ${total} pharmacies in Typesense collection "${NAME}".`);
}

main().catch((e) => { console.error(e); process.exit(1); });
