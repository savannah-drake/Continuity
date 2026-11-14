// app/onboarding/page.tsx
// Functional onboarding form. Ivy's design replaces the styling later; words come from lib/copy.ts.
"use client";
import { useState } from "react";
import Link from "next/link";
import { COPY, PLANS } from "@/lib/copy";
import type { Timeline } from "@/lib/engine";

const C = COPY.onboarding;
type CareType = "psychiatry" | "therapy" | "both";

const input = "w-full rounded-lg border border-gray-300 px-3 py-2";
const label = "block text-sm font-medium mb-1";
const help = "text-xs text-gray-500 mt-1";

export default function Onboarding() {
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
  const [error, setError] = useState(false);
  const [result, setResult] = useState<{ timeline: Timeline | null; therapyTimeline: any } | null>(null);

  const showMed = careType !== "therapy";
  const showTherapy = careType !== "psychiatry";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(false);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName, phone, insurancePlan, careType,
          medication: showMed ? {
            label: medLabel || "My medication", daysSupplyRemaining: daysLeft,
            refillsRemaining: refills, rxExpiresOn: expires || null,
            requiresAppointmentForRenewal: needsAppt, bookingLeadDays: lead,
          } : undefined,
          therapy: showTherapy && lastSession ? { lastSessionDate: lastSession, cadenceDays: cadence } : undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      try { localStorage.setItem("continuity_user_id", String(data.userId)); } catch {}
      setResult(data);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  if (result) return <PlanResult {...result} insurancePlan={insurancePlan} />;

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-2xl font-semibold">{C.title}</h1>
      <p className="text-gray-600 mb-6">{C.subtitle}</p>

      <form onSubmit={submit} className="space-y-5">
        <div><label className={label}>{C.nameLabel}</label>
          <input className={input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>

        <div><label className={label}>{C.phoneLabel}</label>
          <input className={input} type="tel" required placeholder="+1 404 555 0100" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <p className={help}>{C.phoneHelp}</p></div>

        <div><label className={label}>{C.planLabel}</label>
          <select className={input} value={insurancePlan} onChange={(e) => setInsurancePlan(e.target.value)}>
            {PLANS.map((p) => <option key={p}>{p}</option>)}
          </select>
          <p className={help}>{C.planHelp}</p></div>

        <div><label className={label}>{C.careTypeLabel}</label>
          <div className="flex gap-2">
            {(Object.keys(C.careTypes) as CareType[]).map((k) => (
              <button type="button" key={k} onClick={() => setCareType(k)}
                className={`rounded-full border px-3 py-1 text-sm ${careType === k ? "bg-black text-white" : ""}`}>
                {C.careTypes[k]}
              </button>
            ))}
          </div></div>

        {showMed && (
          <fieldset className="space-y-4 rounded-xl border p-4">
            <legend className="px-1 font-medium">{C.medSection}</legend>
            <div><label className={label}>{C.medLabel}</label>
              <input className={input} value={medLabel} onChange={(e) => setMedLabel(e.target.value)} />
              <p className={help}>{C.medHelp}</p></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={label}>{C.daysLeftLabel}</label>
                <input className={input} type="number" min={0} value={daysLeft} onChange={(e) => setDaysLeft(Number(e.target.value))} /></div>
              <div><label className={label}>{C.refillsLabel}</label>
                <input className={input} type="number" min={0} value={refills} onChange={(e) => setRefills(Number(e.target.value))} /></div>
            </div>
            <div><label className={label}>{C.expiresLabel}</label>
              <input className={input} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={needsAppt} onChange={(e) => setNeedsAppt(e.target.checked)} /> {C.needsApptLabel}
            </label>
            <div><label className={label}>{C.leadLabel}</label>
              <input className={input} type="number" min={0} value={lead} onChange={(e) => setLead(Number(e.target.value))} /></div>
          </fieldset>
        )}

        {showTherapy && (
          <fieldset className="space-y-4 rounded-xl border p-4">
            <legend className="px-1 font-medium">{C.therapySection}</legend>
            <div><label className={label}>{C.lastSessionLabel}</label>
              <input className={input} type="date" value={lastSession} onChange={(e) => setLastSession(e.target.value)} /></div>
            <div><label className={label}>{C.cadenceLabel}</label>
              <select className={input} value={cadence} onChange={(e) => setCadence(Number(e.target.value))}>
                {Object.entries(C.cadences).map(([d, name]) => <option key={d} value={d}>{name}</option>)}
              </select></div>
          </fieldset>
        )}

        {error && <p className="text-sm text-red-600">{C.error}</p>}
        <button disabled={saving} className="w-full rounded-lg bg-black py-3 text-white disabled:opacity-60">
          {saving ? C.saving : C.submit}
        </button>
      </form>
    </main>
  );
}

// Temporary results view (PB-14 replaces this with the real timeline)
function PlanResult({ timeline, therapyTimeline, insurancePlan }: { timeline: Timeline | null; therapyTimeline: any; insurancePlan: string }) {
  const find = (type: string, before: string) =>
    `/providers?${new URLSearchParams({ plan: insurancePlan, type, before })}`;
  const T = COPY.timeline;
  const fmt = (d: string | null) =>
    d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "—";
  const row = (name: string, d: string | null) => d && (
    <div className="flex justify-between border-b py-2"><span>{name}</span><span className="font-medium">{fmt(d)}</span></div>
  );
  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-2xl font-semibold mb-4">{T.title}</h1>
      {timeline && (
        <section className="mb-6 rounded-xl border p-4">
          <p className="font-medium">{COPY.actions[timeline.nextAction]}</p>
          <p className="text-sm text-gray-500 mb-3">
            {COPY.status[timeline.status]}
            {timeline.renewalReason ? ` · ${COPY.renewalReasons[timeline.renewalReason]}` : ""}
          </p>
          {row(T.bookApptBy, timeline.bookApptBy)}
          {row(T.apptBy, timeline.apptBy)}
          {row(T.rxNeededBy, timeline.rxNeededBy)}
          {row(T.refillDeadline, timeline.refillDeadline)}
          {row(T.supplyEnd, timeline.supplyEndDate)}
          {timeline.apptBy && (
            <Link href={find("psychiatrist", timeline.apptBy)}
              className="mt-4 block rounded-lg bg-black py-3 text-center text-white">
              {COPY.results.findAppointment}
            </Link>
          )}
        </section>
      )}
      {therapyTimeline && (
        <section className="rounded-xl border p-4">
          <p className="font-medium">{COPY.actions[therapyTimeline.nextAction as keyof typeof COPY.actions]}</p>
          {row(T.bookSessionBy, therapyTimeline.bookBy)}
          {row(T.nextSessionBy, therapyTimeline.nextSessionBy)}
          <Link href={find("therapist", therapyTimeline.nextSessionBy)}
            className="mt-4 block rounded-lg border py-3 text-center">
            {COPY.results.findTherapist}
          </Link>
        </section>
      )}
    </main>
  );
}
