// Booking page reads the slot id from the URL, which only exists at request time.
// Suspense lets Next prerender the shell and stream the page in.
import { Suspense } from "react";

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
