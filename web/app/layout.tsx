import type { Metadata, Viewport } from "next";
import { Manrope, Fraunces } from "next/font/google";
import "./globals.css";

// Brand kit: mockups use DejaVu Sans as a placeholder; Manrope is the recommended substitute.
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
// Headings: Fraunces, a soft serif (with italics for the cozy accents)
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], style: ["normal", "italic"], axes: ["SOFT", "opsz"] });

export const metadata: Metadata = {
  title: "Continuity",
  description: "Your healthcare, handled ahead of time.",
  // Opens full-screen with its own icon after "Add to Home Screen" on iPhone
  appleWebApp: { capable: true, title: "Continuity", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#FBF6EF",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${manrope.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>{children}</body>
    </html>
  );
}
