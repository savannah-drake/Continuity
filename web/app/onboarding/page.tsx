// app/onboarding/page.tsx: 4 steps (About you → Insurance → Your care → Calendar and location), after Google sign-in.
// Language (English/Español) can be switched on step 1; location saves home_lat/home_lng for Typesense geo search.
"use client";
import { SuggestInput } from "@/components/Suggest";
import { useEffect, useState } from "react";
import { useMe } from "@/lib/useMe";
import { useRouter } from "next/navigation";
import { PLANS } from "@/lib/copy";
import { useCopy, useLang, setLang } from "@/lib/i18n";
import { Screen, Title, Progress, Field, inputClass, Button } from "@/components/ui";

type CareType = "psychiatry" | "therapy" | "both";
const TOTAL = 4;

export default function Onboarding() {
  const COPY = useCopy();
  const C = COPY.onboarding;
  const lang = useLang();
  const router = useRouter();
  const { me, state } = useMe();
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState("");
  const [insurancePlan, setInsurancePlan] = useState(PLANS[0]);
  const [careType, setCareType] = useState<CareType>("both");
  const [medLabel, setMedLabel] = useState("");
  const [daysLeft, setDaysLeft] = useState(20);
  const [refills, setRefills] = useState(0);
  const [expires, setExpires] = useState("");
  const [needsAppt, setNeedsAppt] = useState(true);
  const [lead, setLead] = useState(14);
  const [lastSession, setLastSession] = useState("");
  const [cadence, setCadence] = useState(14);
  const [zip, setZip] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [connectGoogle, setConnectGoogle] = useState(true);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locNote, setLocNote] = useState<string | null>(null);
  // PB-27: schedule as a calendar file or link (sent after the account is created; only busy times are kept)
  const [calFile, setCalFile] = useState<{ name: string; text: string } | null>(null);
  const [calLink, setCalLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Must be signed in (Google) to set up; prefill the name Google gave us
  useEffect(() => { if (state === "none") router.replace("/"); }, [state, router]);
  useEffect(() => { if (me?.user.display_name) setDisplayName((n) => n || me.user.display_name!); }, [me]);

  const showMed = careType !== "therapy";
  const showTherapy = careType !== "psychiatry";

  function next() {
    setError(null);
    setStep(step + 1);
  }

  function useMyLocation() {
    setCoords(null);
    if (!navigator.geolocation || !window.isSecureContext) return setLocNote(C.locationDenied);
    setLocNote(C.locating);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setCoords({ lat, lng });
        setLocNote(C.locationFound);
        // Fill the ZIP box so people can see where we'll search from (free reverse lookup, no key).
        try {
          const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
          const g = await r.json();
          const found = String(g?.postcode ?? "").slice(0, 5);
          if (/^\d{5}$/.test(found)) setZip(found);
        } catch { /* coordinates are saved either way */ }
      },
      (err) => {
        console.warn("[onboarding] location error", err.code, err.message);
        // 1 = the browser or Mac blocked it; 2/3 = no fix or too slow (common on laptops)
        setLocNote(err.code === 1 ? C.locationBlocked : C.locationDenied);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
    );
  }

  async function submit() {
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName, insurancePlan, careType,
          preferredLanguage: lang,
          homeZip: zip || undefined,
          homeLat: coords?.lat, homeLng: coords?.lng,
          medication: showMed ? {
            label: medLabel || (lang === "es" ? "Tu medicamento" : lang === "zh" ? "你的药物" : "Your medication"), daysSupplyRemaining: daysLeft,
            refillsRemaining: refills, rxExpiresOn: expires || null,
            requiresAppointmentForRenewal: needsAppt, bookingLeadDays: lead, reminderTime: reminderTime || null,
          } : undefined,
          therapy: showTherapy && lastSession ? { lastSessionDate: lastSession, cadenceDays: cadence } : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      if (!connectGoogle && (calFile || calLink.trim())) {
        // Best effort: a calendar problem never blocks finishing onboarding
        await fetch("/api/calendar", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(calFile ? { ics: calFile.text } : { url: calLink.trim() }),
        }).catch(() => {});
      }
      // Google Calendar: one more Google screen to allow busy times + adding visits and reminders
      if (connectGoogle) { window.location.href = "/api/auth/google?calendar=1&next=/"; return; }
      router.push("/");
    } catch (e) {
      setError(String((e as Error)?.message) === "phone_taken" ? C.phoneTaken : C.error);
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Progress step={step} total={TOTAL} />

      {step === 1 && (
        <>
          <Title sub={C.aboutHelp}>{C.aboutTitle}</Title>
          <div className="space-y-4">
            <Field label={C.language}>
              <div className="flex rounded-full bg-mist p-1">
                {(["en", "es", "zh"] as const).map((l) => (
                  <button type="button" key={l} onClick={() => setLang(l)}
                    className={`flex-1 rounded-full py-2 text-sm font-bold ${lang === l ? "bg-navy text-white" : "text-navy"}`}>
                    {C.languages[l]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={C.nameLabel} help={C.nameHelp}>
              <input className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Maya" />
            </Field>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <Title sub={C.insuranceHelp}>{C.insuranceTitle}</Title>
          <div className="space-y-4">
            <Field label={C.planLabel} help={C.planHelp || undefined}>
              <select className={inputClass} value={insurancePlan} onChange={(e) => setInsurancePlan(e.target.value)}>
                {PLANS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
          </div>
          <p className="mt-4 text-xs text-muted">{C.privacyShort}</p>
        </>
      )}

      {step === 3 && (
        <>
          <Title sub={C.careHelp}>{C.careTitle}</Title>
          <Field label={C.careTypeLabel}>
            <div className="flex rounded-full bg-mist p-1">
              {(["both", "psychiatry"] as const).map((k) => (
                <button type="button" key={k} onClick={() => setCareType(k)}
                  className={`flex-1 rounded-full py-2 text-sm font-bold ${careType === k ? "bg-navy text-white" : "text-navy"}`}>
                  {C.careTypes[k]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{C.careRecommend}</p>
          </Field>

          {showMed && (
            <div className="mt-6 space-y-4 border-t border-line pt-6">
              <Field label={C.medLabel} help={C.medHelp}>
                <SuggestInput value={medLabel} onChange={setMedLabel} placeholder="Sertraline 50 mg" label={C.medLabel} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={C.daysLeftLabel}>
                  <input className={inputClass} type="number" min={0} value={daysLeft} onChange={(e) => setDaysLeft(Number(e.target.value))} />
                </Field>
                <Field label={C.refillsLabel}>
                  <input className={inputClass} type="number" min={0} value={refills} onChange={(e) => setRefills(Number(e.target.value))} />
                </Field>
              </div>
              <Field label={C.expiresLabel}>
                <input className={inputClass} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
              </Field>
              <label className="flex items-center gap-2 text-sm text-navy">
                <input type="checkbox" className="h-4 w-4 accent-[#2A2438]" checked={needsAppt} onChange={(e) => setNeedsAppt(e.target.checked)} />
                {C.needsApptLabel}
              </label>
              <Field label={C.leadLabel}>
                <input className={inputClass} type="number" min={0} value={lead} onChange={(e) => setLead(Number(e.target.value))} />
              </Field>
              <Field label={COPY.care.medReminder} help={COPY.care.medReminderHelp}>
                <input className={inputClass} type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />
              </Field>
              <p className="text-xs text-muted">{C.moreMedsLater}</p>
            </div>
          )}

          {showTherapy && (
            <div className="mt-6 space-y-4 border-t border-line pt-6">
              <Field label={C.lastSessionLabel}>
                <input className={inputClass} type="date" value={lastSession} onChange={(e) => setLastSession(e.target.value)} />
              </Field>
              <Field label={C.cadenceLabel}>
                <select className={inputClass} value={cadence} onChange={(e) => setCadence(Number(e.target.value))}>
                  {Object.entries(C.cadences).map(([d, name]) => <option key={d} value={d}>{name}</option>)}
                </select>
              </Field>
            </div>
          )}
        </>
      )}

      {step === 4 && (
        <>
          <Title sub={C.calendarHelp}>{C.calendarTitle}</Title>
          <div className="mb-8 space-y-4">
            <label className="flex items-start gap-3 text-sm text-navy">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#2A2438]" checked={connectGoogle} onChange={(e) => setConnectGoogle(e.target.checked)} />
              <span><span className="font-bold">{COPY.calendarSync.connect}</span><br /><span className="text-muted">{COPY.calendarSync.explain}</span></span>
            </label>
            {!connectGoogle && (<>
            <label className={`block cursor-pointer rounded-xl border border-dashed py-3 text-center text-sm font-bold ${calFile ? "border-forest bg-mint text-forest" : "border-line bg-white text-navy"}`}>
              {calFile ? C.calendarReady(calFile.name) : C.calendarUpload}
              <input type="file" accept=".ics,text/calendar" className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setCalFile({ name: f.name, text: await f.text() });
                  e.target.value = "";
                }} />
            </label>
            <Field label={C.calendarLinkLabel} help={C.calendarLinkHelp}>
              <input className={inputClass} value={calLink} onChange={(e) => setCalLink(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" autoComplete="off" />
            </Field>
            </>)}
          </div>
          <Title sub={C.locationHelp}>{C.locationTitle}</Title>
          <div className="space-y-4">
            <Button kind="secondary" type="button" onClick={useMyLocation}>{C.useMyLocation}</Button>
            <Field label={C.zipLabel}>
              <input className={inputClass} inputMode="numeric" maxLength={5} value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} placeholder="30322" />
            </Field>
            {locNote && <p className="text-sm text-muted">{locNote}</p>}
          </div>
          <p className="mt-4 text-xs text-muted">{C.privacyShort}</p>
        </>
      )}

      {error && <p className="mt-4 text-sm text-coral">{error}</p>}

      <div className="mt-8 space-y-3">
        {step < TOTAL
          ? <Button onClick={next}>{C.continue}</Button>
          : <Button onClick={submit} disabled={saving}>{saving ? C.saving : C.submit}</Button>}
        {step > 1 && <Button kind="secondary" onClick={() => setStep(step - 1)}>{C.back}</Button>}
      </div>
    </Screen>
  );
}
