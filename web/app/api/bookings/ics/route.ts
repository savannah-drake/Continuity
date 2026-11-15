// GET /api/bookings/ics?slotId=123: PB-25 "Add to calendar". Returns a one-event .ics file
// that Apple Calendar, Google Calendar and Outlook all open. No health details go in the event
// beyond what the user already sees (provider name + "Appointment").
import { getSlot } from "@/lib/bookings";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export async function GET(req: Request) {
  const slotId = Number(new URL(req.url).searchParams.get("slotId"));
  if (!Number.isInteger(slotId)) return new Response("slotId required", { status: 400 });
  const slot = await getSlot(slotId);
  if (!slot) return new Response("not found", { status: 404 });

  const start = new Date(slot.slot_start);
  const end = new Date(start.getTime() + slot.duration_min * 60_000);
  const reminder = new Date(start.getTime() - 24 * 3600_000);
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Continuity//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:continuity-slot-${slot.slot_id}@continuity`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`Appointment with ${slot.provider_name}`)}`,
    `LOCATION:${esc(slot.telehealth ? "Telehealth" : slot.address)}`,
    `DESCRIPTION:${esc("Requested with Continuity. The office will confirm and check your coverage.")}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Appointment tomorrow", `TRIGGER;VALUE=DATE-TIME:${stamp(reminder)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // inline: iPhone Safari shows "Add to Calendar" instead of saving a file
      "Content-Disposition": `inline; filename="continuity-appointment-${slot.slot_id}.ics"`,
    },
  });
}
