"use client";
// components/ui.tsx
// Shared building blocks, cozy style: cream ground, pastel blocks, plum ink, Fraunces headings,
// pill buttons that look like buttons, and a floating dark nav pill.
import Link from "next/link";
import { useCopy } from "@/lib/i18n";
import type { ReactNode, ButtonHTMLAttributes, CSSProperties } from "react";
import { HomeIcon, CareIcon, TimelineIcon, PersonIcon } from "./icons";

export function Screen({ children, nav = false }: { children: ReactNode; nav?: boolean }) {
  return (
    <main className={`mx-auto min-h-screen w-full max-w-md flex-1 bg-canvas px-6 pt-12 ${nav ? "pb-32" : "pb-10"}`}>
      {children}
    </main>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[13px] font-semibold text-muted ${className}`}>{children}</p>;
}

// Big Fraunces heading. The last word is set in italic ("My *care*") unless the language has no spaces.
export function DisplayTitle({ text, className = "", size = "text-[38px]" }: { text: string; className?: string; size?: string }) {
  const i = text.lastIndexOf(" ");
  return (
    <h1 className={`font-display font-semibold leading-[1.04] tracking-[-0.4px] text-navy ${size} ${className}`}>
      {i > 0 ? <>{text.slice(0, i + 1)}<span className="font-medium italic">{text.slice(i + 1)}</span></> : text}
    </h1>
  );
}

export function Title({ children, sub, center = false }: { children: ReactNode; sub?: ReactNode; center?: boolean }) {
  return (
    <div className={`mb-6 ${center ? "text-center" : ""}`}>
      {typeof children === "string"
        ? <DisplayTitle text={children} size="text-[32px]" />
        : <h1 className="font-display text-[32px] font-semibold leading-tight text-navy">{children}</h1>}
      {sub && <p className={`mt-2 text-[15px] leading-relaxed text-muted ${center ? "mx-auto max-w-[280px]" : ""}`}>{sub}</p>}
    </div>
  );
}

// Section heading (Fraunces) with an optional button on the right
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-display text-[24px] font-semibold text-navy">{children}</h2>
      {action}
    </div>
  );
}

// Pastel blocks. Urgency uses mint (on track), butter (soon), rose (urgent).
export type Tone = "white" | "butter" | "blush" | "rose" | "lavender" | "mint" | "peach" | "attn";
export const toneBg: Record<Tone, string> = {
  white: "bg-white", butter: "bg-butter", blush: "bg-blush", rose: "bg-rose",
  lavender: "bg-lavender", mint: "bg-mint", peach: "bg-peach", attn: "bg-butter",
};
export const statusTone = (status: string): Tone => (status === "red" ? "rose" : status === "yellow" ? "butter" : "mint");

export function Card({ children, tone = "white", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <section className={`rounded-[30px] p-5 ${toneBg[tone]} ${className}`}>{children}</section>;
}

// Buttons: filled ink for the main action, outlined for the rest, so every action reads as a button.
export const inkBtn = "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-navy px-5 text-[15px] font-bold text-white transition hover:brightness-110 disabled:opacity-60";
export const outlineBtn = "inline-flex h-11 items-center justify-center gap-2 rounded-full border-[1.5px] border-navy bg-white px-5 text-[15px] font-bold text-navy transition hover:bg-mist disabled:opacity-60";
export const smallInkBtn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-navy px-3.5 text-[13px] font-bold text-white transition hover:brightness-110 disabled:opacity-60";
export const smallOutlineBtn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-navy bg-white px-3.5 text-[13px] font-bold text-navy transition hover:bg-mist disabled:opacity-60";
export const quietBtn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-white/70 px-3.5 text-[13px] font-semibold text-muted transition hover:bg-white disabled:opacity-60";
export const roundBtn = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-navy bg-white text-navy transition hover:bg-mist";

const btnBase = "flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold transition disabled:opacity-60";
const btnKind = {
  primary: "bg-navy text-white hover:brightness-110",
  secondary: "border-[1.5px] border-navy bg-white text-navy hover:bg-mist",
  attn: "bg-rose text-navy hover:brightness-95",
};
export function Button({ kind = "primary", className = "", ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { kind?: keyof typeof btnKind }) {
  return <button {...props} className={`${btnBase} ${btnKind[kind]} ${className}`} />;
}
export function ButtonLink({ href, kind = "primary", className = "", children }:
  { href: string; kind?: keyof typeof btnKind; className?: string; children: ReactNode }) {
  return <Link href={href} className={`${btnBase} ${btnKind[kind]} ${className}`}>{children}</Link>;
}

type PillTone = "mint" | "attn" | "coral" | "mist" | "slate" | "ink";
const pillTone: Record<PillTone, string> = {
  mint: "bg-mint text-forest",
  attn: "bg-butter text-attn-text",
  coral: "bg-rose text-navy",
  mist: "bg-mist text-navy",
  slate: "bg-line text-muted",
  ink: "bg-navy text-white",
};
export function Pill({ children, tone = "mist" }: { children: ReactNode; tone?: PillTone }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${pillTone[tone]}`}>{children}</span>;
}

