// lib/findLinks.ts: search links for outside directories, already filtered by insurance, type and location.
// URL formats were checked against each site's own filter links (Nov 2026). Plans a site doesn't list
// fall back to the unfiltered search, so a link never points at a page that doesn't exist.

type Kind = "psychiatrist" | "therapist";

// Psychology Today: /us/{psychiatrists|therapists}/{zip}?category={slug}
const PT: Record<string, string> = {
  "Aetna Student Health": "aetna",
  "Blue Cross Blue Shield": "bluecross-and-blueshield",
  UnitedHealthcare: "unitedhealthcare",
  Cigna: "cigna",
  Medicaid: "medicaid",
};

// Zocdoc (Atlanta): /{psychiatrists|psychotherapists}/atlanta-218712pm/{plan-id}
const ZOCDOC: Record<string, string> = {
  "Aetna Student Health": "aetna-300m",
  "Blue Cross Blue Shield": "blue-cross-blue-shield-304m",
  Cigna: "cigna-307m",
  UnitedHealthcare: "unitedhealthcare-323m",
};

// Grow Therapy (Georgia): /therapists/ga/insurance/{slug}
const GROW: Record<string, string> = {
  "Aetna Student Health": "aetna",
  Cigna: "cigna",
};

export function findLinks(opts: { plan?: string | null; kind: Kind; zip?: string | null }) {
  const zip = opts.zip && /^\d{5}$/.test(opts.zip) ? opts.zip : "30322";
  const plan = opts.plan ?? "";
  const ptKind = opts.kind === "psychiatrist" ? "psychiatrists" : "therapists";
  const zdKind = opts.kind === "psychiatrist" ? "psychiatrists" : "psychotherapists";
  return {
    psychologytoday: `https://www.psychologytoday.com/us/${ptKind}/${zip}${PT[plan] ? `?category=${PT[plan]}` : ""}`,
    zocdoc: `https://www.zocdoc.com/${zdKind}/atlanta-218712pm${ZOCDOC[plan] ? `/${ZOCDOC[plan]}` : ""}`,
    grow: GROW[plan] ? `https://growtherapy.com/therapists/ga/insurance/${GROW[plan]}` : "https://growtherapy.com/therapists/georgia",
    therapyden: "https://www.therapyden.com/",
    // Which links actually carry the plan (to show a small note)
    filtered: { psychologytoday: !!PT[plan], zocdoc: !!ZOCDOC[plan], grow: !!GROW[plan], therapyden: false },
  };
}
