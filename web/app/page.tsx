// app/page.tsx: Home dashboard (PB-14), from Ivy's "FaceTime Continuity / Home" mockup.
"use client";
import { useState } from "react";
import Link from "next/link";
import { useCopy, useLang, setLang } from "@/lib/i18n";
import { useMe, fmtShort, fmtSlot, providersHref } from "@/lib/useMe";
import { Screen, Card, Eyebrow, Pill, ButtonLink, Button, BottomNav, Notice } from "@/components/ui";

// The Chert line's number, set in .env.local / Vercel as NEXT_PUBLIC_CHERT_FACETIME_NUMBER (e.g. +14045550123)
const FACETIME_NUMBER = process.env.NEXT_PUBLIC_CHERT_FACETIME_NUMBER;

export default function Home() {
  const COPY = useCopy();
  const lang = useLang();
  const H = COPY.home;
  const { me, state } = useMe();
  const [mood, setMood] = useState<string | null>(null);
  const [refillSent, setRefillSent] = useState(false);

  if (state === "loading") return <Screen><p className="text-muted">{COPY.booking.loading}</p></Screen>;
  if (state === "none") return <Welcome />;
  if (state === "error" || !me) return <Screen><p className="text-muted">{COPY.onboarding.error}</p></Screen>;

  const name = me.user.display_name || "there";
  const med = me.medication;
  const next = me.appointments[0];
  const plan = me.user.insurance_plan;
  const todayLabel = new Date(`${me.today}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <Screen nav>
      {/* FaceTime button with the mascot inside: calls the Chert FaceTime line */}
      <a href={FACETIME_NUMBER ? `facetime:${FACETIME_NUMBER}` : "#"}
        className="mb-6 flex w-full items-center gap-4 rounded-3xl bg-brand p-3 pr-5 text-left text-white shadow-sm hover:brightness-95">
        <span className="mascot-float relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-white">
          <img src="/mascot.png" alt="" className="absolute inset-0 h-full w-full object-contain" />
          <img src="/mascot-blink.png" alt="" aria-hidden className="mascot-blink absolute inset-0 h-full w-full object-contain" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-bold">▶ {H.facetime}</span>
          <span className="block text-xs text-white/85">{H.facetimeHelp}</span>
          <span className="block text-xs text-white/70">{H.facetimeNote}</span>
        </span>
      </a>
      <div className="-mt-4 mb-6 flex justify-center">
        <a href={FACETIME_NUMBER ? `facetime-audio:${FACETIME_NUMBER}` : "#"} className="text-xs font-bold text-brand underline-offset-2 hover:underline">
          📞 {H.facetimeAudio}
        </a>
      </div>

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-[26px] font-bold text-navy">{H.greeting(name)}</h1>
        <button onClick={() => setLang(lang === "en" ? "es" : "en")}
          className="mt-1 rounded-full border border-line bg-white px-3 py-1 text-xs font-bold text-navy">
          {lang === "en" ? "Español" : "English"}
        </button>
      </div>
      <p className="mb-5 text-sm text-muted">{todayLabel} · {H.sub}</p>

      <div className="space-y-3">
        {/* Next appointment */}
        <Card>
          <div className="mb-1 flex items-center justify-between">
            <Eyebrow className="!text-muted">{H.nextVisit}</Eyebrow>
            {next && <Pill tone="mint">{H.confirmed}</Pill>}
          </div>
          {next ? (
            <>
              <p className="font-bold text-navy">{next.provider_name}</p>
              <p className="text-sm text-muted">{fmtSlot(next.slot_start)} · {next.telehealth ? COPY.booking.video : COPY.booking.inPerson}</p>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">{H.noVisits}</p>
              <ButtonLink kind="secondary" href={providersHref(plan, me.user.care_type === "therapy" ? "therapist" : "psychiatrist", med?.apptBy)}>
                {H.findProvider}
              </ButtonLink>
            </>
          )}
        </Card>

        {/* Refill / next action */}
        {med ? (
          <Card tone={med.status === "green" ? "white" : "attn"}>
            <Eyebrow className={med.status === "green" ? "!text-muted" : "!text-attn-text"}>
              {med.status === "green" ? COPY.status.green : H.refillAlert}
            </Eyebrow>
            <p className={`mt-1 text-lg font-bold ${med.status === "green" ? "text-navy" : "text-attn-text"}`}>
              {H.daysLeft(med.label, med.daysLeft)}
            </p>
            <p className={`text-sm ${med.status === "green" ? "text-muted" : "text-attn-text"}`}>
              {COPY.actions[med.nextAction as keyof typeof COPY.actions]}
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              {med.bookApptBy && !med.visitBooked ? (
                <Link href={providersHref(plan, "psychiatrist", med.apptBy)}
                  className="rounded-full bg-attn px-4 py-1.5 text-sm font-bold text-white">{COPY.timeline.findPsychiatrist}</Link>
              ) : (
                <button onClick={() => setRefillSent(true)} disabled={refillSent}
                  className="rounded-full bg-attn px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">
                  {refillSent ? H.refillSent : H.requestRefill}
                </button>
              )}
              <span className={`text-xs ${med.status === "green" ? "text-muted" : "text-attn-text"}`}>{H.runsOut(fmtShort(med.supplyEndDate))}</span>
            </div>
          </Card>
        ) : (
          <Card><p className="text-sm text-muted">{H.noMeds}</p></Card>
        )}

        {/* Schedule by */}
        {med?.bookApptBy && !med.visitBooked && (
          <Link href="/timeline" className="block">
            <Card className="flex items-center justify-between">
              <div>
                <Eyebrow className="!text-muted">{H.scheduleBy}</Eyebrow>
                <p className="font-bold text-navy">{H.scheduleByLine(fmtShort(med.bookApptBy))}</p>
              </div>
              <span className="text-brand">›</span>
            </Card>
          </Link>
        )}
        {me.therapy && !me.therapy.sessionBooked && (
          <Link href={providersHref(plan, "therapist", me.therapy.nextSessionBy)} className="block">
            <Card className="flex items-center justify-between">
              <div>
                <Eyebrow className="!text-muted">{H.scheduleBy}</Eyebrow>
                <p className="font-bold text-navy">{H.therapyBy(fmtShort(me.therapy.bookBy))}</p>
              </div>
              <span className="text-brand">›</span>
            </Card>
          </Link>
        )}

        {/* Mood check-in */}
        <div className="pt-2">
          <Eyebrow className="!text-muted mb-2">{COPY.mood.question}</Eyebrow>
          <div className="flex justify-between">
            {COPY.mood.choices.map((c) => (
              <button key={c} onClick={() => setMood(c)} className="flex flex-col items-center gap-1 text-[11px] text-muted">
                <span className={`flex h-10 w-10 items-center justify-center rounded-full ${mood === c ? "bg-brand" : "bg-mist"}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${mood === c ? "bg-white" : "bg-brand"}`} />
                </span>
                {c}
              </button>
            ))}
          </div>
          {mood && (
            <div className="mt-3 rounded-xl bg-white p-3 text-sm text-navy border border-line">
              <p>{COPY.mood.replies[mood]}</p>
              {mood === COPY.mood.choices[0] && (
                <>
                  <p className="mt-2 font-bold">{COPY.mood.crisis}</p>
                  {/* Opens the phone's dialer / messages app. We can't connect the call for them. */}
                  <div className="mt-3 flex gap-2">
                    <a href="tel:988" className="flex-1 rounded-full bg-navy py-2 text-center text-sm font-bold text-white">{COPY.help.call988}</a>
                    <a href={lang === "es" ? "sms:988?&body=AYUDA" : "sms:988"} className="flex-1 rounded-full border-2 border-navy py-2 text-center text-sm font-bold text-navy">{COPY.help.text988}</a>
                  </div>
                  <Link href="/help" className="mt-2 block text-center text-sm font-semibold text-brand underline">{COPY.help.link}</Link>
                </>
              )}
            </div>
          )}
        </div>

        <Link href="/fund" className="mb-3 block text-center text-sm font-bold text-brand underline">{COPY.fund.link}</Link>
        <Notice>{COPY.aiDisclosure}</Notice>
      </div>
      <BottomNav active="home" />
    </Screen>
  );
}

function Welcome() {
  const COPY = useCopy();
  const W = COPY.welcome;
  return (
    <Screen>
      <div className="mt-6 flex flex-col items-center text-center">
        <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-mist">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-4xl font-bold text-white">+</div>
        </div>
        <h1 className="text-[24px] font-bold text-navy">{W.heading}</h1>
        <p className="mb-8 text-sm text-muted">{W.sub}</p>
      </div>
      <div className="mb-10 space-y-3">
        {W.cards.map((c) => (
          <Card key={c.title} className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mist"><span className="h-2.5 w-2.5 rounded-full bg-brand" /></span>
            <div><p className="font-bold text-navy">{c.title}</p><p className="text-xs text-muted">{c.body}</p></div>
          </Card>
        ))}
      </div>
      <ButtonLink href="/onboarding">{W.start}</ButtonLink>
    </Screen>
  );
}
