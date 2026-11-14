// lib/providers.ts
// Provider search over Typesense. Used by /api/providers now and the FaceTime agent later.
import { typesenseSearch } from "./typesense";
import { query } from "./db";

const EMORY = { lat: 33.7925, lng: -84.324 };

export type ProviderSearch = {
  q?: string;                 // free text: name, specialty ("LCSW"), type
  plan?: string;              // insurance plan name, e.g. "Aetna Student Health"
  type?: string;              // psychiatrist | therapist | psychologist
  before?: string;            // only providers with an opening before this date (YYYY-MM-DD)
  language?: string;          // e.g. "Spanish"
  telehealth?: boolean;
  syntheticOnly?: boolean;
  radiusMiles?: number;      // only providers within N miles of lat/lng (Typesense geo filter)
  sort?: "soonest" | "nearest";   // only Ivy's demo providers (used by the FaceTime agent)
  lat?: number;
  lng?: number;
  limit?: number;
};

const quote = (v: string) => "`" + v.replace(/`/g, "") + "`"; // Typesense filter value with spaces

export async function searchProviders(s: ProviderSearch) {
  const lat = s.lat ?? EMORY.lat;
  const lng = s.lng ?? EMORY.lng;
  const filters = ["open_slot_count:>0"];
  if (s.plan) filters.push(`insurance_plans:=${quote(s.plan)}`);
  if (s.type) filters.push(`provider_type:=${quote(s.type)}`);
  if (s.language) filters.push(`languages:=${quote(s.language)}`);
  if (s.telehealth) filters.push("telehealth:=true");
  if (s.syntheticOnly) filters.push("is_synthetic:=true");
  if (s.radiusMiles) filters.push(`location:(${lat}, ${lng}, ${s.radiusMiles} mi)`);
  if (s.before) {
    const cutoff = Math.floor(new Date(`${s.before}T23:59:59-05:00`).getTime() / 1000);
    filters.push(`next_open_slot:<${cutoff}`);
  }


  const res = await typesenseSearch.collections("providers").documents().search({
    q: s.q?.trim() || "*",
    query_by: "provider_name,specialty,provider_type",
    filter_by: filters.join(" && "),
    sort_by: s.sort === "nearest"
      ? `location(${lat}, ${lng}):asc,next_open_slot:asc`   // nearest first, then soonest
      : `next_open_slot:asc,location(${lat}, ${lng}):asc`,  // soonest opening, then nearest
    per_page: s.limit ?? 10,
  } as any);

  return (res.hits ?? []).map((h: any) => ({
    ...h.document,
    next_open_slot_iso: new Date(h.document.next_open_slot * 1000).toISOString(),
    distance_miles: Number(((h.geo_distance_meters?.location ?? 0) / 1609.34).toFixed(1)),
  }));
}

// Open slots for a set of providers, soonest first, up to `perProvider` each.
// Tiger is the source of truth for slots; Typesense only knows each provider's soonest opening.

export type OpenSlot = {
  slot_id: number; provider_id: number; slot_start: string; duration_min: number;
  telehealth: boolean; fits_maya_calendar: boolean | null; fits_sarah_calendar: boolean | null;
};

export async function getOpenSlots(providerIds: number[], before?: string, perProvider = 3) {
  if (providerIds.length === 0) return new Map<number, OpenSlot[]>();
  const cutoff = before ? `${before}T23:59:59-05:00` : "2100-01-01T00:00:00Z";
  const rows = await query<OpenSlot>(
`SELECT s.slot_id, s.provider_id, s.slot_start, s.duration_min, s.telehealth, s.fits_maya_calendar, s.fits_sarah_calendar
FROM appointment_slots s
WHERE s.provider_id = ANY($1)
AND s.slot_status = 'open'
AND s.slot_start > now()
AND s.slot_start < $2
ORDER BY s.slot_start`,
    [providerIds, cutoff],
  );
  const byProvider = new Map<number, OpenSlot[]>();
  for (const r of rows) {
    const list = byProvider.get(r.provider_id) ?? [];
    if (list.length < perProvider) list.push(r);
    byProvider.set(r.provider_id, list);
  }
  return byProvider;
}
