import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "./providers";

/*
 * The three faces the design system in src/styles/globals.css is written
 * against: Fraunces for headings, Inter for body, JetBrains Mono for figures.
 *
 * Each is loaded with `variable` rather than `className`, so the stack lands on
 * <html> below and every element can reach it. The variable is not just a
 * convenience — it carries next/font's metric-matched fallback alongside the
 * real family:
 *
 *     --font-fraunces: "Fraunces", "Fraunces Fallback"
 *
 * That "…Fallback" face is a local font with adjusted ascent/descent metrics,
 * so while the woff2 downloads the text lays out at very nearly its final size.
 * Naming the family literally would skip it and reintroduce the layout shift
 * next/font exists to remove.
 *
 * This is also the bug this file was carrying: globals.css has always asked for
 * 'Fraunces', but this file only ever loaded Geist, so no Fraunces @font-face
 * was emitted anywhere and the headings quietly rendered in Georgia.
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KashRoot",
  description:
    "Trade produce direct from verified Kashmiri growers, and source the packaging, machinery and inputs to get it to market.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><Providers>{children}</Providers></body>
    </html>
  );
}
