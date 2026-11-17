// app/terms/page.tsx: Terms of Service.
import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/legal";

export const metadata = { title: "Terms of Service · Continuity" };

const h2 = "mt-8 mb-2 text-[17px] font-bold text-navy";
const p = "mb-3 text-[15px] leading-relaxed text-navy";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/" className="text-sm font-semibold text-brand">Continuity</Link>
      <h1 className="mt-4 text-[28px] font-bold text-navy">Terms of Service</h1>
      <p className="mb-6 text-sm text-muted">Last updated {LEGAL_UPDATED}</p>

      <p className={p}>By using Continuity you agree to these terms. If you don&apos;t agree, please don&apos;t use it.</p>

      <h2 className={h2}>What Continuity is</h2>
      <p className={p}>Continuity is a planning and reminder tool. It estimates when a medication may run out and when to book a visit, based on what you enter. It is not a healthcare provider, pharmacy or emergency service, and it does not give medical advice. Dates are estimates: your prescriber, pharmacy and insurance decide what actually happens. Always follow your prescriber&apos;s instructions.</p>
      <p className={p}><b>In an emergency, call 911. For a mental-health crisis in the US, call or text 988.</b></p>

      <h2 className={h2}>Your account</h2>
      <p className={p}>You need to be 18 or older. Keep your Google account secure, and enter information that is accurate as far as you know. You can delete your account at any time in Profile.</p>

      <h2 className={h2}>Acceptable use</h2>
      <p className={p}>Don&apos;t misuse Continuity: no attempts to access other people&apos;s data, disrupt the service, or use it for anything unlawful. Only add a trusted person who has agreed to hear from us.</p>

      <h2 className={h2}>Third-party services</h2>
      <p className={p}>Continuity links to and works with services we don&apos;t control, such as Google Calendar, Zocdoc, Grow Therapy, Psychology Today and TherapyDen. Their own terms apply when you use them. Continuity doesn&apos;t book appointments on your behalf.</p>

      <h2 className={h2}>No warranty; limits</h2>
      <p className={p}>Continuity is provided as is, without warranties. Reminders can be late or fail to arrive (for example, if notifications are off or a service is down), so don&apos;t rely on Continuity as your only reminder. To the extent the law allows, we aren&apos;t liable for indirect or consequential losses, including missed doses or appointments.</p>

      <h2 className={h2}>Changes</h2>
      <p className={p}>We may update these terms and will change the date above when we do. Continuing to use Continuity means you accept the update.</p>

      <h2 className={h2}>Contact</h2>
      <p className={p}><a className="text-brand underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> · See also our <Link href="/privacy" className="text-brand underline">Privacy Policy</Link>.</p>
    </main>
  );
}
