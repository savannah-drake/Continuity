// /api/calendar: PB-27. Add your schedule so Continuity only offers times you're free.
// POST { userId, ics?: string (file contents), url?: string (Google/Apple/Outlook "secret iCal address") }
// GET ?userId=1  -> { connected, upcomingBusy }      DELETE ?userId=1 -> disconnect
// Only busy start/end times are saved. Titles, places, notes and attendees are never stored.
import { NextRequest } from "next/server";
import { saveCalendar, clearCalendar, calendarSummary } from "@/lib/busy";
import { normalizeCalendarUrl } from "@/lib/calendar";

const MAX_BYTES = 2_000_000;

export async function GET(req: NextRequest) {
  const userId = Number(req.nextUrl.searchParams.get("userId"));
  if (!Number.isInteger(userId) || userId <= 0) return Response.json({ error: "userId required" }, { status: 400 });
  return Response.json(await calendarSummary(userId));
}

export async function DELETE(req: NextRequest) {
  const userId = Number(req.nextUrl.searchParams.get("userId"));
  if (!Number.isInteger(userId) || userId <= 0) return Response.json({ error: "userId required" }, { status: 400 });
  await clearCalendar(userId);
  return Response.json({ connected: false });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const userId = Number(body.userId);
  if (!Number.isInteger(userId) || userId <= 0) return Response.json({ error: "userId required" }, { status: 400 });

  let ics: string = typeof body.ics === "string" ? body.ics : "";
  if (!ics && typeof body.url === "string" && body.url.trim()) {
    try {
      const res = await fetch(normalizeCalendarUrl(body.url), { signal: AbortSignal.timeout(8000), redirect: "follow" });
      if (!res.ok) return Response.json({ error: "link_failed" }, { status: 400 });
      ics = await res.text();
    } catch {
      return Response.json({ error: "link_failed" }, { status: 400 });
    }
  }
  if (!ics || ics.length > MAX_BYTES || !ics.includes("BEGIN:VCALENDAR")) {
    return Response.json({ error: "not_a_calendar" }, { status: 400 });
  }
  try {
    const { count, next } = await saveCalendar(userId, ics);
    return Response.json({ connected: count > 0, busyBlocks: count, nextBusy: next });
  } catch (e) {
    console.error("calendar save failed", e);
    return Response.json({ error: "save_failed" }, { status: 500 });
  }
}
