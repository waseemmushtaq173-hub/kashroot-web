import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "KashRoot | Premium Agri-Network",
  description: "Escrow-protected agri-trade: live mandi rates, price comparison and verified growers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#07120D] text-[#F5F2EB] antialiased`}>
        <Providers>{children}</Providers>
        <Toaster position="top-center" theme="dark" richColors />
      </body>
    </html>
  );
}