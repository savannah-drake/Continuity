// app/schedule/page.tsx: "Your week". One day at a time: your busy times (from the calendar you added),
// visits you've requested, and in-network openings that fit around your schedule (tap one to request it).
// Busy blocks have no names: we never store what your events are.
"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMe, getUserId } from "@/lib/useMe";
import { useCopy, useLang } from "@/lib/i18n";
import { Screen, BottomNav, Notice, ButtonLink, TimelineTabs } from "@/components/ui";

type Block = { start: string; end: string };
type Opening = { slot_id: number; slot_start: string; duration_min: number; telehealth: boolean; provider: string; fits_calendar: boolean | null };

const TZ = "America/New_York";
const START_H = 7, END_H = 21, PX = 44; // 7 AM to 9 PM, 44px per hour
const dayKey = (iso: string | Date) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const hourOf = (iso: string) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(iso));
  return Number(p.find((x) => x.type === "hour")?.value) + Number(p.find((x) => x.type === "minute")?.value) / 60;
};

export default function SchedulePage() {
  const C = useCopy();
  const S = C.schedule;
  const lang = useLang();
  const locale = lang === "es" ? "es-US" : "en-US";
  const { me, state } = useMe();
  const userId = typeof window !== "undefined" ? getUserId() : null;
  const [busy, setBusy] = useState<Block[] | null>(null);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dayKey(new Date(Date.now() + i * 864e5))), []);
  const [day, setDay] = useState(days[0]);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/calendar?userId=${userId}&days=8`).then((r) => r.json()).then((d) => setBusy(d.busy ?? [])).catch(() => setBusy([]));
  }, [userId]);

  useEffect(() => {
    if (!me || !userId) return;
    const types = me.user.care_type === "both" ? ["psychiatrist", "therapist"] : me.user.care_type === "therapy" ? ["therapist"] : ["psychiatrist"];
    Promise.all(types.map((type) => {
      const qs = new URLSearchParams({ type, slots: "1", sort: "soonest", userId: String(userId), free: "1", plan: me.user.insurance_plan, limit: "8",
        ...(me.user.home_lat != null && me.user.home_lng != null ? { lat: String(me.user.home_lat), lng: String(me.user.home_lng) } : {}) });
      return fetch(`/api/providers?${qs}`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    })).then((lists) => {
      const all: Opening[] = [];
      for (const list of lists) for (const p of list as any[]) for (const s of p.slots ?? []) all.push({ ...s, provider: p.provider_name });
      setOpenings(all);
    });
  }, [me, userId]);

  if (state === "loading") return <Screen nav><p className="text-muted">{C.booking.loading}</p><BottomNav active="timeline" /></Screen>;
  if (state !== "ready" || !me) return <Screen nav><p className="mb-4 text-muted">{C.profile.none}</p><ButtonLink href="/onboarding">{C.profile.redo}</ButtonLink><BottomNav active="timeline" /></Screen>;

  const todaysBusy = (busy ?? []).filter((b) => dayKey(b.start) === day);
  const todaysVisits = me.appointments.filter((a) => dayKey(a.slot_start) === day);
  const requested = new Set(me.appointments.map((a) => a.slot_id));
  const todaysOpen = openings.filter((o) => dayKey(o.slot_start) === day && !requested.has(o.slot_id)).slice(0, 4);
  const hasCalendar = (busy?.length ?? 0) > 0;
  const top = (iso: string) => (Math.max(START_H, Math.min(END_H, hourOf(iso))) - START_H) * PX;
  const height = (a: string, b: string) => Math.max(18, top(b) - top(a));
  const t = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone: TZ });

  return (
    <Screen nav>
      <TimelineTabs active="calendar" />
      <h1 className="text-[26px] font-bold text-navy">{S.title}</h1>
      <p className="mb-4 text-sm text-muted">{hasCalendar ? S.sub : S.noCalendar}</p>

      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {days.map((d) => {
          const dt = new Date(`${d}T12:00:00`);
          return (
            <button key={d} type="button" onClick={() => setDay(d)}
              className={`flex min-w-[46px] flex-col items-center rounded-2xl px-2 py-2 text-xs font-bold ${d === day ? "bg-brand text-white" : "bg-white text-navy border border-line"}`}>
              <span>{dt.toLocaleDateString(locale, { weekday: "short" })}</span>
              <span className="text-base">{dt.getDate()}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-[11px] font-semibold text-muted">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-line" />{S.busy}</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-brand" />{S.requested}</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border-2 border-dashed border-forest" />{S.open}</span>
      </div>

      <div className="relative mb-4 rounded-2xl border border-line bg-white" style={{ height: (END_H - START_H) * PX + 8 }}>
        {Array.from({ length: END_H - START_H + 1 }, (_, i) => (
          <div key={i} className="absolute left-0 right-0 border-t border-line/60" style={{ top: i * PX + 4 }}>
            <span className="absolute -top-2 left-2 bg-white px-1 text-[10px] text-muted">
              {new Date(2026, 0, 1, START_H + i).toLocaleTimeString(locale, { hour: "numeric" })}
            </span>
          </div>
        ))}
        {todaysBusy.map((b, i) => (
          <div key={`b${i}`} className="absolute left-14 right-3 rounded-lg bg-line/80 px-2 py-1 text-[11px] font-semibold text-muted"
            style={{ top: top(b.start) + 4, height: height(b.start, b.end) }}>
            {S.busy} · {t(b.start)}–{t(b.end)}
          </div>
        ))}
        {todaysOpen.map((o) => {
          const end = new Date(new Date(o.slot_start).getTime() + o.duration_min * 60000).toISOString();
          return (
            <Link key={o.slot_id} href={`/book/${o.slot_id}`}
              className="absolute left-14 right-3 rounded-lg border-2 border-dashed border-forest bg-mint/60 px-2 py-1 text-[11px] font-bold text-forest"
              style={{ top: top(o.slot_start) + 4, height: height(o.slot_start, end) }}>
              {S.openWith(o.provider, t(o.slot_start))}{o.telehealth ? ` · ${S.video}` : ""}
            </Link>
          );
        })}
        {todaysVisits.map((a) => {
          const end = new Date(new Date(a.slot_start).getTime() + a.duration_min * 60000).toISOString();
          return (
            <div key={a.slot_id} className="absolute left-14 right-3 rounded-lg bg-brand px-2 py-1 text-[11px] font-bold text-white"
              style={{ top: top(a.slot_start) + 4, height: height(a.slot_start, end) }}>
              {S.visitWith(a.provider_name, t(a.slot_start))}
            </div>
          );
        })}
      </div>

      {!todaysBusy.length && !todaysVisits.length && !todaysOpen.length && <p className="mb-4 text-sm text-muted">{S.empty}</p>}
      <div className="mb-2"><Notice>{S.privacy}</Notice></div>
      <Link href="/profile" className="text-sm font-semibold text-brand underline">{S.manage}</Link>
      <BottomNav active="timeline" />
    </Screen>
  );
}
