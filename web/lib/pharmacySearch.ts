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

async function query(postal: string): Promise<PharmacyHit[]> {
  let data = await fetchNpi({ postal_code: postal, address_purpose: "LOCATION" });
  if (data?.Errors) {
    console.error("pharmacy search rejected", JSON.stringify(data.Errors).slice(0, 200));
    data = await fetchNpi({ postal_code: postal }); // older behavior: match any address, filtered to the location below
  }
  const out: PharmacyHit[] = [];
  for (const r of data?.results ?? []) {
    const tax = (r.taxonomies ?? []).find((t: any) => t.primary) ?? r.taxonomies?.[0];
    if (!tax || !WALK_IN.has(tax.code)) continue;
    const loc = (r.addresses ?? []).find((a: any) => a.address_purpose === "LOCATION");
    if (!loc || loc.country_code !== "US") continue;
    const dba = (r.other_names ?? []).find((o: any) => /business as/i.test(o.type ?? "") && o.organization_name)?.organization_name;
    const name = title(dba || r.basic?.organization_name || "");
    if (!name) continue;
    const zip = String(loc.postal_code ?? "").slice(0, 5);
    if (!zip.startsWith(postal.replace("*", ""))) continue; // the store itself has to be in the area searched
    out.push({
      npi: String(r.number), name, zip, phone: phoneFmt(loc.telephone_number),
      address: title([loc.address_1, loc.address_2].filter(Boolean).join(" ")) + `, ${title(loc.city ?? "")}, ${loc.state} ${zip}`,
    });
  }
  return out;
}

async function npiNear(zip: string, max = 25) {
  if (!/^\d{5}$/.test(zip)) return [];
  const exact = await query(`${zip}*`);
  const nearby = exact.length >= max ? [] : await query(`${zip.slice(0, 4)}*`);
  const seen = new Set<string>();
  return [...exact, ...nearby]
    .filter((p) => !seen.has(p.npi) && seen.add(p.npi))
    .sort((a, b) => Math.abs(Number(a.zip) - Number(zip)) - Math.abs(Number(b.zip) - Number(zip)) || a.name.localeCompare(b.name))
    .slice(0, max);
}

// Center point for a ZIP: from a pharmacy we already have in that ZIP, else the free ZIP lookup
async function zipCenter(zip: string): Promise<[number, number] | null> {
  try {
    const r: any = await typesenseSearch.collections("pharmacies").documents().search({ q: "*", filter_by: `zip:=${zip}`, per_page: 1 });
    const loc = r.hits?.[0]?.document?.location;
    if (loc) return [loc[0], loc[1]];
  } catch { /* not loaded */ }
  const z = await fetch(`https://api.zippopotam.us/us/${zip}`, { next: { revalidate: 30 * 24 * 3600 } } as RequestInit).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  const p = z?.places?.[0];
  return p ? [Number(p.latitude), Number(p.longitude)] : null;
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
  // Nothing loaded for this area: ask the registry directly (by ZIP only), filtering by the search words here
  if (!zip) return [];
  const words = q.toLowerCase();
  return (await npiNear(zip, 60)).filter((p) => !words || p.name.toLowerCase().includes(words) || p.address.toLowerCase().includes(words)).slice(0, max);
}
