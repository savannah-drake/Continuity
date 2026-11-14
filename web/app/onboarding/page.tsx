// app/onboarding/page.tsx: 3-step setup (About you → Insurance → Your care), styled from Ivy's Onboarding mockup.
// Calendar (step 4 in the mockup) comes with PB-27. On finish, saves and goes to Home.
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { COPY, PLANS } from "@/lib/copy";
import { Screen, Title, Progress, Field, inputClass, Button, Notice, Card } from "@/components/ui";

const C = COPY.onboarding;
type CareType = "psychiatry" | "therapy" | "both";
const TOTAL = 3;

export default function Onboarding() {
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showMed = careType !== "therapy";
  const showTherapy = careType !== "psychiatry";

  function next() {
    setError(null);
    if (step === 1 && !phone.trim()) return setError(C.missing(C.phoneLabel.toLowerCase()));
    setStep(step + 1);
  }

  async function submit() {
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName, phone, insurancePlan, careType,
          medication: showMed ? {
            label: medLabel || "Your medication", daysSupplyRemaining: daysLeft,
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
            <Field label={C.nameLabel} help={C.nameHelp}>
              <input className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Maya" />
            </Field>
            <Field label={C.phoneLabel} help={C.phoneHelp}>
              <input className={inputClass} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 404 555 0100" />
            </Field>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <Title sub={C.insuranceHelp}>{C.insuranceTitle}</Title>
          <Field label={C.planLabel} help={C.planHelp}>
            <select className={inputClass} value={insurancePlan} onChange={(e) => setInsurancePlan(e.target.value)}>
              {PLANS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <div className="mt-4"><Notice>{C.privacyShort}</Notice></div>
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
