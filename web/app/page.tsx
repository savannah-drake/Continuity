// app/page.tsx: Home. One clear list of what's next (every medication, therapy, the next visit),
// a "Talk to Continuity" voice call, and a quick mood check-in. Signed out: Welcome with Google sign-in.
"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCopy, useLang, setLang } from "@/lib/i18n";
import { LANGS, localeFor, type Lang } from "@/lib/copy";
import { useMe, visitLine, fmtShort, fmtSlot, bookingHref } from "@/lib/useMe";
import { Screen, BottomNav, Scallop, SectionTitle, toneBg, statusTone, inkBtn, outlineBtn, smallInkBtn, smallOutlineBtn, type Tone } from "@/components/ui";
import { ArrowIcon, PhoneIcon } from "@/components/icons";

const diffFromToday = (today: string, d: string) =>
  Math.round((new Date(`${d}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);


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
  const todayLabel = new Date(`${me.today}T12:00:00`).toLocaleDateString(localeFor(lang), { weekday: "long", month: "long", day: "numeric" });
  const hasSteps = me.medications.length > 0 || !!me.therapy || me.appointments.length > 0;

  const tile = (key: string, tone: Tone, kicker: string, title: string, sub: string, foot: React.ReactNode) => (
    <div key={key} className={`flex min-h-[168px] flex-col justify-between rounded-[28px] p-[18px] ${toneBg[tone]}`}>
      <div>
        <p className="text-[13px] font-semibold text-navy/70">{kicker}</p>
        <p className="mt-1.5 font-display text-[21px] font-semibold leading-[1.12] text-navy">{title}</p>
        <p className="mt-1.5 text-[13px] leading-snug text-navy/80">{sub}</p>
      </div>
      <div className="mt-3">{foot}</div>
    </div>
  );
  const pharmacy = me.pharmacies.find((p) => p.preferred) ?? me.pharmacies[0];
  const due = me.medications.find((m) => m.bookApptBy && !m.visitBooked && diffFromToday(me.today, m.bookApptBy) <= 14);
  const moodTones: Tone[] = ["blush", "peach", "butter", "mint", "lavender"];

  return (
    <Screen nav>
      <header className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush font-display text-[18px] font-bold text-navy">{(name || "?").slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-navy">{name ? H.hi(name) : COPY.appName}</p>
          <p className="text-[13px] text-muted">{todayLabel}</p>
        </div>
        <select aria-label={COPY.profile.language} value={lang} onChange={(e) => setLang(e.target.value as Lang)}
          className="h-9 rounded-full border-0 bg-white px-3 text-[13px] font-semibold text-navy">
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
      </header>

      <h1 className="mb-6 font-display text-[38px] font-semibold leading-[1.04] tracking-[-0.4px] text-navy">
        {H.tagline1}<br /><span className="font-medium italic">{H.tagline2}</span>
      </h1>

      {/* Voice call in the browser */}
      <section className="mb-5 flex items-center gap-4 rounded-[30px] bg-lavender p-5">
        <Scallop size={86} tone="white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot-lavender.png" alt="" className="mascot-float h-[60px] w-[60px] object-contain" />
        </Scallop>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5">
          <div>
            <p className="font-display text-[22px] font-semibold leading-tight text-navy">{H.talkTitle}</p>
            <p className="mt-1 text-[13px] text-[#3E3470]">{H.talkHelp}</p>
          </div>
          <Link href="/call" className={inkBtn}>{H.start}<ArrowIcon size={18} /></Link>
        </div>
      </section>

      {/* Time to book: a renewal visit is due soon for a medication (rose when urgent, butter when coming up) */}
      {due && (() => {
        const days = diffFromToday(me.today, due.bookApptBy!);
        const urgent = due.status === "red" || days <= 2;
        return (
          <section className={`mb-6 flex flex-col gap-3.5 rounded-[30px] p-5 ${urgent ? "bg-rose" : "bg-butter"}`}>
            <div className="flex items-center gap-3.5">
              <Scallop size={84} tone={urgent ? "butter" : "white"}>
                <p className="font-display text-[30px] font-bold leading-none text-navy">{Math.max(0, due.daysLeft)}</p>
                <p className="text-[11px] font-bold text-navy">{H.daysLeftBadge}</p>
              </Scallop>
              <div className="min-w-0">
                <p className="font-display text-[24px] font-semibold leading-tight text-navy">{days <= 0 ? H.bookNowTitle : H.timeToBookTitle}</p>
                <p className="mt-1.5 text-[14px] leading-snug text-navy/85">{H.timeToBookBody(due.label, fmtShort(due.supplyEndDate), fmtShort(due.apptBy ?? due.supplyEndDate), days)}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <BookLink to={bookingHref(me, "psychiatrist")} className={inkBtn}>{H.findTime}<ArrowIcon size={18} /></BookLink>
              <Link href="/care" className={outlineBtn}>{H.alreadyBooked}</Link>
            </div>
          </section>
        );
      })()}

      {/* Coming up: visits, medications, therapy and your pharmacy as colored tiles */}
      <SectionTitle action={<Link href="/timeline" className={smallOutlineBtn}>{H.seeAll}</Link>}>{H.comingUp}</SectionTitle>
      {!hasSteps && !pharmacy && <p className="mb-8 text-sm text-muted">{H.noneYet} <Link href="/care" className="font-semibold text-brand underline">{COPY.nav.care}</Link></p>}
      <div className="mb-8 grid grid-cols-2 gap-3">
        {me.appointments.slice(0, 2).map((a) => tile(`v${a.visit_id ?? a.slot_start}`, a.provider_type === "therapist" ? "lavender" : a.provider_type === "psychiatrist" ? "peach" : "mint",
          a.provider_type === "psychiatrist" ? H.tilePsych : a.provider_type === "therapist" ? H.tileTherapy : H.tileVisit,
          fmtSlot(a.slot_start), a.provider_name,
          <span className={smallInkBtn}>{H.booked}</span>))}
        {me.medications.map((m) => {
          const needsVisit = !!m.bookApptBy && !m.visitBooked;
          const line = m.rxSentOn ? H.rxSent(m.pharmacy?.name ?? null)
            : needsVisit ? visitLine(m, me.today, H, fmtShort)
            : m.nextAction === "request_rx" && m.requestRxBy ? H.requestRxBy(fmtShort(m.requestRxBy))
            : H.onTrack(fmtShort(m.supplyEndDate));
          return tile(`m${m.medicationId}`, statusTone(m.status), H.tileMed, H.daysLeft(m.label, m.daysLeft), line,
            needsVisit
              ? <BookLink to={bookingHref(me, "psychiatrist")} className={smallInkBtn}>{H.findTime}<ArrowIcon size={14} /></BookLink>
              : <Link href="/care" className={smallInkBtn}>{H.details}<ArrowIcon size={14} /></Link>);
        })}
        {me.therapy && !me.therapy.sessionBooked && tile("therapy", statusTone(me.therapy.status), H.tileTherapy, H.therapyDue(fmtShort(me.therapy.bookBy)), "",
          <BookLink to={bookingHref(me, "therapist")} className={smallInkBtn}>{H.findTime}<ArrowIcon size={14} /></BookLink>)}
        {pharmacy && tile("pharmacy", "white", H.tilePharmacy, pharmacy.pharmacy_name, pharmacy.address ?? "",
          pharmacy.phone
            ? <a href={`tel:${pharmacy.phone}`} className={smallInkBtn}><PhoneIcon size={14} />{H.callShort}</a>
            : <Link href="/care" className={smallInkBtn}>{H.details}<ArrowIcon size={14} /></Link>)}
      </div>

      {/* Mood check-in: three on top, two below */}
      <h2 className="mb-3 font-display text-[24px] font-semibold text-navy">{COPY.mood.question}</h2>
      <div className="mb-3 grid grid-cols-6 gap-2.5">
        {COPY.mood.choices.map((c, i) => (
          <button key={c} onClick={() => setMood(c)} aria-pressed={mood === c}
            className={`h-[76px] rounded-3xl font-display text-[16px] font-semibold text-navy transition ${i < 3 ? "col-span-2" : "col-span-3"} ${mood === c ? "bg-navy text-white" : toneBg[moodTones[i % moodTones.length]]}`}>
            {c}
          </button>
        ))}
      </div>
      {mood && (
        <div className="mb-6 rounded-3xl bg-white p-4 text-sm text-navy">
          <p>{COPY.mood.replies[mood]}</p>
          {mood === COPY.mood.choices[0] && (
            <>
              <p className="mt-2 font-semibold">{COPY.mood.crisis}</p>
              {/* Opens the phone's dialer / messages app. We can't connect the call for them. */}
              <div className="mt-3 flex gap-2">
                <a href="tel:988" className={`${inkBtn} flex-1`}>{COPY.help.call988}</a>
                <a href={lang === "es" ? "sms:988?&body=AYUDA" : "sms:988"} className={`${outlineBtn} flex-1`}>{COPY.help.text988}</a>
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-6">
        <Link href="/help" className={smallOutlineBtn}>{H.support}</Link>
      </div>
      <p className="mt-4 text-[12px] text-muted">{COPY.aiDisclosure}</p>
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
    <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-canvas px-7 pb-9 pt-11">
      <div className="flex flex-col items-center gap-3.5 text-center">
        <div className="flex flex-col items-center">
          <div className="relative h-32 w-32">
            <div className="absolute left-[14px] top-[18px] h-[100px] w-[100px] rounded-full bg-lavender" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascot-lavender.png" alt="Continuity mascot" className="mascot-float relative h-32 w-32 object-contain" />
          </div>
          <p className="font-display text-[30px] font-bold tracking-[-0.3px] text-navy">{COPY.appName}</p>
        </div>
        <h1 className="mt-2 font-display text-[36px] font-semibold leading-[1.05] tracking-[-0.4px] text-navy">
          {W.head1} <span className="font-medium italic">{W.headItalic}</span><br />{W.head2}
        </h1>
        <p className="max-w-[300px] text-[15px] leading-relaxed text-muted">{W.blurb}</p>
      </div>

      {/* Stacked shapes: refills, visits, reminders */}
      <div className="relative mx-auto mt-6 h-[250px] w-[350px] max-w-full" aria-hidden>
        <div className="absolute left-[150px] top-2 flex h-[150px] w-[170px] -rotate-[8deg] flex-col rounded-[30px] bg-butter px-[18px] py-5">
          <p className="font-display text-[23px] font-semibold text-navy">{W.refills}</p>
          <p className="mt-0.5 text-[12px] text-[#5B4A12]">{W.refillsSub}</p>
        </div>
        <Scallop size={140} tone="blush" className="absolute left-0 top-[46px]">
          <p className="-rotate-[14deg] font-display text-[21px] font-semibold text-navy">{W.visits}</p>
          <p className="mt-0.5 -rotate-[14deg] text-[11px] text-[#6B2E47]">{W.visitsSub}</p>
        </Scallop>
        <div className="absolute left-[110px] top-[118px] flex h-[132px] w-[132px] flex-col items-center justify-center rounded-full bg-mint text-center">
          <p className="rotate-[10deg] font-display text-[20px] font-semibold text-navy">{W.reminders}</p>
          <p className="mt-0.5 rotate-[10deg] text-[11px] text-[#24533C]">{W.remindersSub}</p>
        </div>
      </div>

      <div className="mt-auto space-y-3.5 pt-8">
        {signin && <p className="text-center text-sm text-coral">{signin === "cancelled" ? A.cancelled : A.failed}</p>}
        <a href="/api/auth/google" className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-navy text-[16px] font-bold text-white hover:brightness-110">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white"><GoogleMark /></span> {A.google}
        </a>
        <p className="flex justify-center gap-5 text-[13px] text-muted">
          <Link href="/privacy" className="underline">{COPY.profile.privacyLink}</Link>
          <Link href="/terms" className="underline">{COPY.profile.termsLink}</Link>
        </p>
      </div>
    </main>
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
