// app/help/page.tsx: "Get support now". Tap to call or text 988 and other vetted lines.
// Describe what's going on (optional) and Typesense finds the best-fit help by meaning, in English or Spanish.
// Nothing typed here is saved. We can't connect calls ourselves; buttons open the phone's dialer or messages.
"use client";
import { useEffect, useState } from "react";
import { useCopy, useLang } from "@/lib/i18n";
import { Screen, Card, BottomNav, Notice } from "@/components/ui";

type Resource = {
  id: string; name: string; name_es: string; description: string; description_es: string; how: string; how_es: string;
  call?: string; text_to?: string; text_body?: string; web?: string; available_24_7: boolean;
};

const smsHref = (to: string, body?: string) => `sms:${to}${body ? `?&body=${encodeURIComponent(body)}` : ""}`;

export default function HelpPage() {
  const C = useCopy();
  const H = C.help;
  const lang = useLang();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [list, setList] = useState<Resource[] | null>(null);

  useEffect(() => { const t = setTimeout(() => setQ(input.trim()), 350); return () => clearTimeout(t); }, [input]);
  useEffect(() => {
    fetch(`/api/support?${new URLSearchParams({ q, lang, student: "1", limit: "6" })}`)
      .then((r) => r.json()).then((d) => setList(d.resources ?? [])).catch(() => setList([]));
  }, [q, lang]);

  return (
    <Screen nav>
      <h1 className="text-[26px] font-bold text-navy">{H.title}</h1>
      <p className="mb-4 text-sm text-muted">{H.sub}</p>

      <div className="mb-3 flex gap-2">
        <a href="tel:988" className="flex-1 rounded-full bg-navy py-3 text-center text-[15px] font-bold text-white">{H.call988}</a>
        <a href={lang === "es" ? smsHref("988", "AYUDA") : smsHref("988")}
          className="flex-1 rounded-full border-2 border-navy py-3 text-center text-[15px] font-bold text-navy">{H.text988}</a>
      </div>
      <p className="mb-2 text-center text-sm font-bold text-coral"><a href="tel:911">{H.emergency}</a></p>
      <p className="mb-5 text-center text-xs text-muted">{H.interpreter}</p>

      <label className="mb-1 block text-sm font-bold text-navy" htmlFor="need">{H.ask}</label>
      <textarea id="need" rows={2} value={input} onChange={(e) => setInput(e.target.value)} placeholder={H.askPlaceholder}
        className="mb-1 w-full rounded-2xl border border-line bg-white p-3 text-sm text-navy placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand" />
      <p className="mb-4 text-xs text-muted">{H.privacy}</p>

      <div className="space-y-3">
        {list?.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-navy">{lang === "es" ? r.name_es : r.name}</p>
              {r.available_24_7 && <span className="rounded-full bg-mint px-2 py-0.5 text-[11px] font-bold text-forest">{H.allDay}</span>}
            </div>
            <p className="mt-1 text-sm text-muted">{lang === "es" ? r.description_es : r.description}</p>
            <p className="mt-1 text-sm font-semibold text-navy">{lang === "es" ? r.how_es : r.how}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {r.call && <a href={`tel:${r.call}`} className="rounded-full bg-brand px-4 py-1.5 text-sm font-bold text-white">{H.call}</a>}
              {r.text_to && <a href={smsHref(r.text_to, r.id === "988" && lang === "es" ? "AYUDA" : r.text_body)} className="rounded-full border-2 border-brand px-4 py-1.5 text-sm font-bold text-brand">{H.text}</a>}
              {r.web && <a href={r.web} target="_blank" rel="noreferrer" className="rounded-full px-2 py-1.5 text-sm font-semibold text-brand underline">{H.website}</a>}
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-4"><Notice>{C.aiDisclosure}</Notice></div>
      <BottomNav active="home" />
    </Screen>
  );
}
