// app/fund/page.tsx: the Continuity Care Fund donor screen (Ivy's copy).
// Fund balance, every copay covered (each with its public Solana receipt), a Solana Pay QR to donate,
// and "Why blockchain?". No card numbers, ever. Demo runs on Solana devnet: no real money moves.
"use client";
import { useEffect, useState } from "react";
import { localeFor } from "@/lib/copy";
import { useCopy, useLang } from "@/lib/i18n";
import { Screen, Card, Eyebrow, Notice, BottomNav } from "@/components/ui";

type Fund = {
  address: string; explorer: string; balanceUsd: number; grants: number; grantedUsd: number;
  recent: { paid_at: string; amount_usd: string; explorer: string }[];
};

const AMOUNTS = [5, 15, 20];

export default function FundPage() {
  const F = useCopy().fund;
  const lang = useLang();
  const [fund, setFund] = useState<Fund | null>(null);
  const [failed, setFailed] = useState(false);
  const [usd, setUsd] = useState(15);
  const [custom, setCustom] = useState("");
  const [why, setWhy] = useState(false);

  useEffect(() => {
    fetch("/api/carefund").then((r) => (r.ok ? r.json() : Promise.reject())).then(setFund).catch(() => setFailed(true));
  }, []);

  const amount = custom ? Math.max(1, Math.min(500, Number(custom) || 0)) : usd;
  const day = (iso: string) => new Date(iso).toLocaleDateString(localeFor(lang), { month: "short", day: "numeric" });

  return (
    <Screen nav>
      <Eyebrow>{F.eyebrow}</Eyebrow>
      <h1 className="mt-1 text-[26px] font-bold text-navy">{F.title}</h1>
      <p className="mb-4 text-sm text-muted">{F.sub}</p>

      {failed && <Notice>{F.unavailable}</Notice>}

      {fund && (
        <Card className="mb-4">
          <p className="text-sm font-bold text-muted">{F.balanceLabel}</p>
          <p className="text-[34px] font-extrabold text-navy">${fund.balanceUsd.toLocaleString()}</p>
          <p className="text-sm text-muted">{F.covered(fund.grants, fund.grantedUsd)}</p>
          <a href={fund.explorer} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-brand underline">{F.viewFund}</a>
        </Card>
      )}

      <Card className="mb-4">
        <p className="mb-1 font-bold text-navy">{F.donateTitle}</p>
        <p className="mb-3 text-sm text-muted">{F.donateBody}</p>
        <div className="mb-3 flex gap-2">
          {AMOUNTS.map((a) => (
            <button key={a} type="button" onClick={() => { setUsd(a); setCustom(""); }}
              className={`flex-1 rounded-full border-2 py-2 text-sm font-bold ${!custom && usd === a ? "border-brand bg-brand text-white" : "border-line text-navy"}`}>
              ${a}
            </button>
          ))}
          <input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder={F.custom} aria-label={F.custom}
            className="w-24 rounded-full border-2 border-line px-3 text-center text-sm font-bold text-navy placeholder:font-normal placeholder:text-muted" />
        </div>
        <div className="flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/carefund/qr?usd=${amount}`} alt={F.qrAlt(amount)} width={200} height={200} className="rounded-xl border border-line" />
          <p className="mt-2 text-center text-xs text-muted">{F.scan(amount)}</p>
        </div>
      </Card>

      {fund && fund.recent.length > 0 && (
        <Card className="mb-4">
          <p className="mb-2 font-bold text-navy">{F.recentTitle}</p>
          <ul className="divide-y divide-line">
            {fund.recent.map((r) => (
              <li key={r.explorer} className="flex items-center justify-between py-2 text-sm">
                <span className="text-navy">{day(r.paid_at)} · ${Number(r.amount_usd)} {F.copay}</span>
                <a href={r.explorer} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">{F.receipt}</a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <button type="button" onClick={() => setWhy(!why)} className="mb-2 text-sm font-bold text-brand underline">{F.whyTitle}</button>
      {why && <p className="mb-4 text-sm text-navy">{F.whyBody}</p>}

      <Notice>{F.demo}</Notice>
      <BottomNav active="home" />
    </Screen>
  );
}
