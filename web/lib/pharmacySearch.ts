// lib/pharmacySearch.ts: walk-in pharmacies near you.
// 1) Typesense "pharmacies" collection (loaded by scripts/import-pharmacies.ts): geo search, closest first, with
//    name/street search and distances.
// 2) If Typesense isn't loaded for that area (or is down): live CMS NPI Registry lookup by ZIP, closest ZIPs first.
import { typesenseSearch } from "./typesense";

export type PharmacyHit = { npi: string; name: string; address: string; phone: string | null; zip: string; miles?: number };

// NUCC taxonomy codes for pharmacies a person can walk into (skips mail-order, long-term care, nuclear, infusion)
const WALK_IN = new Set(["3336C0003X", "333600000X", "3336C0004X", "3336C0002X"]);

const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())
  .replace(/\b(Cvs|Llc|Inc|Rx|Ii|Iii|Us|Usa)\b/g, (w) => w.toUpperCase()).replace(/\bOf\b/g, "of");
const phoneFmt = (p?: string) => {
  const d = (p ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : null;
};

async function fetchNpi(params: Record<string, string>) {
  const url = new URL("https://npiregistry.cms.hhs.gov/api/");
  url.search = new URLSearchParams({ version: "2.1", taxonomy_description: "Pharmacy", enumeration_type: "NPI-2", limit: "200", ...params }).toString();
  const res = await fetch(url, { next: { revalidate: 24 * 3600 } } as RequestInit).catch((e) => { console.error("pharmacy search failed", e); return null; });
  if (!res?.ok) { if (res) console.error("pharmacy search failed", res.status); return null; }
  return res.json().catch(() => null);
}

// Every walk-in pharmacy whose store ZIP starts with this prefix (the registry allows "303*"; up to 600 here)
async function npiArea(prefix: string): Promise<PharmacyHit[]> {
  const out: PharmacyHit[] = [];
  for (let skip = 0; skip <= 400; skip += 200) {
    const data = await fetchNpi({ postal_code: `${prefix}*`, skip: String(skip) });
    if (data?.Errors) { console.error("pharmacy search rejected", JSON.stringify(data.Errors).slice(0, 200)); break; }
    const results = data?.results ?? [];
    for (const r of results) {
      const tax = (r.taxonomies ?? []).find((t: any) => t.primary) ?? r.taxonomies?.[0];
      if (!tax || !WALK_IN.has(tax.code)) continue;
      const loc = (r.addresses ?? []).find((a: any) => a.address_purpose === "LOCATION");
      if (!loc || loc.country_code !== "US") continue;
      const zip = String(loc.postal_code ?? "").slice(0, 5);
      if (!zip.startsWith(prefix)) continue; // the store itself has to be in the area
      const dba = (r.other_names ?? []).find((o: any) => /business as/i.test(o.type ?? "") && o.organization_name)?.organization_name;
      const name = title(dba || r.basic?.organization_name || "");
      if (!name) continue;
      out.push({
        npi: String(r.number), name, zip, phone: phoneFmt(loc.telephone_number),
        address: title([loc.address_1, loc.address_2].filter(Boolean).join(" ")) + `, ${title(loc.city ?? "")}, ${loc.state} ${zip}`,
      });
    }
    if (results.length < 200) break;
  }
  return out;
}

// Center of a ZIP code (free lookup, cached for a month)
const zipCoords = async (zip: string): Promise<[number, number] | null> => {
  const z = await fetch(`https://api.zippopotam.us/us/${zip}`, { next: { revalidate: 30 * 24 * 3600 } } as RequestInit).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  const p = z?.places?.[0];
  return p ? [Number(p.latitude), Number(p.longitude)] : null;
};
const milesBetween = (a: [number, number], b: [number, number]) => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return Math.round(3958.8 * 2 * Math.asin(Math.sqrt(h)) * 10) / 10;
};

