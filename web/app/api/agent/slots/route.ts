// app/api/agent/slots/route.ts
// GET /api/agent/slots?userId=1&type=psychiatrist  (optional: before=YYYY-MM-DD, telehealth=1, language=Spanish,
//   q=the caller's own words, e.g. "counselor", "shrink", "terapeuta", "Dr Park": PB-38, uses Typesense synonyms + typo tolerance)
// -> up to 3 in-network openings before the caller's deadline, soonest first, phrased for speaking.
import { NextRequest } from "next/server";
import { getMe } from "@/lib/me";
import { searchProviders, getOpenSlots, type OpenSlot } from "@/lib/providers";
import { agentAuthorized, unauthorized, spokenWhen } from "@/lib/agentApi";

export async function GET(req: NextRequest) {
  if (!agentAuthorized(req)) return unauthorized();
  const p = req.nextUrl.searchParams;
  const me = await getMe(Number(p.get("userId")));
  if (!me) return Response.json({ error: "not_found" }, { status: 404 });

  const type = p.get("type") === "therapist" ? "therapist" : "psychiatrist";
  // Default deadline: the date the visit must happen by, from the care plan
  const before = p.get("before")
    || (type === "psychiatrist" ? me.medication?.apptBy : me.therapy?.nextSessionBy)
    || undefined;

  const q = p.get("q")?.trim() || undefined;
  const search = (words?: string) => searchProviders({
    plan: me.user.insurance_plan,
    // With the caller's own words, let Typesense (synonyms) decide therapist vs psychiatrist
    type: words ? undefined : type,
    q: words,
    before: before ?? undefined,
    telehealth: p.get("telehealth") === "1", limit: 8,
    language: p.get("language") || undefined,
    lat: me.user.home_lat ?? undefined, lng: me.user.home_lng ?? undefined,
    syntheticOnly: true, // never offer real NPI doctors fake times out loud
  });
  let providers = await search(q);
  let matchedWords = Boolean(q);
  if (q && providers.length === 0) { providers = await search(undefined); matchedWords = false; } // words matched nobody: fall back to the type
  const slots = await getOpenSlots(providers.map((x: any) => x.provider_id), before ?? undefined, 2);

  const options = providers
    .flatMap((prov: any) => (slots.get(prov.provider_id) ?? []).map((s: OpenSlot) => ({ prov, s })))
    .sort((a: { prov: any; s: OpenSlot }, b: { prov: any; s: OpenSlot }) => new Date(a.s.slot_start).getTime() - new Date(b.s.slot_start).getTime())
    .slice(0, 3)
    .map(({ prov, s }: { prov: any; s: OpenSlot }) => ({
      slot_id: s.slot_id,
      provider: prov.provider_name,
      specialty: prov.specialty,
      when: spokenWhen(s.slot_start),
      video_visit: s.telehealth,
      length_minutes: s.duration_min,
      miles_away: prov.distance_miles,
      in_network: true,
    }));

  return Response.json({
    type, deadline: before ?? null, options, note: "Demo availability: times are examples.",
    ...(q ? { searched_for: q, matched_their_words: matchedWords } : {}),
  });
}
