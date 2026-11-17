// app/timeline/page.tsx: the care chain, from Ivy's "Refill timeline / When to schedule" mockup.
"use client";
import { useCopy, useLang } from "@/lib/i18n";
import { localeFor } from "@/lib/copy";
import { useMe, visitLine, fmtDay, isoDay, fmtTime, bookingHref } from "@/lib/useMe";
import { Screen, ButtonLink, BottomNav, TimelineTabs, DisplayTitle, inkBtn } from "@/components/ui";
import { ArrowIcon } from "@/components/icons";

type Dot = "today" | "confirmed" | "action" | "end" | "later";
// Date squares: mint = booked, butter = something to do, rose = runs out, lavender = on the way
const dayTone: Record<Dot, string> = {
  today: "bg-navy text-white", confirmed: "bg-mint", action: "bg-butter", end: "bg-rose", later: "bg-lavender",
};
const dotFill: Record<Dot, string> = { today: "bg-navy", confirmed: "bg-live", action: "bg-attn", end: "bg-coral", later: "bg-brand" };
const addDaysIso = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
type Step = { date: string; title: string; body?: string; dot: Dot; tone?: string; tag?: { text: string; tone: "mint" | "attn" } };

export default function TimelinePage() {
  const COPY = useCopy();
  const T = COPY.timeline;
  const lang = useLang();
  const { me, state } = useMe();
  if (state === "loading") return <Screen><p className="text-muted">{COPY.booking.loading}</p></Screen>;
  if (!me) return <Screen><p className="mb-4 text-muted">{T.clear}</p><ButtonLink href="/onboarding">{COPY.home.setup}</ButtonLink></Screen>;

  const med = me.medication; // runs out first
  const steps: Step[] = [{ date: me.today, title: T.today, dot: "today" }];

  for (const a of me.appointments) {
    // Imported visits: we don't know if they're in person, so only say "Video" when we know it is
    const how = a.telehealth ? ` · ${COPY.booking.video}` : a.imported ? "" : ` · ${COPY.booking.inPerson}`;
    steps.push({ date: isoDay(a.slot_start), title: a.provider_type === "psychiatrist" ? T.psychWith(a.provider_name) : T.therapyWith(a.provider_name),
      body: `${fmtTime(a.slot_start)}${how}`,
      dot: "confirmed", tone: a.provider_type === "therapist" ? "bg-lavender" : a.provider_type === "psychiatrist" ? "bg-peach" : undefined,
      tag: { text: COPY.tags.confirmed, tone: "mint" } });
  }
  // Every medication gets its own steps
  const many = me.medications.length > 1;
  for (const m of me.medications) {
    if (m.bookApptBy && !m.visitBooked) {
      steps.push({ date: m.bookApptBy < me.today ? me.today : m.bookApptBy, title: many ? `${T.bookBy} · ${m.label}` : T.bookBy,
        body: T.bookByBody(m.label), dot: "action", tag: { text: COPY.tags.needsAction, tone: "attn" } });
    }
    // With a visit booked, the renewal comes after it; if that's on or after the last day, say there may be a gap
    const rxDate = m.visitDate && m.visitDate > m.rxNeededBy ? m.visitDate : m.rxNeededBy < me.today ? me.today : m.rxNeededBy;
    const gap = !!m.visitDate && m.visitDate >= m.rxNeededBy;
    if (m.bookApptBy || m.rxNeededBy >= me.today) steps.push({ date: rxDate, title: many ? `${T.rxNeededBy} · ${m.label}` : T.rxNeededBy, body: m.visitDate ? T.rxAfterVisit : T.rxNeededByBody, dot: "later" });
    steps.push({ date: m.supplyEndDate, title: T.supplyEnd(m.label), body: gap ? T.gapWarning : T.supplyEndBody, dot: "end" });
    // Controlled medication without a visit: ask the prescriber for this fill's prescription
    if (m.requestRxBy && !m.rxSentOn) {
      steps.push({ date: m.requestRxBy < me.today ? me.today : m.requestRxBy, title: many ? `${T.requestRx} · ${m.label}` : T.requestRx,
        body: T.requestRxBody, dot: "action", tag: { text: COPY.tags.needsAction, tone: "attn" } });
    }
    // Controlled medication: call the pharmacy 3 days before running out (shortages)
    const stockDay = addDaysIso(m.supplyEndDate, -3);
    if (m.controlled && stockDay >= me.today) steps.push({ date: stockDay, title: T.stockCheck(m.pharmacy?.name ?? null), body: T.stockCheckBody, dot: "later" });
    // Once the prescription is sent: pick it up before the last day
    if (m.rxSentOn) steps.push({ date: m.refillDeadline < me.today ? me.today : m.refillDeadline, title: T.pickupStep, body: m.pharmacy?.name, dot: "later" });
  }
  if (me.therapy && !me.therapy.sessionBooked) {
    steps.push({ date: me.therapy.bookBy < me.today ? me.today : me.therapy.bookBy, title: T.therapyBookBy,
      dot: "action", tag: { text: COPY.tags.needsAction, tone: "attn" } });
  }
  steps.sort((a, b) => a.date.localeCompare(b.date) || (a.dot === "today" ? -1 : 0));

  const nextAction = med?.bookApptBy && !med.visitBooked ? med : null;

  // This week, with a dot on days that have something
  const week = Array.from({ length: 7 }, (_, i) => addDaysIso(me.today, i));
  const firstOn = (d: string) => steps.find((x) => x.date === d && x.dot !== "today");
  const loc = localeFor(lang);
  const wd = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(loc, { weekday: "narrow" });
  const dayNum = (d: string) => Number(d.slice(8, 10));
  const mon = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(loc, { month: "short" });

  return (
    <Screen nav>
      <DisplayTitle text={T.title} className="mb-2" />
      <p className="mb-5 text-[15px] text-muted">{T.sub}</p>
      <TimelineTabs active="timeline" />

      <div className="mb-6 flex gap-1.5">
        {week.map((d) => {
          const on = d === me.today;
          const hit = firstOn(d);
          return (
            <div key={d} className={`flex h-16 flex-1 flex-col items-center justify-center gap-0.5 rounded-[22px] ${on ? "bg-navy text-white" : "bg-white text-navy"}`}>
              <span className="text-[12px] font-semibold opacity-80">{wd(d)}</span>
              <span className="font-display text-[19px] font-bold leading-none">{dayNum(d)}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${hit ? dotFill[hit.dot] : "bg-transparent"}`} />
            </div>
          );
        })}
      </div>

      {nextAction && (
        <div className="mb-6 rounded-[30px] bg-rose p-5">
          <p className="text-[13px] font-semibold text-navy/70">{T.nextStep}</p>
          <p className="mt-1 font-display text-[21px] font-semibold leading-tight text-navy">{visitLine(nextAction, me.today, COPY.home, fmtDay)}</p>
          <p className="mt-1 text-[13px] text-navy/80">{nextAction.renewalReason ? COPY.renewalReasons[nextAction.renewalReason] : T.bookByBody(nextAction.label)}</p>
        </div>
      )}

      <ol className="mb-6 flex flex-col gap-3">
        {steps.filter((x) => x.dot !== "today").map((x, i) => (
          <li key={i} className="flex items-stretch gap-3.5">
            <div className={`flex w-[62px] shrink-0 flex-col items-center justify-center rounded-[22px] py-2.5 text-navy ${x.tone ?? dayTone[x.dot]}`}>
              <span className="font-display text-[26px] font-bold leading-none">{dayNum(x.date)}</span>
              <span className="mt-0.5 text-[12px] font-bold">{mon(x.date)}</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col rounded-3xl bg-white px-4 py-3.5">
              <p className="text-[15px] font-bold text-navy">{x.title}</p>
              {x.body && <p className="mt-0.5 text-[13px] leading-snug text-muted">{x.body}</p>}
              {x.tag && <span className={`mt-2 self-start rounded-full px-2.5 py-1 text-[12px] font-bold text-navy ${x.tag.tone === "attn" ? "bg-butter" : "bg-mint"}`}>{x.tag.text}</span>}
            </div>
          </li>
        ))}
      </ol>

      {nextAction && (
        (() => { const b = bookingHref(me, "psychiatrist"); return b.external
          ? <a href={b.href} target="_blank" rel="noopener noreferrer" className={`${inkBtn} w-full`}>{COPY.home.findTime}<ArrowIcon size={18} /></a>
          : <ButtonLink href={b.href}>{T.findPsychiatrist}</ButtonLink>; })()
      )}
      <BottomNav active="timeline" />
    </Screen>
  );
}
