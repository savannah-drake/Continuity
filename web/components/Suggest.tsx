// components/Suggest.tsx: a text input that suggests as you type (Typesense via /api/suggest).
// Arrow keys + Enter or tap to pick; anything typed is still allowed (the list only helps).
"use client";
import { useEffect, useRef, useState } from "react";
import { inputClass } from "@/components/ui";

type Item = { id: string; label: string; detail: string };

export function SuggestInput({ value, onChange, placeholder, label }:
  { value: string; onChange: (v: string) => void; placeholder?: string; label: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const picked = useRef(false);

  useEffect(() => {
    if (picked.current) { picked.current = false; return; }
    const word = value.trim().split(/\s+/)[0] ?? "";
    if (word.length < 2) { setItems([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(word)}`, { signal: ctrl.signal })
        .then((r) => r.json()).then((d) => { setItems(d.suggestions ?? []); setActive(-1); setOpen(true); })
        .catch(() => {});
    }, 150);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [value]);

  function pick(i: Item) {
    // Keep a dose they already typed after the name ("zolof 50 mg" -> "Sertraline 50 mg")
    const rest = value.trim().split(/\s+/).slice(1).join(" ");
    picked.current = true;
    onChange(rest ? `${i.label} ${rest}` : `${i.label} `);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input className={inputClass} value={value} placeholder={placeholder} aria-label={label} autoComplete="off"
        role="combobox" aria-expanded={open && items.length > 0} aria-autocomplete="list"
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(items[active]); }
          if (e.key === "Escape") setOpen(false);
        }} />
      {open && items.length > 0 && (
        <ul role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white shadow-lg">
          {items.map((i, n) => (
            <li key={i.id} role="option" aria-selected={n === active}
              onMouseDown={(e) => { e.preventDefault(); pick(i); }}
              className={`cursor-pointer px-4 py-2 text-sm ${n === active ? "bg-mist" : ""}`}>
              <span className="font-bold text-navy">{i.label}</span>
              <span className="block text-xs text-muted">{i.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
