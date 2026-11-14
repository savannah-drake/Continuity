// app/book/[slotId]/page.tsx: request + "You're booked", from Ivy's Booking Confirmation mockup.
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { COPY } from "@/lib/copy";
import { useMe, getUserId, fmtShort, isoDay } from "@/lib/useMe";
import { diffDays } from "@/lib/engine";
import { Screen, Card, Avatar, Button, ButtonLink, Notice, Eyebrow } from "@/components/ui";

type Slot = {
  slot_id: number; slot_start: string; duration_min: number; telehealth: boolean; slot_status: string;
  provider_name: string; specialty: string; address: string;
};
const B = COPY.booking;

export default function BookPage() {
  const { slotId } = useParams<{ slotId: string }>();
  const router = useRouter();
  const { me } = useMe();
  const [slot, setSlot] = useState<Slot | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "done" | "taken" | "error">("loading");

  useEffect(() => {
    fetch(`/api/bookings?slotId=${slotId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: Slot) => { setSlot(s); setState(s.slot_status === "open" ? "ready" : "taken"); })
      .catch(() => setState("error"));
  }, [slotId]);

  async function confirm() {
    setState("saving");
    const userId = getUserId();
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: Number(slotId), userId: userId ? Number(userId) : null }),
    });
    setState(res.ok ? "done" : res.status === 409 ? "taken" : "error");
  }

  if (state === "loading") return <Screen><p className="text-muted">{B.loading}</p></Screen>;
  if (state === "error" || !slot) return <Screen><p className="mb-4 text-muted">{B.error}</p><Button kind="secondary" onClick={() => router.back()}>{B.pickAnother}</Button></Screen>;

  const start = new Date(slot.slot_start);
  const date = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" });
  const time = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  const med = me?.medication;
  const daysAfter = med ? diffDays(isoDay(slot.slot_start), med.supplyEndDate) : null;

  return (
    <Screen>
      <div className="mb-5 flex flex-col items-center text-center">
        {state === "done" && (
          <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-mist">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-3xl font-bold text-white">✓</div>
          </div>
        )}
        <h1 className="text-[24px] font-bold text-navy">
          {state === "done" ? B.doneTitle : state === "taken" ? B.takenTitle : B.title}
        </h1>
        <p className="text-sm text-muted">{state === "done" ? B.doneBody : state === "taken" ? B.takenBody : B.body}</p>
      </div>

      <Card className="mb-3">
        <div className="mb-3 flex items-center gap-3 border-b border-line pb-3">
          <Avatar name={slot.provider_name} />
          <div><p className="font-bold text-navy">{slot.provider_name}</p><p className="text-xs text-muted">{slot.specialty}</p></div>
        </div>
        <div className="grid grid-cols-2 gap-y-3">
          {[[B.labels.date, date], [B.labels.time, time],
            [B.labels.type, slot.telehealth ? B.video : B.inPerson], [B.labels.length, `${slot.duration_min} ${B.minutes}`]].map(([k, v]) => (
            <div key={k}><Eyebrow className="!text-muted !text-[10px]">{k}</Eyebrow><p className="font-bold text-navy">{v}</p></div>
          ))}
        </div>
      </Card>

      {state === "done" && med && daysAfter !== null && daysAfter >= 0 && (
        <Card tone="attn" className="mb-3">
          <p className="text-sm font-bold text-attn-text">{B.aheadTitle}</p>
          <p className="text-xs text-attn-text">{B.aheadBody(med.label, fmtShort(med.supplyEndDate), daysAfter)}</p>
        </Card>
      )}

      {state === "done" && <p className="mb-4 text-xs text-muted">{B.reminders}</p>}
      <div className="mb-4"><Notice>{COPY.results.demoNotice}</Notice></div>

      {(state === "ready" || state === "saving") && (
        <Button onClick={confirm} disabled={state === "saving"}>{state === "saving" ? B.saving : B.confirm}</Button>
      )}
      {state === "taken" && <Button kind="secondary" onClick={() => router.back()}>{B.pickAnother}</Button>}
      {state === "done" && <ButtonLink href="/">{B.done}</ButtonLink>}
    </Screen>
  );
}
