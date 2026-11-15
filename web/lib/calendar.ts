// lib/calendar.ts: PB-27. Turns a calendar file (.ics from Google, Apple or Outlook) into BUSY times only.
// We never keep event titles, places, notes or attendees: just start and end.
// Handles: one-off events, weekly/daily repeats (BYDAY, INTERVAL, UNTIL, COUNT), EXDATE skips,
// TZID or UTC times, DTEND or DURATION. Skips all-day, cancelled and "free" (TRANSPARENT) events.

export type Busy = { start: Date; end: Date };

const DEFAULT_TZ = "America/New_York";
const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Unfold long lines (RFC 5545: a line starting with a space continues the previous one)
function unfold(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

type Prop = { name: string; params: Record<string, string>; value: string };
function parseLine(line: string): Prop | null {
  const i = line.indexOf(":");
  if (i < 0) return null;
  const [name, ...params] = line.slice(0, i).split(";");
  const p: Record<string, string> = {};
  for (const kv of params) {
    const [k, v] = kv.split("=");
    if (k && v) p[k.toUpperCase()] = v.replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params: p, value: line.slice(i + 1).trim() };
}

// Offset (ms) of a time zone at a given UTC instant, using the built-in time zone database
function tzOffset(utcMs: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - utcMs;
}

// Wall-clock time in a time zone -> real instant
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = guess - tzOffset(guess, tz);
  t = guess - tzOffset(t, tz); // second pass handles daylight-saving edges
  return new Date(t);
}

type Wall = { y: number; mo: number; d: number; h: number; mi: number; s: number; utc: boolean; dateOnly: boolean };
function parseWall(v: string): Wall | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  return {
    y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] ?? 0), mi: +(m[5] ?? 0), s: +(m[6] ?? 0),
    utc: m[7] === "Z", dateOnly: m[4] === undefined,
  };
}
const toInstant = (w: Wall, tz: string) =>
  w.utc ? new Date(Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s)) : zonedToUtc(w.y, w.mo, w.d, w.h, w.mi, w.s, tz);

function validTz(tz?: string) {
  if (!tz) return DEFAULT_TZ;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return DEFAULT_TZ; }
}

function durationMs(v: string) {
  const m = v.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  return ((+(m[1] ?? 0) * 7 + +(m[2] ?? 0)) * 86400 + +(m[3] ?? 0) * 3600 + +(m[4] ?? 0) * 60 + +(m[5] ?? 0)) * 1000;
}

export function parseIcs(text: string, window: { from: Date; to: Date }): Busy[] {
  const out: Busy[] = [];
  let ev: Prop[] | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") { ev = []; continue; }
    if (line === "END:VEVENT") { if (ev) out.push(...expandEvent(ev, window)); ev = null; continue; }
    if (ev) { const p = parseLine(line); if (p) ev.push(p); }
  }
  // Merge overlaps so the database stays small
  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Busy[] = [];
  for (const b of out) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) { if (b.end > last.end) last.end = b.end; }
    else merged.push({ ...b });
  }
  return merged;
}

function expandEvent(props: Prop[], window: { from: Date; to: Date }): Busy[] {
  const get = (n: string) => props.find((p) => p.name === n);
  if (get("STATUS")?.value === "CANCELLED" || get("TRANSP")?.value === "TRANSPARENT") return [];
  if (get("RECURRENCE-ID")) {
    // A moved single instance of a repeating event: treat it as its own one-off event
  }
  const ds = get("DTSTART");
  if (!ds) return [];
  const startWall = parseWall(ds.value);
  if (!startWall || startWall.dateOnly) return []; // all-day events (holidays, birthdays) don't block a time
  const tz = validTz(ds.params.TZID);
  const first = toInstant(startWall, tz);

  let lengthMs = 0;
  const de = get("DTEND");
  if (de) { const w = parseWall(de.value); if (w) lengthMs = toInstant(w, validTz(de.params.TZID)).getTime() - first.getTime(); }
  else if (get("DURATION")) lengthMs = durationMs(get("DURATION")!.value);
  if (lengthMs <= 0) lengthMs = 60 * 60 * 1000;
  if (lengthMs > 24 * 3600 * 1000) return []; // multi-day blocks (trips) are skipped for the demo

  const excluded = new Set<number>();
  for (const ex of props.filter((p) => p.name === "EXDATE")) {
    const exTz = validTz(ex.params.TZID ?? ds.params.TZID);
    for (const v of ex.value.split(",")) { const w = parseWall(v); if (w) excluded.add(toInstant(w, exTz).getTime()); }
  }

  const inWindow = (s: Date) => s.getTime() + lengthMs > window.from.getTime() && s < window.to;
  const add = (s: Date, acc: Busy[]) => {
    if (!excluded.has(s.getTime()) && inWindow(s)) acc.push({ start: s, end: new Date(s.getTime() + lengthMs) });
  };

  const rr = get("RRULE");
  if (!rr) { const acc: Busy[] = []; add(first, acc); return acc; }

  const rule: Record<string, string> = {};
  for (const part of rr.value.split(";")) { const [k, v] = part.split("="); if (k && v) rule[k.toUpperCase()] = v; }
  const freq = rule.FREQ;
  if (freq !== "WEEKLY" && freq !== "DAILY") { const acc: Busy[] = []; add(first, acc); return acc; }

  const interval = Math.max(1, Number(rule.INTERVAL ?? 1));
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  let until = window.to;
  if (rule.UNTIL) { const w = parseWall(rule.UNTIL); if (w) { const u = w.dateOnly ? zonedToUtc(w.y, w.mo, w.d, 23, 59, 59, tz) : toInstant(w, tz); if (u < until) until = u; } }

  // Walk day by day in the event's own calendar (so 9:00 stays 9:00 across daylight-saving changes)
  const startDow = new Date(Date.UTC(startWall.y, startWall.mo - 1, startWall.d)).getUTCDay();
  const days = freq === "WEEKLY"
    ? new Set((rule.BYDAY ?? DAY_CODES[startDow]).split(",").map((c) => DAY_CODES.indexOf(c.replace(/^[-+]?\d+/, ""))).filter((i) => i >= 0))
    : null;
  const acc: Busy[] = [];
  let made = 0;
  for (let i = 0; i < 400; i++) {
    const day = new Date(Date.UTC(startWall.y, startWall.mo - 1, startWall.d + i));
    const weekIndex = Math.floor((i + startDow) / 7);
    const dayOk = freq === "DAILY" ? i % interval === 0 : days!.has(day.getUTCDay()) && weekIndex % interval === 0;
    if (!dayOk) continue;
    const s = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), startWall.h, startWall.mi, startWall.s, tz);
    if (s < first) continue;
    if (s > until || made >= count) break;
    made++;
    add(s, acc);
  }
  return acc;
}

// Calendar links: webcal:// -> https://, and only public http(s) addresses
export function normalizeCalendarUrl(raw: string) {
  const url = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("bad_url");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(url.hostname)) throw new Error("bad_url");
  return url.toString();
}
