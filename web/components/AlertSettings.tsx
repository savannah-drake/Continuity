// components/AlertSettings.tsx: Profile → Alerts. Push notifications on this phone/browser, and email.
"use client";
import { useEffect, useState } from "react";
import { useCopy } from "@/lib/i18n";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

// The browser wants the public key as bytes
function keyBytes(b64: string) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(s.length)); // a plain ArrayBuffer, which pushManager.subscribe requires
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function AlertSettings({ emailOn: initialEmail, email }: { emailOn: boolean; email: string | null }) {
  const A = useCopy().alerts;
  const [push, setPush] = useState(false);
  const [emailOn, setEmailOn] = useState(initialEmail);
  const [note, setNote] = useState<string | null>(null);
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && !!VAPID;

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.getRegistration("/").then((r) => r?.pushManager.getSubscription()).then((s) => setPush(!!s)).catch(() => {});
  }, [supported]);

  async function togglePush(on: boolean) {
    setNote(null);
    if (!VAPID) { setNote("Notifications aren't set up on the server yet (missing NEXT_PUBLIC_VAPID_PUBLIC_KEY)."); return; }
    if (!supported) { setNote(A.unsupported); return; }
    try { await turnPush(on); } catch (e) {
      console.error("push setup failed", e);
      setNote(`${A.blocked} (${e instanceof Error ? e.message : String(e)})`);
    }
  }

  async function turnPush(on: boolean) {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    if (!on) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
        await sub.unsubscribe();
      }
      setPush(false);
      return;
    }
    if ((await Notification.requestPermission()) !== "granted") { setNote(A.blocked); return; }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) });
    const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) }).catch(() => null);
    setPush(!!res?.ok);
    if (res?.ok) await runNow(true); // send anything already due to this phone right away
  }

  async function toggleEmail(on: boolean) {
    setEmailOn(on);
    const res = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alertEmail: on }) }).catch(() => null);
    if (!res?.ok) setEmailOn(!on);
  }

  async function runNow(quiet = false) {
    const d = await fetch("/api/alerts/run", { method: "POST" }).then((r) => r.json()).catch(() => ({ sent: 0 }));
    if (!quiet || d.sent) setNote(d.sent ? A.ranSent(d.sent) : A.ranNothing);
  }

  async function test() {
    setNote(null);
    const d = await fetch("/api/alerts/test", { method: "POST" }).then((r) => r.json()).catch(() => ({ sent: 0 }));
    setNote(d.sent ? A.testSent : A.nothingSent);
  }

  return (
    <section className="mb-8">
      <h2 className="mb-1 text-[15px] font-bold text-navy">{A.title}</h2>
      <p className="mb-3 text-sm text-muted">{A.sub}</p>
      <div className="rounded-2xl border border-line bg-white px-4 py-3 text-sm text-navy">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#5AA9D8]" checked={push} onChange={(e) => togglePush(e.target.checked)} />
          <span><span className="font-semibold">{A.push}</span><br /><span className="text-muted">{A.pushHelp}</span></span>
        </label>
        {email && (
          <label className="mt-3 flex items-start gap-3 border-t border-line pt-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#5AA9D8]" checked={emailOn} onChange={(e) => toggleEmail(e.target.checked)} />
            <span><span className="font-semibold">{A.email}</span><br /><span className="text-muted">{email}</span></span>
          </label>
        )}
        <div className="mt-3 flex gap-5 font-semibold">
          <button type="button" onClick={() => runNow()} className="text-brand">{A.runNow}</button>
          <button type="button" onClick={test} className="text-muted">{A.test}</button>
        </div>
        <p className="mt-2 text-xs text-muted">{A.schedule}</p>
        {note && <p className="mt-2 text-muted" role="status">{note}</p>}
      </div>
    </section>
  );
}
