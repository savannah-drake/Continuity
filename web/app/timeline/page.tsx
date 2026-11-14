// app/timeline/page.tsx: the care chain, from Ivy's "Refill timeline / When to schedule" mockup.
"use client";
import { COPY } from "@/lib/copy";
import { useMe, fmtDay, isoDay, fmtTime, providersHref } from "@/lib/useMe";
import { Screen, Card, Eyebrow, Pill, ButtonLink, BottomNav } from "@/components/ui";

const T = COPY.timeline;
type Dot = "today" | "confirmed" | "action" | "end" | "later";
const dotColor: Record<Dot, string> = {
  today: "border-brand", confirmed: "border-forest", action: "border-attn", end: "border-coral", later: "border-muted",
};
type Step = { date: string; title: string; body?: string; dot: Dot; tag?: { text: string; tone: "mint" | "attn" } };

export default function TimelinePage() {
  const { me, state } = useMe();
  if (state === "loading") return <Screen><p className="text-muted">{COPY.booking.loading}</p></Screen>;
  if (!me) return <Screen><p className="mb-4 text-muted">{T.clear}</p><ButtonLink href="/onboarding">{COPY.home.setup}</ButtonLink></Screen>;

  const med = me.medication;
  const steps: Step[] = [{ date: me.today, title: T.today, dot: "today" }];

  for (const a of me.appointments) {
    steps.push({ date: isoDay(a.slot_start), title: T.visitBooked(a.provider_name),
      body: `${fmtTime(a.slot_start)} · ${a.telehealth ? COPY.booking.video : COPY.booking.inPerson}`,
      dot: "confirmed", tag: { text: COPY.tags.confirmed, tone: "mint" } });
  }
  if (med) {
    if (med.bookApptBy && !med.visitBooked) {
      steps.push({ date: med.bookApptBy < me.today ? me.today : med.bookApptBy, title: T.bookBy,
        body: T.bookByBody(med.label), dot: "action", tag: { text: COPY.tags.needsAction, tone: "attn" } });
    }
    steps.push({ date: med.rxNeededBy, title: T.rxNeededBy, body: T.rxNeededByBody, dot: "later" });
    steps.push({ date: med.supplyEndDate, title: T.supplyEnd(med.label), body: T.supplyEndBody, dot: "end" });
  }
  if (me.therapy && !me.therapy.sessionBooked) {
    steps.push({ date: me.therapy.bookBy < me.today ? me.today : me.therapy.bookBy, title: T.therapyBookBy,
      dot: "action", tag: { text: COPY.tags.needsAction, tone: "attn" } });
  }
  steps.sort((a, b) => a.date.localeCompare(b.date) || (a.dot === "today" ? -1 : 0));

  const nextAction = med?.bookApptBy && !med.visitBooked ? med : null;

  return (
    <Screen nav>
      <Eyebrow>{T.eyebrow}</Eyebrow>
      <h1 className="mt-1 text-[26px] font-bold text-navy">{T.title}</h1>
      <p className="mb-5 text-sm text-muted">{T.sub}</p>

      {nextAction && (
        <Card tone="attn" className="mb-6">
          <Eyebrow className="!text-attn-text">{T.nextStep}</Eyebrow>
          <p className="font-bold text-attn-text">{T.bookBy} by {fmtDay(nextAction.bookApptBy!)}</p>
          <p className="text-xs text-attn-text">{nextAction.renewalReason ? COPY.renewalReasons[nextAction.renewalReason] : T.bookByBody(nextAction.label)}</p>
        </Card>
      )}

      <ol className="relative ml-2 border-l-2 border-mist pl-6">
        {steps.map((s, i) => (
          <li key={i} className="relative mb-6">
            <span className={`absolute -left-[33px] top-1 h-3.5 w-3.5 rounded-full border-[3px] bg-white ${dotColor[s.dot]}`} />
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
              {s.dot === "today" ? `Today · ${fmtDay(s.date)}` : fmtDay(s.date)}
            </p>
            <p className="font-bold text-navy">{s.title}</p>
            {s.body && <p className="text-xs text-muted">{s.body}</p>}
            {s.tag && <div className="mt-1"><Pill tone={s.tag.tone}>{s.tag.text}</Pill></div>}
          </li>
        ))}
      </ol>

      {nextAction && (
        <ButtonLink href={providersHref(me.user.insurance_plan, "psychiatrist", nextAction.apptBy)}>{T.findPsychiatrist}</ButtonLink>
      )}
      <BottomNav active="timeline" />
    </Screen>
  );
}
