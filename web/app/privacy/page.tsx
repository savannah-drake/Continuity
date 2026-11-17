// app/privacy/page.tsx: Privacy Policy. Google's OAuth review reads this page; keep it accurate to what the code does.
import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/legal";

export const metadata = { title: "Privacy Policy · Continuity" };

const h2 = "mt-8 mb-2 text-[17px] font-bold text-navy";
const p = "mb-3 text-[15px] leading-relaxed text-navy";
const li = "mb-1.5 text-[15px] leading-relaxed text-navy";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/" className="text-sm font-semibold text-brand">Continuity</Link>
      <h1 className="mt-4 text-[28px] font-bold text-navy">Privacy Policy</h1>
      <p className="mb-6 text-sm text-muted">Last updated {LEGAL_UPDATED}</p>

      <p className={p}>Continuity helps students keep mental-health care on track: when a medication will run out, when to book a visit, and reminders to do it. This page explains what we collect, why, and the choices you have. Continuity is not a healthcare provider, does not give medical advice, and is not an emergency service. If you are in crisis, call or text 988 in the US.</p>

      <h2 className={h2}>What we collect</h2>
      <ul className="list-disc pl-5">
        <li className={li}><b>Your Google account basics:</b> your name and email address, when you sign in with Google.</li>
        <li className={li}><b>What you enter:</b> medication names, days of supply, refills, prescription dates, reminder times, your insurance plan name (never member IDs or card numbers), your ZIP code, preferred language, pharmacies, the people on your care team (names, phone numbers, booking links), visits you add, and an optional trusted person&apos;s name and email.</li>
        <li className={li}><b>Google Calendar, only if you connect it:</b> the busy/free times on your primary calendar, so suggestions fit your schedule. If you turn on &quot;Add visits from booking confirmations&quot;, we read upcoming event titles and times to recognize therapy and psychiatry visits. We save only the visit&apos;s time, length and who it&apos;s with, never the event&apos;s title, description or other details.</li>
        <li className={li}><b>Notifications:</b> if you turn them on, the push address your browser gives us for this device.</li>
        <li className={li}><b>Voice calls:</b> when you talk to Continuity in the app, the conversation is processed live to answer you. We keep only the call&apos;s time, length and outcome, not a recording or transcript.</li>
      </ul>

      <h2 className={h2}>How we use it</h2>
      <ul className="list-disc pl-5">
        <li className={li}>To calculate your refill and visit timeline and show it to you.</li>
        <li className={li}>To send the reminders you turn on: push notifications, email, and events Continuity adds to your Google Calendar (a daily medication reminder, a booking deadline, and visits you save). Calendar events and notifications never include medication names.</li>
        <li className={li}>To email your trusted person, only if you add one, only if you have run out of a medication and haven&apos;t booked a visit for a day, and without any medication names or health details.</li>
      </ul>
      <p className={p}>We do not sell your data, use it for advertising, or share it with data brokers. We do not use it to train AI models.</p>

      <h2 className={h2}>Google user data</h2>
      <p className={p}>Continuity&apos;s use and transfer of information received from Google APIs adheres to the <a className="text-brand underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. We use Google Calendar data only to provide the features above, people do not read it unless you ask us for help with a problem, and we do not transfer it to anyone except as needed to run the service, to comply with law, or with your permission.</p>

      <h2 className={h2}>Who processes data for us</h2>
      <p className={p}>We use service providers to run Continuity: Vercel (hosting), Tiger Data (database), Google (sign-in and Calendar), LiveKit and Google Gemini (live voice calls), Resend (email) and your browser&apos;s push service (notifications). They process data only to provide their service to us.</p>

      <h2 className={h2}>Security</h2>
      <p className={p}>Data is sent over encrypted connections. Google sign-in tokens are stored encrypted. Sessions use signed, HTTP-only cookies. No system is perfectly secure, so please don&apos;t enter anything you aren&apos;t comfortable storing, such as insurance member IDs.</p>

      <h2 className={h2}>Your choices</h2>
      <ul className="list-disc pl-5">
        <li className={li}>Edit or remove medications, pharmacies, people and visits at any time in My care.</li>
        <li className={li}>Turn off notifications, email alerts or calendar import in Profile, and disconnect Google Calendar there.</li>
        <li className={li}><b>Delete your account</b> in Profile → Delete my account. This deletes everything Continuity stored about you and revokes its access to your Google account. Events already added to your Google Calendar stay there until you delete them.</li>
        <li className={li}>You can also remove Continuity&apos;s access at any time from your Google Account → Security → Third-party connections.</li>
      </ul>

      <h2 className={h2}>Age</h2>
      <p className={p}>Continuity is meant for people 18 and older.</p>

      <h2 className={h2}>Changes and contact</h2>
      <p className={p}>If we change this policy, we&apos;ll update the date above. Questions or requests: <a className="text-brand underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </main>
  );
}
