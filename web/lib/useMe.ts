// lib/useMe.ts
// Client hook: loads the signed-up user's plan from /api/me (user id is saved at onboarding).
"use client";
import { useEffect, useState } from "react";

export type Me = {
  today: string;
  user: { user_id: number; display_name: string | null; insurance_plan: string; care_type: string;
    home_lat: number | null; home_lng: number | null; home_zip: string | null; preferred_language: string | null };
  medication: null | {
    label: string; daysLeft: number; supplyEndDate: string; refillDeadline: string; rxNeededBy: string;
    apptBy: string | null; bookApptBy: string | null; renewalReason: "no_refills" | "rx_expires" | "appointment_required" | null;
    status: "green" | "yellow" | "red"; nextAction: string; visitBooked: boolean;
  };
  therapy: null | { nextSessionBy: string; bookBy: string; status: "green" | "yellow" | "red"; nextAction: string; sessionBooked: boolean };
  appointments: { slot_id: number; slot_start: string; duration_min: number; telehealth: boolean; provider_name: string; provider_type: string; specialty: string }[];
};

export function getUserId() {
  try { return localStorage.getItem("continuity_user_id"); } catch { return null; }
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none" | "error">("loading");

  useEffect(() => {
    const id = getUserId();
    if (!id) { setState("none"); return; }
    fetch(`/api/me?userId=${id}`)
      .then((r) => (r.status === 404 ? Promise.resolve(null) : r.ok ? r.json() : Promise.reject()))
      .then((data) => { if (data) { setMe(data); setState("ready"); } else setState("none"); })
      .catch(() => setState("error"));
  }, []);

  return { me, state };
}

export const fmtDay = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export const fmtShort = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const fmtSlot = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
export const isoDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export const providersHref = (plan: string, type: string, before?: string | null) =>
  `/providers?${new URLSearchParams({ plan, type, ...(before ? { before } : {}) })}`;
