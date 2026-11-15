// app/onboarding/page.tsx: 4 steps (About you → Insurance → Your care → Your location), Ivy's Onboarding mockup.
// Language (English/Español) can be switched on step 1; location saves home_lat/home_lng for Typesense geo search.
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLANS } from "@/lib/copy";
import { useCopy, useLang, setLang } from "@/lib/i18n";
import { Screen, Title, Progress, Field, inputClass, Button, Notice, Card } from "@/components/ui";

type CareType = "psychiatry" | "therapy" | "both";
const TOTAL = 4;

export default function Onboarding() {
  const COPY = useCopy();
  const C = COPY.onboarding;
  const lang = useLang();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
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
  // Ivy's insurance fields are shown for the design but kept in this screen only: never sent or saved.
  const [localOnly, setLocalOnly] = useState({ dob: "", memberId: "", group: "", holder: "", front: false, back: false });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locNote, setLocNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showMed = careType !== "therapy";
  const showTherapy = careType !== "psychiatry";

  function next() {
    setError(null);
    if (step === 1 && !phone.trim()) return setError(C.missing(C.phoneLabel.toLowerCase()));
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
          displayName, phone, insurancePlan, careType,
          preferredLanguage: lang,
          homeZip: zip || undefined,
          homeLat: coords?.lat, homeLng: coords?.lng,
          medication: showMed ? {
            label: medLabel || (lang === "es" ? "Tu medicamento" : "Your medication"), daysSupplyRemaining: daysLeft,
            refillsRemaining: refills, rxExpiresOn: expires || null,
            requiresAppointmentForRenewal: needsAppt, bookingLeadDays: lead,
          } : undefined,
          therapy: showTherapy && lastSession ? { lastSessionDate: lastSession, cadenceDays: cadence } : undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      try { localStorage.setItem("continuity_user_id", String(data.userId)); } catch {}
      router.push("/");
    } catch {
      setError(C.error);
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
                {(["en", "es"] as const).map((l) => (
                  <button type="button" key={l} onClick={() => setLang(l)}
                    className={`flex-1 rounded-full py-2 text-sm font-bold ${lang === l ? "bg-brand text-white" : "text-navy"}`}>
                    {C.languages[l]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={C.nameLabel} help={C.nameHelp}>
              <input className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Maya" />
            </Field>
            <Field label={C.phoneLabel} help={C.phoneHelp}>
              <input className={inputClass} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 404 555 0100" />
            </Field>
            <Field label={C.dobLabel} help={C.dobHelp}>
              <input className={inputClass} inputMode="numeric" autoComplete="off" value={localOnly.dob}
                onChange={(e) => setLocalOnly({ ...localOnly, dob: e.target.value })} placeholder="MM / DD / YYYY" />
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
            <Field label={C.memberIdLabel} help={C.memberIdHelp}>
              <input className={inputClass} autoComplete="off" value={localOnly.memberId} onChange={(e) => setLocalOnly({ ...localOnly, memberId: e.target.value })} />
            </Field>
            <Field label={C.groupLabel} help={C.groupHelp}>
              <input className={inputClass} autoComplete="off" value={localOnly.group} onChange={(e) => setLocalOnly({ ...localOnly, group: e.target.value })} />
            </Field>
            <Field label={C.holderLabel} help={C.holderHelp}>
              <input className={inputClass} autoComplete="off" value={localOnly.holder} onChange={(e) => setLocalOnly({ ...localOnly, holder: e.target.value })} />
            </Field>
            <Field label={C.cardLabel} help={C.cardHelp}>
              <div className="flex gap-3">
                {(["front", "back"] as const).map((side) => (
                  // Opens the camera / photo picker; the photo is never read or uploaded.
                  <label key={side}
                    className={`flex-1 cursor-pointer rounded-xl border border-dashed py-3 text-center text-sm font-bold ${localOnly[side] ? "border-forest bg-mint text-forest" : "border-line bg-white text-navy"}`}>
                    {localOnly[side] ? `✓ ${C.cardAdded}` : side === "front" ? C.cardFront : C.cardBack}
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={(e) => { setLocalOnly({ ...localOnly, [side]: Boolean(e.target.files?.length) }); e.target.value = ""; }} />
                  </label>
                ))}
              </div>
            </Field>
          </div>
          <div className="mt-4 space-y-2">
            <Notice>{C.notSaved}</Notice>
            <Notice>{C.privacyShort}</Notice>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <Title sub={C.careHelp}>{C.careTitle}</Title>
          <Field label={C.careTypeLabel}>
            <div className="flex rounded-full bg-mist p-1">
              {(Object.keys(C.careTypes) as CareType[]).map((k) => (
                <button type="button" key={k} onClick={() => setCareType(k)}
                  className={`flex-1 rounded-full py-2 text-sm font-bold ${careType === k ? "bg-brand text-white" : "text-navy"}`}>
                  {C.careTypes[k]}
                </button>
              ))}
            </div>
          </Field>

          {showMed && (
            <Card className="mt-4 space-y-4">
              <Field label={C.medLabel} help={C.medHelp}>
                <input className={inputClass} value={medLabel} onChange={(e) => setMedLabel(e.target.value)} placeholder="Sertraline 50 mg" />
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
                <input type="checkbox" className="h-4 w-4 accent-[#5AA9D8]" checked={needsAppt} onChange={(e) => setNeedsAppt(e.target.checked)} />
                {C.needsApptLabel}
              </label>
              <Field label={C.leadLabel}>
                <input className={inputClass} type="number" min={0} value={lead} onChange={(e) => setLead(Number(e.target.value))} />
              </Field>
            </Card>
          )}

          {showTherapy && (
            <Card className="mt-4 space-y-4">
              <Field label={C.lastSessionLabel}>
                <input className={inputClass} type="date" value={lastSession} onChange={(e) => setLastSession(e.target.value)} />
              </Field>
              <Field label={C.cadenceLabel}>
                <select className={inputClass} value={cadence} onChange={(e) => setCadence(Number(e.target.value))}>
                  {Object.entries(C.cadences).map(([d, name]) => <option key={d} value={d}>{name}</option>)}
                </select>
              </Field>
            </Card>
          )}
        </>
      )}

      {step === 4 && (
        <>
          <Title sub={C.locationHelp}>{C.locationTitle}</Title>
          <div className="space-y-4">
            <Button kind="secondary" type="button" onClick={useMyLocation}>{C.useMyLocation}</Button>
            <Field label={C.zipLabel}>
              <input className={inputClass} inputMode="numeric" maxLength={5} value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} placeholder="30322" />
            </Field>
            {locNote && <p className="text-sm text-muted">{locNote}</p>}
          </div>
          <div className="mt-4"><Notice>{C.privacyShort}</Notice></div>
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
