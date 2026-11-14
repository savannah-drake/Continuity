"use client";
// components/ui.tsx
// Shared building blocks from Ivy's style guide: cards, pill buttons, status pills, eyebrows, progress.
import Link from "next/link";
import { useCopy } from "@/lib/i18n";
import type { ReactNode, ButtonHTMLAttributes } from "react";

export function Screen({ children, nav = false }: { children: ReactNode; nav?: boolean }) {
  return (
    <main className={`mx-auto w-full max-w-md flex-1 bg-surface px-6 pt-8 ${nav ? "pb-28" : "pb-10"} min-h-screen`}>
      {children}
    </main>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[11px] font-bold uppercase tracking-[0.12em] text-brand ${className}`}>{children}</p>;
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-[26px] font-bold leading-tight text-navy">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}

type CardTone = "white" | "attn" | "mint";
const cardTone: Record<CardTone, string> = {
  white: "bg-white border-line",
  attn: "bg-attn-tint border-attn-tint",
  mint: "bg-mint border-mint",
};
export function Card({ children, tone = "white", className = "" }: { children: ReactNode; tone?: CardTone; className?: string }) {
  return <section className={`rounded-2xl border p-4 ${cardTone[tone]} ${className}`}>{children}</section>;
}

const btnBase = "flex h-12 w-full items-center justify-center rounded-full text-[15px] font-bold transition disabled:opacity-60";
const btnKind = {
  primary: "bg-brand text-white hover:brightness-95",
  secondary: "border-2 border-brand bg-white text-brand hover:bg-mist/40",
  attn: "bg-attn text-white hover:brightness-95",
};
export function Button({ kind = "primary", className = "", ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { kind?: keyof typeof btnKind }) {
  return <button {...props} className={`${btnBase} ${btnKind[kind]} ${className}`} />;
}
export function ButtonLink({ href, kind = "primary", className = "", children }:
  { href: string; kind?: keyof typeof btnKind; className?: string; children: ReactNode }) {
  return <Link href={href} className={`${btnBase} ${btnKind[kind]} ${className}`}>{children}</Link>;
}

type PillTone = "mint" | "attn" | "coral" | "mist" | "slate";
const pillTone: Record<PillTone, string> = {
  mint: "bg-mint text-forest",
  attn: "bg-attn-tint text-attn-text",
  coral: "bg-coral/20 text-[#9B3B2E]",
  mist: "bg-mist text-navy",
  slate: "bg-line text-muted",
};
export function Pill({ children, tone = "mist" }: { children: ReactNode; tone?: PillTone }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${pillTone[tone]}`}>{children}</span>;
}

export function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-6">
      <Eyebrow>Step {step} of {total}</Eyebrow>
      <div className="mt-2 flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-brand" : "bg-mist"}`} />
        ))}
      </div>
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name.replace(/^Dr\.?\s+/i, "").split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mist text-sm font-bold text-navy">{initials}</div>;
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-mist/60 px-3 py-2 text-[11px] text-muted">{children}</p>;
}

export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-navy">{label}</span>
      {children}
      {help && <span className="mt-1 block text-xs text-muted">{help}</span>}
    </label>
  );
}
export const inputClass = "w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-[15px] text-navy outline-none focus:border-brand";

export function BottomNav({ active }: { active: "home" | "providers" | "timeline" | "profile" }) {
  const N = useCopy().nav;
  const item = (key: typeof active, href: string, label: string, icon: string) => (
    <Link href={href} className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${active === key ? "text-brand" : "text-muted"}`}>
      <span className="text-lg leading-none">{icon}</span>{label}
    </Link>
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md items-center justify-around border-t border-line bg-white px-6 py-3">
      {item("profile", "/onboarding", N.profile, "◯")}
      {item("providers", "/providers", N.providers, "⌖")}
      {item("home", "/", N.home, "⌂")}
      {item("timeline", "/timeline", N.timeline, "☰")}
    </nav>
  );
}
