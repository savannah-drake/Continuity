// app/page.tsx: Home. One clear list of what's next (every medication, therapy, the next visit),
// a "Talk to Continuity" voice call, and a quick mood check-in. Signed out: Welcome with Google sign-in.
"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCopy, useLang, setLang } from "@/lib/i18n";
import { LANGS, localeFor, type Lang } from "@/lib/copy";
import { useMe, visitLine, fmtShort, fmtSlot, bookingHref } from "@/lib/useMe";
import { Screen, BottomNav } from "@/components/ui";
import { ArrowIcon } from "@/components/icons";

const diffFromToday = (today: string, d: string) =>
  Math.round((new Date(`${d}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);

const dot = (status: string) => (status === "red" ? "bg-coral" : status === "yellow" ? "bg-attn" : "bg-live");

export default function HomePage() {
  return <Suspense fallback={null}><Home /></Suspense>;
}

function Home() {
  const COPY = useCopy();
  const lang = useLang();
  const H = COPY.home;
  const router = useRouter();
  const { me, state } = useMe();
  const [mood, setMood] = useState<string | null>(null);

  useEffect(() => { if (me?.needsOnboarding) router.replace("/onboarding"); }, [me, router]);

  if (state === "loading") return <Screen><p className="text-muted">{COPY.booking.loading}</p></Screen>;
  if (state === "none") return <Welcome />;
  if (state === "error" || !me) return <Screen><p className="text-muted">{COPY.onboarding.error}</p></Screen>;

  const name = me.user.display_name || "";
  const next = me.appointments[0];
  const todayLabel = new Date(`${me.today}T12:00:00`).toLocaleDateString(localeFor(lang), { weekday: "long", month: "long", day: "numeric" });
  const hasSteps = me.medications.length > 0 || !!me.therapy || !!next;

  return (
    <Screen nav>
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight text-navy">{name ? H.hi(name) : COPY.appName}</h1>
          <p className="mt-0.5 text-sm text-muted">{todayLabel}</p>
        </div>
        <select aria-label={COPY.profile.language} value={lang} onChange={(e) => setLang(e.target.value as Lang)}
          className="mt-1 rounded-full border border-line bg-white px-3 py-1 text-sm font-semibold text-navy">
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
      </header>

      {/* Voice call in the browser */}
      <Link href="/call" className="flex items-center gap-4 rounded-2xl bg-brand px-4 py-3 text-white hover:brightness-95">
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot.png" alt="" className="h-full w-full object-contain" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-bold">{H.talk}</span>
          <span className="block text-[13px] text-white/85">{H.talkHelp}</span>
        </span>
        <ArrowIcon size={20} />
      </Link>
      <div className="mb-6" />

      {/* Time to book: a renewal visit is due soon for a medication */}
      {(() => {
        const due = me.medications.find((m) => m.bookApptBy && !m.visitBooked && diffFromToday(me.today, m.bookApptBy) <= 14);
        if (!due) return null;
        const days = diffFromToday(me.today, due.bookApptBy!);
        return (
          <section className={`mb-6 rounded-2xl px-4 py-4 ${days <= 2 ? "bg-coral/15" : "bg-attn-tint"}`}>
            <p className="text-[17px] font-bold text-navy">{days <= 0 ? H.bookNowTitle : H.timeToBookTitle}</p>
            <p className="mt-1 text-sm text-navy">{H.timeToBookBody(due.label, fmtShort(due.supplyEndDate), fmtShort(due.apptBy ?? due.supplyEndDate), days)}</p>
            <div className="mt-3 flex items-center gap-5 text-sm font-semibold">
              <BookLink to={bookingHref(me, "psychiatrist")} className="rounded-full bg-navy px-4 py-2 text-white">{H.findTime}</BookLink>
              <Link href="/care" className="text-navy">{H.alreadyBooked}</Link>
            </div>
          </section>
        );
      })()}

      {/* What's next, in one list */}
      <h2 className="mb-2 text-[15px] font-bold text-navy">{H.nextSteps}</h2>
      {!hasSteps && <p className="mb-6 text-sm text-muted">{H.noneYet} <Link href="/care" className="font-semibold text-brand">{COPY.nav.care}</Link></p>}
      {hasSteps && (
        <ul className="mb-8 divide-y divide-line rounded-2xl border border-line bg-white">
          {me.medications.map((m) => {
            const needsVisit = !!m.bookApptBy && !m.visitBooked;
            return (
              <li key={m.medicationId} className="flex items-center gap-3 px-4 py-3">
                <span className={`h-2 w-2 shrink-0 rounded-full ${dot(m.status)}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy">{H.daysLeft(m.label, m.daysLeft)}</p>
                  <p className={`text-sm ${m.status === "green" ? "text-muted" : "text-attn-text"}`}>
                    {m.rxSentOn ? H.rxSent(m.pharmacy?.name ?? null)
                      : needsVisit ? visitLine(m, me.today, H, fmtShort)
                      : m.nextAction === "request_rx" && m.requestRxBy ? H.requestRxBy(fmtShort(m.requestRxBy))
                      : H.onTrack(fmtShort(m.supplyEndDate))}
                  </p>
                </div>
                {needsVisit && (
                  <BookLink to={bookingHref(me, "psychiatrist")} className="shrink-0 text-sm font-semibold text-brand">{H.findTime}</BookLink>
                )}
              </li>
            );
          })}
          {me.therapy && !me.therapy.sessionBooked && (
            <li className="flex items-center gap-3 px-4 py-3">
              <span className={`h-2 w-2 shrink-0 rounded-full ${dot(me.therapy.status)}`} aria-hidden />
              <p className="min-w-0 flex-1 font-semibold text-navy">{H.therapyDue(fmtShort(me.therapy.bookBy))}</p>
              <BookLink to={bookingHref(me, "therapist")} className="shrink-0 text-sm font-semibold text-brand">{H.findTime}</BookLink>
            </li>
          )}
          {next && (
            <li className="flex items-center gap-3 px-4 py-3">
              <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted">{H.nextVisit}</p>
                <p className="truncate font-semibold text-navy">{H.nextVisitLine(next.provider_name, fmtSlot(next.slot_start))}</p>
              </div>
            </li>
          )}
        </ul>
      )}

      {/* Mood check-in */}
      <h2 className="mb-2 text-[15px] font-bold text-navy">{COPY.mood.question}</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        {COPY.mood.choices.map((c) => (
          <button key={c} onClick={() => setMood(c)} aria-pressed={mood === c}
            className={`rounded-full border px-3.5 py-1.5 text-sm ${mood === c ? "border-navy bg-navy text-white" : "border-line bg-white text-navy"}`}>
            {c}
          </button>
        ))}
      </div>
      {mood && (
        <div className="mb-6 text-sm text-navy">
          <p>{COPY.mood.replies[mood]}</p>
          {mood === COPY.mood.choices[0] && (
            <>
              <p className="mt-2 font-semibold">{COPY.mood.crisis}</p>
              {/* Opens the phone's dialer / messages app. We can't connect the call for them. */}
              <div className="mt-3 flex gap-2">
                <a href="tel:988" className="flex-1 rounded-full bg-navy py-2 text-center text-sm font-bold text-white">{COPY.help.call988}</a>
                <a href={lang === "es" ? "sms:988?&body=AYUDA" : "sms:988"} className="flex-1 rounded-full border border-navy py-2 text-center text-sm font-bold text-navy">{COPY.help.text988}</a>
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-8 flex justify-between text-sm font-semibold">
        <Link href="/help" className="text-navy">{H.support}</Link>
      </div>
      <p className="mt-4 text-[11px] text-muted">{COPY.aiDisclosure}</p>
      <BottomNav active="home" />
    </Screen>
  );
}

// Opens your provider's own booking page in a new tab, or goes to My care → Find someone new
function BookLink({ to, className, children }: { to: { href: string; external: boolean }; className: string; children: React.ReactNode }) {
  return to.external
    ? <a href={to.href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
    : <Link href={to.href} className={className}>{children}</Link>;
}

function Welcome() {
  const COPY = useCopy();
  const W = COPY.welcome;
  const A = COPY.auth;
  const params = useSearchParams();
  const signin = params.get("signin");
  return (
    <Screen>
      <div className="flex min-h-[80vh] flex-col justify-between">
        <div className="mt-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot.png" alt="" className="mb-6 h-20 w-20 object-contain" />
          <h1 className="text-[30px] font-bold leading-tight text-navy">{W.heading}</h1>
          <p className="mt-2 text-[15px] text-muted">{W.sub}</p>
          <ul className="mt-8 space-y-4">
            {W.cards.map((c) => (
              <li key={c.title} className="border-l-2 border-brand pl-3">
                <p className="font-semibold text-navy">{c.title}</p>
                <p className="text-sm text-muted">{c.body}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-10 space-y-3">
          {signin && <p className="text-sm text-attn-text">{signin === "cancelled" ? A.cancelled : A.failed}</p>}
          <a href="/api/auth/google" className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-line bg-white text-[15px] font-bold text-navy hover:bg-mist/40">
            <GoogleMark /> {A.google}
          </a>
          <p className="flex justify-center gap-4 pt-2 text-xs text-muted">
            <Link href="/privacy" className="underline">{COPY.profile.privacyLink}</Link>
            <Link href="/terms" className="underline">{COPY.profile.termsLink}</Link>
          </p>
        </div>
      </div>
    </Screen>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
      <path fill="#FBBC05" d="M10.6 28.6A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.2 0-11.5-4.1-13.4-9.8l-8 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
