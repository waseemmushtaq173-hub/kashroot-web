import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "sonner";

import { SITE_URL } from "@/lib/site";

const inter = Inter({ subsets: ["latin"] });

const DESCRIPTION =
  "Live mandi rates, weather, orchard health and escrow-protected trade for apple, walnut, saffron and vegetable growers, buyers, sellers and transporters.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "KashRoot | Orchards, mandi rates & safe agri-trade", template: "%s | KashRoot" },
  description: DESCRIPTION,
  applicationName: "KashRoot",
  keywords: ["mandi rates", "apple price today", "Agmarknet", "orchard", "escrow", "farmers", "horticulture", "Shopian", "Sopore", "walnut", "saffron", "weather for farmers"],
  alternates: { canonical: "/" },
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

export const viewport: Viewport = {
  themeColor: "#047857",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-IN">
      <body className={`${inter.className} bg-[#07120D] text-[#F5F2EB] antialiased`}>
        <Providers>{children}</Providers>
        <Toaster position="top-center" theme="light" richColors closeButton />
      </body>
    </html>
  );
}