import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter, Noto_Sans_Devanagari } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "sonner";

import { PwaRoot } from "@/components/pwa/PwaRoot";
import { TestCopyBanner } from "@/components/security/TestCopyBanner";
import { brandSerif } from "@/lib/fonts";
import { SITE_URL } from "@/lib/site";

// Inter for text; titles use the wordmark's serif (lib/fonts). The font-sans / font-display stacks
// in styles/design-tokens read these variables.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Hindi: Noto Sans Devanagari, Devanagari letters only (Google's unicode-range), fetched only on
// pages that show Hindi. "optional": if it is not there at once (a slow first visit), Hindi shows
// in the phone's own Devanagari font for that page instead of the page being redrawn late; it is
// cached for the next page.
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-devanagari", display: "optional", preload: false });
// Kashmiri and Urdu: Noto Nastaliq Urdu (SIL Open Font License, see
// fonts/NotoNastaliqUrdu-OFL.txt) with every Kashmiri vowel letter and mark
// (ٲ ٳ ۄ ۆ ێ ؠ ٕ ٚ ٛ). Only its Arabic-script part is kept, and unicode-range
// limits it to those letters: English text never uses it, and the file is
// downloaded only on pages that show Kashmiri or Urdu.
const nastaliq = localFont({
  src: "./fonts/NotoNastaliqUrdu-arabic.woff2",
  weight: "400 700",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  variable: "--font-nastaliq",
  declarations: [{ prop: "unicode-range", value: "U+0600-06FF, U+0750-077F, U+0870-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC" }],
});

const DESCRIPTION =
  "KashRoot: live mandi rates, weather, orchard health and pay-after-delivery trade for apple, walnut, saffron and vegetable growers, buyers, sellers and transporters.";
const RECAPTCHA_PRELOAD = !process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY?.trim() && Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim());

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "KashRoot | Orchards, mandi rates & safe agri-trade", template: "%s | KashRoot" },
  description: DESCRIPTION,
  applicationName: "KashRoot",
  keywords: ["mandi rates", "apple price today", "Agmarknet", "orchard", "cold storage", "farmers", "horticulture", "Shopian", "Sopore", "walnut", "saffron", "weather for farmers"],
  openGraph: {
    type: "website",
    siteName: "KashRoot",
    title: "KashRoot — orchards, mandi rates & safe agri-trade",
    description: DESCRIPTION,
    url: "/",
    locale: "en_IN",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "KashRoot" }],
  },
  twitter: { card: "summary", title: "KashRoot", description: DESCRIPTION, images: ["/icons/icon-512.png"] },
  appleWebApp: { capable: true, title: "KashRoot", statusBarStyle: "default" },
  // Google Search Console's HTML-tag check: paste its code into this Vercel variable.
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } : undefined,
};

// Every page looks the same on every phone, like the home page: laid out
// 800px wide (cards side by side, as on a large screen) and shown whole,
// scaled to fit the phone. Pinch-zoom still works. initialScale is cleared
// (null) so the phone may zoom out to fit all 800px.
export const viewport: Viewport = {
  width: 800,
  initialScale: null as unknown as number,
  themeColor: "#047857",
  // The design is light only. Without this, phones with "dark mode for web
  // pages" (Chrome, Samsung Internet, Mi browser) repaint every page dark and
  // greyed out — cards, photos and text all look jumbled.
  colorScheme: "only light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-IN" className={`${nastaliq.variable} ${inter.variable} ${brandSerif.variable} ${devanagari.variable}`}>
      {/* font-sans: Nastaliq first (it covers only the Arabic script), then Inter, then Devanagari. */}
      <body className="bg-[#07120D] font-sans text-[#F5F2EB] antialiased">
        <TestCopyBanner />
        <Providers>{children}</Providers>
        <Toaster position="top-center" theme="light" richColors closeButton toastOptions={{ classNames: { toast: "!rounded-2xl !shadow-[0_12px_40px_rgba(15,23,42,0.16)] !font-sans", title: "!font-semibold" } }} />
        {/* Offline-first: service worker, offline banner, "Waiting to send". */}
        <PwaRoot />
      </body>
      {RECAPTCHA_PRELOAD && <Script id="kashroot-recaptcha" src="https://www.google.com/recaptcha/api.js?render=explicit" strategy="beforeInteractive" />}
    </html>
  );
}