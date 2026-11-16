// /api/visits (signed in): visits with your care team, one-off or recurring ("every 2 weeks").
// Added to Google Calendar automatically when it's connected.
// POST {memberId, startsAt (ISO), durationMin, video, repeatEveryWeeks?, repeatUntil? (YYYY-MM-DD)} -> { visitId, calendar }
// PATCH {visitId, ...same}   DELETE ?id=5 (cancels the visit, or the whole recurring series)
import { NextRequest } from "next/server";
import { getSessionUserId, unauthorizedJson } from "@/lib/session";
import { cleanVisit, addVisit, updateVisit, cancelVisit } from "@/lib/careTeam";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const v = cleanVisit(await req.json().catch(() => null));
  if (!v) return Response.json({ error: "bad_visit" }, { status: 400 });
  const r = await addVisit(userId, v);
  return r.ok ? Response.json(r) : Response.json({ error: r.reason }, { status: 400 });
}

export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const b = await req.json().catch(() => null);
  const v = cleanVisit(b);
  const id = Number(b?.visitId);
  if (!v || !Number.isInteger(id)) return Response.json({ error: "bad_visit" }, { status: 400 });
  if (!(await updateVisit(userId, id, v))) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || !(await cancelVisit(userId, id))) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
