// lib/providers.ts
// Provider search over Typesense. Used by /api/providers now and the FaceTime agent later.
import { typesenseSearch } from "./typesense";

const EMORY = { lat: 33.7925, lng: -84.324 };

export type ProviderSearch = {
  q?: string;                 // free text: name, specialty ("LCSW"), type
  plan?: string;              // insurance plan name, e.g. "Aetna Student Health"
  type?: string;              // psychiatrist | therapist | psychologist
  before?: string;            // only providers with an opening before this date (YYYY-MM-DD)
  language?: string;          // e.g. "Spanish"
  telehealth?: boolean;
  lat?: number;
  lng?: number;
  limit?: number;
};

const quote = (v: string) => "`" + v.replace(/`/g, "") + "`"; // Typesense filter value with spaces

export async function searchProviders(s: ProviderSearch) {
  const filters = ["open_slot_count:>0"];
  if (s.plan) filters.push(`insurance_plans:=${quote(s.plan)}`);
  if (s.type) filters.push(`provider_type:=${quote(s.type)}`);
  if (s.language) filters.push(`languages:=${quote(s.language)}`);
  if (s.telehealth) filters.push("telehealth:=true");
  if (s.before) {
    const cutoff = Math.floor(new Date(`${s.before}T23:59:59-05:00`).getTime() / 1000);
    filters.push(`next_open_slot:<${cutoff}`);
  }

  const lat = s.lat ?? EMORY.lat;
  const lng = s.lng ?? EMORY.lng;

  const res = await typesenseSearch.collections("providers").documents().search({
    q: s.q?.trim() || "*",
    query_by: "provider_name,specialty,provider_type",
    filter_by: filters.join(" && "),
    sort_by: `next_open_slot:asc,location(${lat}, ${lng}):asc`, // soonest opening, then nearest
    per_page: s.limit ?? 10,
  } as any);

  return (res.hits ?? []).map((h: any) => ({
    ...h.document,
    next_open_slot_iso: new Date(h.document.next_open_slot * 1000).toISOString(),
    distance_miles: Number(((h.geo_distance_meters?.location ?? 0) / 1609.34).toFixed(1)),
  }));
}
