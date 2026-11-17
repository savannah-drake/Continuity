// app/schedule/page.tsx: "Your week". One day at a time: your busy times (from Google Calendar or a calendar file)
// and your visits.
// Busy blocks have no names: we never store what your events are.
"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMe, getUserId } from "@/lib/useMe";
import { localeFor } from "@/lib/copy";
import { useCopy, useLang } from "@/lib/i18n";
import { Screen, BottomNav, Notice, ButtonLink, TimelineTabs } from "@/components/ui";

type Block = { start: string; end: string };

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
  const locale = localeFor(lang);
  const { me, state } = useMe();
  const userId = typeof window !== "undefined" ? getUserId() : null;
  const [busy, setBusy] = useState<Block[] | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dayKey(new Date(Date.now() + i * 864e5))), []);
  const [day, setDay] = useState(days[0]);

  useEffect(() => {
    if (!userId) return;
    fetch("/api/calendar?days=8").then((r) => r.json()).then((d) => setBusy(d.busy ?? [])).catch(() => setBusy([]));
  }, [userId]);


  if (state === "loading") return <Screen nav><p className="text-muted">{C.booking.loading}</p><BottomNav active="timeline" /></Screen>;
  if (state !== "ready" || !me) return <Screen nav><p className="mb-4 text-muted">{C.profile.none}</p><ButtonLink href="/onboarding">{C.profile.redo}</ButtonLink><BottomNav active="timeline" /></Screen>;

  const todaysBusy = (busy ?? []).filter((b) => dayKey(b.start) === day);
  const todaysVisits = me.appointments.filter((a) => dayKey(a.slot_start) === day);
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
        {todaysVisits.map((a) => {
          const end = new Date(new Date(a.slot_start).getTime() + a.duration_min * 60000).toISOString();
          return (
            <div key={`${a.visit_id ?? a.slot_id}-${a.slot_start}`} className="absolute left-14 right-3 rounded-lg bg-brand px-2 py-1 text-[11px] font-bold text-white"
              style={{ top: top(a.slot_start) + 4, height: height(a.slot_start, end) }}>
              {S.visitWith(a.provider_name, t(a.slot_start))}
            </div>
          );
        })}
      </div>

      {!todaysBusy.length && !todaysVisits.length && <p className="mb-4 text-sm text-muted">{S.empty}</p>}
      <div className="mb-2"><Notice>{S.privacy}</Notice></div>
      <Link href="/profile" className="text-sm font-semibold text-brand underline">{S.manage}</Link>
      <BottomNav active="timeline" />
    </Screen>
  );
}
