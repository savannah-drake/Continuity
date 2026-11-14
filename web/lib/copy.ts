// lib/copy.ts
// IVY OWNS THIS FILE: every word users see lives here.
// Change any text between quotes. Don't rename the keys on the left (the code uses them).

// Insurance plans: must match the plan names in Ivy's provider sheet EXACTLY.
export const PLANS = [
  "Aetna Student Health",
  "Blue Cross Blue Shield",
  "Kaiser Permanente",
  "UnitedHealthcare",
  "Cigna",
  "Medicaid",
];

export const COPY = {
  appName: "Continuity",
  tagline: "Healthcare that stays ahead of you.",

  onboarding: {
    title: "Let's get you ahead of your care",
    subtitle: "A few details and we'll map out what needs to happen, and when.",
    nameLabel: "What should we call you?",
    phoneLabel: "Your iPhone number",
    phoneHelp: "We use this for FaceTime with Continuity. Nothing else.",
    planLabel: "Insurance plan",
    planHelp: "Just the plan name. We never ask for your member ID.",
    careTypeLabel: "What care are you keeping up with?",
    careTypes: { psychiatry: "Medication + psychiatrist", therapy: "Therapy", both: "Both" },
    medSection: "Your medication",
    medLabel: "What should we call it?",
    medHelp: "A nickname is fine (like \"morning med\"). We keep it private.",
    daysLeftLabel: "About how many days do you have left?",
    refillsLabel: "Refills remaining",
    expiresLabel: "Prescription expires (if you know)",
    needsApptLabel: "My prescriber needs to see me before renewing",
    leadLabel: "How far out does your prescriber usually book? (days)",
    therapySection: "Your therapy",
    lastSessionLabel: "Date of your last session",
    cadenceLabel: "How often do you meet?",
    cadences: { 7: "Weekly", 14: "Every 2 weeks", 30: "Monthly" } as Record<number, string>,
    submit: "Show me my plan",
    saving: "Mapping it out…",
    error: "Something went wrong saving your info. Try again?",
  },

  timeline: {
    title: "Here's your plan",
    supplyEnd: "Medication runs out",
    refillDeadline: "Refill in hand by",
    rxNeededBy: "Pharmacy needs the prescription by",
    apptBy: "Appointment needs to happen by",
    bookApptBy: "Book your appointment by",
    nextSessionBy: "Next therapy session by",
    bookSessionBy: "Book it by",
  },
  results: {
    title: "Openings that work for you",
    subtitle: (plan: string, before: string) =>
      `In-network with ${plan || "your plan"}${before ? `, open before ${before}` : ""}. Soonest first.`,
    demoNotice: "Demo availability: insurance acceptance and open times are simulated for this prototype.",
    inNetwork: "In-network",
    telehealth: "Video visits",
    videoShort: "video",
    milesAway: "mi away",
    loading: "Finding openings…",
    empty: "No in-network openings before your deadline yet. Try video visits or a later date, and we'll keep looking.",
    error: "We couldn't load providers. Try again?",
    findAppointment: "Find an appointment",
    findTherapist: "Find a therapy session",
  },
  // Engine action codes -> words
  actions: {
    book_today: "Your next appointment isn't booked yet. Let's find a time today.",
    book_appointment: "You've got time, but your appointment needs booking soon.",
    request_refill: "Time to request your refill.",
    all_set: "You're all set for now.",
  },

  status: { green: "On track", yellow: "Coming up", red: "Needs attention" },

  renewalReasons: {
    no_refills: "You have no refills left, so you'll need a renewal.",
    rx_expires: "Your prescription expires before your next fill.",
    appointment_required: "Your prescriber needs to see you before renewing.",
  },
};