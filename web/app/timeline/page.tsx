// app/timeline/page.tsx: the care chain, from Ivy's "Refill timeline / When to schedule" mockup.
"use client";
import { useCopy } from "@/lib/i18n";
import { useMe, visitLine, fmtDay, isoDay, fmtTime, bookingHref } from "@/lib/useMe";
import { Screen, ButtonLink, BottomNav, TimelineTabs } from "@/components/ui";

type Dot = "today" | "confirmed" | "action" | "end" | "later";
const dotColor: Record<Dot, string> = {
  today: "border-brand", confirmed: "border-forest", action: "border-attn", end: "border-coral", later: "border-muted",
};
const addDaysIso = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
type Step = { date: string; title: string; body?: string; dot: Dot; tag?: { text: string; tone: "mint" | "attn" } };

export default function TimelinePage() {
  const COPY = useCopy();
  const T = COPY.timeline;
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
      dot: "confirmed", tag: { text: COPY.tags.confirmed, tone: "mint" } });
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

  return (
    <Screen nav>
      <TimelineTabs active="timeline" />
      <h1 className="text-[26px] font-bold text-navy">{T.title}</h1>
      <p className="mb-5 text-sm text-muted">{T.sub}</p>

      {nextAction && (
        <div className="mb-6 border-l-2 border-attn pl-3">
          <p className="text-sm text-muted">{T.nextStep}</p>
          <p className="font-bold text-navy">{visitLine(nextAction, me.today, COPY.home, fmtDay)}</p>
          <p className="text-sm text-muted">{nextAction.renewalReason ? COPY.renewalReasons[nextAction.renewalReason] : T.bookByBody(nextAction.label)}</p>
        </div>
      )}

      <ol className="relative ml-2 border-l-2 border-mist pl-6">
        {steps.map((s, i) => (
          <li key={i} className="relative mb-6">
            <span className={`absolute -left-[33px] top-1 h-3.5 w-3.5 rounded-full border-[3px] bg-white ${dotColor[s.dot]}`} />
            <p className="text-xs text-muted">
              {s.dot === "today" ? `${T.today} · ${fmtDay(s.date)}` : fmtDay(s.date)}
            </p>
            <p className="font-semibold text-navy">{s.title}</p>
            {s.body && <p className="text-sm text-muted">{s.body}</p>}
            {s.tag && <p className={`mt-0.5 text-xs font-semibold ${s.tag.tone === "attn" ? "text-attn-text" : "text-forest"}`}>{s.tag.text}</p>}
          </li>
        ))}
      </ol>

      {nextAction && (
        (() => { const b = bookingHref(me, "psychiatrist"); return b.external
          ? <a href={b.href} target="_blank" rel="noopener noreferrer" className="flex h-12 w-full items-center justify-center rounded-full bg-brand text-[15px] font-bold text-white">{COPY.home.findTime}</a>
          : <ButtonLink href={b.href}>{T.findPsychiatrist}</ButtonLink>; })()
      )}
      <BottomNav active="timeline" />
    </Screen>
  );
}
