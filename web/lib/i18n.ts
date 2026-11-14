// lib/i18n.ts: current language (English / Español), saved in the browser and on the user's profile.
"use client";
import { useSyncExternalStore } from "react";
import { copyFor, type Lang } from "./copy";

const KEY = "continuity_lang";
const EVENT = "continuity-lang";

function read(): Lang {
  try { return localStorage.getItem(KEY) === "es" ? "es" : "en"; } catch { return "en"; }
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
}

export function setLang(lang: Lang) {
  try { localStorage.setItem(KEY, lang); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, read, () => "en");
}

// All on-screen words for the current language
export function useCopy() {
  return copyFor(useLang());
}
