// lib/agentApi.ts
// The FaceTime agent calls /api/agent/* with header "x-agent-key: <AGENT_API_KEY>".
// Anything without the right key is refused, so random visitors can't book slots.
export function agentAuthorized(req: Request) {
  const expected = process.env.AGENT_API_KEY;
  return !!expected && req.headers.get("x-agent-key") === expected;
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

// Spoken-friendly date/time, e.g. "Monday, November 16 at 9:00 AM"
export const spokenWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "America/New_York",
  }).replace(",", "").replace(/,(?=[^,]*$)/, " at");

export const spokenDay = (d: string | null | undefined) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : null;