export function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-6">
      <Eyebrow>Step {step} of {total}</Eyebrow>
      <div className="mt-2 flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={`h-2 flex-1 rounded-full ${i < step ? "bg-navy" : "bg-lavender"}`} />
        ))}
      </div>
    </div>
  );
}

const AVATAR_TONES = ["bg-lavender", "bg-mint", "bg-blush", "bg-butter", "bg-peach"];
// Therapy and psychiatry each have their own color everywhere (lavender / peach)
export const roleTone = (role?: string | null) => (role === "therapist" ? "bg-lavender" : role === "psychiatrist" ? "bg-peach" : undefined);
export function Avatar({ name, size = 46, role }: { name: string; size?: number; role?: string | null }) {
  const initials = name.replace(/^Dr\.?\s+/i, "").split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const tone = roleTone(role) ?? AVATAR_TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <div style={{ width: size, height: size }} className={`flex shrink-0 items-center justify-center rounded-full font-display text-[17px] font-bold text-navy ${tone}`}>
      {initials || "?"}
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-mist px-4 py-3 text-[12px] leading-relaxed text-muted">{children}</p>;
}

export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-navy">{label}</span>
      {children}
      {help && <span className="mt-1 block text-xs text-muted">{help}</span>}
    </label>
  );
}
export const inputClass = "w-full rounded-2xl border border-line bg-white px-4 py-3 text-[15px] text-navy outline-none focus:border-navy";

// A soft scalloped badge (the "flower" shape) with content centered on it
const SCALLOP = (() => {
  const n = 96, bumps = 12, depth = 0.12, pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (2 * Math.PI * i) / n;
    const r = 50 * (1 - depth / 2 + (depth / 2) * Math.cos(bumps * a));
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(" L")}Z`;
})();
const scallopFill: Record<string, string> = {
  white: "#FFFFFF", butter: "#F7E08A", blush: "#F5C3D5", rose: "#F3A9C2", lavender: "#D6CEF6", mint: "#CFEBDB", peach: "#F9D6BF",
};
export function Scallop({ size, tone = "white", children, className = "" }: { size: number; tone?: keyof typeof scallopFill; children?: ReactNode; className?: string }) {
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className="absolute inset-0"><path d={SCALLOP} fill={scallopFill[tone]} /></svg>
      <div className="relative flex h-full w-full flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

// The mascot peeking out from a card's top-right corner, holding the edge. Wrap the card in this.
function Paw({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg width="30" height="22" viewBox="0 0 30 22" aria-hidden className={`absolute z-[2] ${className ?? ""}`} style={style}>
      <path d="M3 21 V10 C3 4.5 7.5 1.5 15 1.5 C22.5 1.5 27 4.5 27 10 V21 Z" fill="#D6C7FD" stroke="#9C80EC" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M11 3.5 V10 M19 3.5 V10" stroke="#9C80EC" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
export function MascotPeek({ children }: { children: ReactNode }) {
  return (
    <div className="relative mt-14">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mascot-peek.png" alt="" className="pointer-events-none absolute z-0 h-[91px] w-[140px] object-contain"
        style={{ right: -6, top: -84, transform: "rotate(10deg)", transformOrigin: "70% 100%" }} />
      <Paw style={{ top: -11, right: 114, transform: "rotate(-12deg)" }} />
      <Paw style={{ top: 22, right: -12, transform: "rotate(90deg)" }} />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

export function BottomNav({ active }: { active: "home" | "care" | "providers" | "timeline" | "profile" }) {
  const N = useCopy().nav;
  const item = (key: typeof active, href: string, label: string, Icon: typeof HomeIcon) => (
    <Link href={href} aria-label={label} aria-current={active === key ? "page" : undefined}
      className={`flex h-[52px] w-[52px] items-center justify-center rounded-full transition ${active === key ? "bg-canvas text-navy" : "text-[#F3EEF7] hover:bg-white/10"}`}>
      <Icon size={22} strokeWidth={active === key ? 2.2 : 1.8} />
    </Link>
  );
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-[max(env(safe-area-inset-bottom),1.25rem)] z-20 mx-auto flex h-[68px] w-[calc(100%-3rem)] max-w-[22rem] items-center justify-around rounded-full bg-navy px-2.5 shadow-[0_12px_30px_rgba(42,36,56,0.22)]">
      {item("home", "/", N.home, HomeIcon)}
      {item("care", "/care", N.care, CareIcon)}
      {item("timeline", "/timeline", N.timeline, TimelineIcon)}
      {item("profile", "/profile", N.profile, PersonIcon)}
    </nav>
  );
}

// Switch between the Timeline (deadlines) and Calendar (your week) views
export function TimelineTabs({ active }: { active: "timeline" | "calendar" }) {
  const C = useCopy();
  const tab = (key: "timeline" | "calendar", href: string, label: string) => (
    <Link href={href} aria-current={active === key ? "page" : undefined}
      className={`flex h-11 flex-1 items-center justify-center rounded-full text-[15px] font-bold ${active === key ? "bg-navy text-white" : "text-navy"}`}>
      {label}
    </Link>
  );
  return (
    <div className="mb-5 flex rounded-full bg-white p-1">
      {tab("timeline", "/timeline", C.nav.timeline)}
      {tab("calendar", "/schedule", C.nav.calendar)}
    </div>
  );
}