// An area Typesense doesn't have yet: ask the registry, place each store at its ZIP's center, list closest first,
// and save the area into Typesense (when the admin key is set) so the next search there is instant.
async function npiNear(zip: string, center: [number, number] | null, max = 25) {
  const area = await npiArea(zip.slice(0, 3));
  const zips = [...new Set(area.map((p) => p.zip))].slice(0, 40);
  const coords = new Map(await Promise.all(zips.map(async (z) => [z, await zipCoords(z)] as const)));
  for (const p of area) {
    const c = coords.get(p.zip);
    if (c && center) p.miles = milesBetween(center, c);
  }
  cacheArea(area, coords).catch(() => {});
  return area
    .sort((a, b) => (a.miles ?? Math.abs(Number(a.zip) - Number(zip))) - (b.miles ?? Math.abs(Number(b.zip) - Number(zip))) || a.name.localeCompare(b.name))
    .slice(0, max);
}

async function cacheArea(area: PharmacyHit[], coords: Map<string, [number, number] | null>) {
  if (!process.env.TYPESENSE_ADMIN_KEY) return;
  const { typesenseAdmin } = await import("./typesense");
  const docs = area.filter((p) => coords.get(p.zip)).map((p) => {
    const [street, city, stateZip] = p.address.split(", ");
    return { id: p.npi, name: p.name, street, city: city ?? "", state: (stateZip ?? "").split(" ")[0], zip: p.zip, phone: p.phone ?? "", chain: "", location: coords.get(p.zip)! };
  });
  if (docs.length) await typesenseAdmin.collections("pharmacies").documents().import(docs, { action: "emplace" });
}

// Center point for a ZIP: from a pharmacy we already have in that ZIP, else the free ZIP lookup
async function zipCenter(zip: string): Promise<[number, number] | null> {
  try {
    const r: any = await typesenseSearch.collections("pharmacies").documents().search({ q: "*", filter_by: `zip:=${zip}`, per_page: 1 });
    const loc = r.hits?.[0]?.document?.location;
    if (loc) return [loc[0], loc[1]];
  } catch { /* not loaded */ }
  return zipCoords(zip);
}

async function typesenseNear(lat: number, lng: number, q: string, max: number): Promise<PharmacyHit[] | null> {
  try {
    const r: any = await typesenseSearch.collections("pharmacies").documents().search({
      q: q || "*", query_by: "name,street,city,chain", prefix: true, num_typos: 1,
      filter_by: `location:(${lat}, ${lng}, 40 km)`,
      sort_by: `location(${lat}, ${lng}):asc`,
      per_page: max,
    });
    return (r.hits ?? []).map((h: any) => {
      const d = h.document;
      return { npi: d.id, name: d.name, zip: d.zip, phone: d.phone || null, address: `${d.street}, ${d.city}, ${d.state} ${d.zip}`,
        miles: h.geo_distance_meters?.location != null ? Math.round((h.geo_distance_meters.location / 1609.34) * 10) / 10 : undefined };
    });
  } catch (e) {
    console.error("pharmacy search: Typesense unavailable", (e as Error)?.message);
    return null;
  }
}

export async function pharmaciesNear(opts: { zip?: string | null; lat?: number | null; lng?: number | null; q?: string }, max = 25) {
  const q = (opts.q ?? "").trim().slice(0, 60);
  const zip = opts.zip && /^\d{5}$/.test(opts.zip) ? opts.zip : null;
  const center = zip ? await zipCenter(zip) : opts.lat != null && opts.lng != null ? [opts.lat, opts.lng] as [number, number] : null;
  if (center) {
    const hits = await typesenseNear(center[0], center[1], q, max);
    if (hits && hits.length) return hits;
  }
  // Nothing loaded for this area yet: ask the registry directly (by ZIP), filtering by the search words here
  if (!zip) return [];
  const words = q.toLowerCase();
  return (await npiNear(zip, center as [number, number] | null, 200)).filter((p) => !words || p.name.toLowerCase().includes(words) || p.address.toLowerCase().includes(words)).slice(0, max);
}
