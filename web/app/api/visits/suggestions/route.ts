// /api/visits/suggestions (signed in): calendar events like "Appointment with Antionette Holt" that might be visits.
// GET -> { suggestions: [{eventId, name, startsAt, durationMin}] }   (read live from Google, nothing stored)
// POST {eventId, role: "therapist" | "psychiatrist" | null} -> adds them to your care team and imports, or "not a visit"
import { getSessionUserId, unauthorizedJson } from "@/lib/session";
import { visitSuggestions, answerSuggestion } from "@/lib/importVisits";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  return Response.json({ suggestions: await visitSuggestions(userId).catch(() => []) });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const b = await req.json().catch(() => null);
  const eventId = typeof b?.eventId === "string" ? b.eventId.slice(0, 200) : "";
  const role = b?.role === "therapist" || b?.role === "psychiatrist" ? b.role : b?.role === null ? null : undefined;
  if (!eventId || role === undefined) return Response.json({ error: "bad_request" }, { status: 400 });
  const r = await answerSuggestion(userId, eventId, role);
  return r.ok ? Response.json(r) : Response.json({ error: "not_found" }, { status: 404 });
}
