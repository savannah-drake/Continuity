// /api/medications (signed in): your medications. Each one gets its own timeline and, with Google Calendar
// connected, a daily reminder at reminderTime and a "book your visit by" deadline.
// GET -> { medications }   POST {label, daysSupplyRemaining, refillsRemaining, rxExpiresOn?, requiresAppointmentForRenewal, bookingLeadDays, reminderTime?}
// PATCH {medicationId, ...same fields}   DELETE ?id=12
import { NextRequest } from "next/server";
import { runAlerts } from "@/lib/alerts";
import { getSessionUserId, unauthorizedJson } from "@/lib/session";
import { getMe } from "@/lib/me";
import { cleanMed, upsertMedication, updateMedication, removeMedication, syncMedReminders } from "@/lib/medications";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const me = await getMe(userId);
  return Response.json({ medications: me?.medications ?? [] });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const m = cleanMed(await req.json().catch(() => null));
  if (!m) return Response.json({ error: "bad_medication" }, { status: 400 });
  const medicationId = await upsertMedication(userId, m);
  await syncMedReminders(userId).catch((e) => console.error("reminder sync failed", e));
  await runAlerts(userId, { justSaved: medicationId }).catch((e) => console.error("alert failed", e));
  return Response.json({ medicationId });
}

export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const b = await req.json().catch(() => null);
  const m = cleanMed(b);
  const id = Number(b?.medicationId);
  if (!m || !Number.isInteger(id)) return Response.json({ error: "bad_medication" }, { status: 400 });
  if (!(await updateMedication(userId, id, m))) return Response.json({ error: "not_found" }, { status: 404 });
  await syncMedReminders(userId).catch((e) => console.error("reminder sync failed", e));
  await runAlerts(userId, { justSaved: id }).catch((e) => console.error("alert failed", e));
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || !(await removeMedication(userId, id))) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
