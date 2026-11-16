// lib/useMe.ts
// Client hook: loads the signed-in user's plan from /api/me (the session cookie says who it is).
"use client";
import { useEffect, useState } from "react";

export type MedTimeline = {
  medicationId: number; label: string; reminderTime: string | null;
  refillsRemaining: number; rxExpiresOn: string | null; requiresAppointmentForRenewal: boolean; bookingLeadDays: number;
  daysLeft: number; supplyEndDate: string; refillDeadline: string; rxNeededBy: string;
  apptBy: string | null; bookApptBy: string | null; renewalReason: "no_refills" | "rx_expires" | "appointment_required" | null;
  status: "green" | "yellow" | "red"; nextAction: string; visitBooked: boolean;
};

export type CareMember = {
  member_id: number; provider_name: string | null; source_site: string | null; role: string;
  phone: string | null; booking_url: string | null; video: boolean; notes: string | null;
};

export type Me = {
  today: string;
  needsOnboarding: boolean;
  user: { user_id: number; display_name: string | null; email: string | null; insurance_plan: string; care_type: string;
    home_lat: number | null; home_lng: number | null; home_zip: string | null; preferred_language: string | null };
  medication: MedTimeline | null; // the one that runs out first
  medications: MedTimeline[];
  therapy: null | { nextSessionBy: string; bookBy: string; status: "green" | "yellow" | "red"; nextAction: string; sessionBooked: boolean };
  appointments: { slot_id: number | null; visit_id?: number; slot_start: string; duration_min: number; telehealth: boolean;
    provider_name: string; provider_type: string; specialty: string | null; recurring?: boolean; source?: "continuity" | "care_team" }[];
  careTeam: CareMember[];
};

// Kept for older screens that only check "is someone signed in on this device?". The server uses the session cookie.
export function getUserId() {
  try { return localStorage.getItem("continuity_user_id"); } catch { return null; }
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none" | "error">("loading");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.status === 401 || r.status === 404 ? Promise.resolve(null) : r.ok ? r.json() : Promise.reject()))
      .then((data: Me | null) => {
        try {
          if (data) localStorage.setItem("continuity_user_id", String(data.user.user_id));
          else localStorage.removeItem("continuity_user_id");
        } catch { /* private mode */ }
        if (data) { setMe(data); setState("ready"); } else { setMe(null); setState("none"); }
      })
      .catch(() => setState("error"));
  }, [version]);

  // Call after saving something to load the plan again
  const reload = () => setVersion((v) => v + 1);
  return { me, state, reload };
}

export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  try { localStorage.removeItem("continuity_user_id"); } catch { /* private mode */ }
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
