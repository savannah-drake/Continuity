// components/CareFund.tsx: PB-26 "Help with my copay" card (booking confirmation) + fund card (Insights).
// Wording is a DRAFT for Ivy: edit the CF strings below or move them into lib/copy.ts.
"use client";
import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { Card, Button, Eyebrow } from "@/components/ui";

const CF = {
  en: {
    eyebrow: "Continuity Care Fund",
    ask: (usd: number) => `Cost shouldn't be the reason you skip a visit. The fund can cover $${usd} of your copay.`,
    button: "Help with my copay",
    paying: "Sending…",
    paid: (usd: number) => `$${usd} sent to your provider's office.`,
    proof: "See the public receipt",
    empty: "The fund is empty right now. We'll let you know when it's refilled.",
    error: "That didn't go through. Your appointment is still booked.",
    fundTitle: "Care Fund",
    fundBody: (n: number, usd: number) => `${n} copays covered · $${usd} given`,
    available: (usd: number) => `$${usd} available`,
    wallet: "View the fund on Solana Explorer",
    demo: "Demo on Solana devnet. No real money moves.",
  },
  es: {
    eyebrow: "Fondo de Cuidado Continuity",
    ask: (usd: number) => `El costo no debería impedirte ir a tu cita. El fondo puede cubrir $${usd} de tu copago.`,
    button: "Ayuda con mi copago",
    paying: "Enviando…",
    paid: (usd: number) => `Se enviaron $${usd} al consultorio.`,
    proof: "Ver el recibo público",
    empty: "El fondo está vacío por ahora. Te avisaremos cuando se recargue.",
    error: "No se pudo completar. Tu cita sigue agendada.",
    fundTitle: "Fondo de Cuidado",
    fundBody: (n: number, usd: number) => `${n} copagos cubiertos · $${usd} donados`,
    available: (usd: number) => `$${usd} disponibles`,
    wallet: "Ver el fondo en Solana Explorer",
    demo: "Demostración en Solana devnet. No se mueve dinero real.",
  },
};

export function CopayHelp({ slotId, userId, grantUsd = 25 }: { slotId: number; userId: string | null; grantUsd?: number }) {
  const t = CF[useLang()];
  const [state, setState] = useState<"idle" | "paying" | "paid" | "empty" | "error">("idle");
  const [receipt, setReceipt] = useState<{ explorer: string; amountUsd: number } | null>(null);

  async function pay() {
    setState("paying");
    const res = await fetch("/api/carefund/pay", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, userId: userId ? Number(userId) : null }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) { setReceipt(body); setState("paid"); }
    else setState(body.reason === "empty" ? "empty" : "error");
  }

  return (
    <Card className="mb-4">
      <Eyebrow>{t.eyebrow}</Eyebrow>
      {state === "paid" && receipt ? (
        <>
          <p className="mb-2 text-sm font-bold text-forest">{t.paid(receipt.amountUsd)}</p>
          <a className="text-sm font-semibold text-brand underline" href={receipt.explorer} target="_blank" rel="noreferrer">{t.proof}</a>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">{t.ask(grantUsd)}</p>
          {state === "empty" && <p className="mb-3 text-xs text-attn-text">{t.empty}</p>}
          {state === "error" && <p className="mb-3 text-xs text-attn-text">{t.error}</p>}
          <Button kind="secondary" onClick={pay} disabled={state === "paying"}>{state === "paying" ? t.paying : t.button}</Button>
        </>
      )}
      <p className="mt-3 text-[11px] text-muted">{t.demo}</p>
    </Card>
  );
}

type Fund = { balanceUsd: number; grants: number; grantedUsd: number; explorer: string };

export function FundCard() {
  const t = CF[useLang()];
  const [fund, setFund] = useState<Fund | null>(null);
  useEffect(() => { fetch("/api/carefund").then((r) => (r.ok ? r.json() : null)).then(setFund).catch(() => {}); }, []);
  if (!fund) return null;
  return (
    <Card className="mb-4">
      <Eyebrow>{t.fundTitle}</Eyebrow>
      <p className="text-2xl font-extrabold">{t.available(fund.balanceUsd)}</p>
      <p className="mb-2 text-sm text-muted">{t.fundBody(fund.grants, fund.grantedUsd)}</p>
      <a className="text-sm font-semibold text-brand underline" href={fund.explorer} target="_blank" rel="noreferrer">{t.wallet}</a>
      <p className="mt-3 text-[11px] text-muted">{t.demo}</p>
    </Card>
  );
}
