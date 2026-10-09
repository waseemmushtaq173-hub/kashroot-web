import React from "react";
import Link from "next/link";
import { ShieldCheck, TrendingUp, PackageSearch, ArrowUpRight } from "lucide-react";

/**
 * MainTools — the homepage's feature row.
 *
 * EXACTLY three interactive tools live here by design:
 *   1. Escrow Protected Trade
 *   2. Live Mandi Rates
 *   3. Price Comparison Engine
 *
 * Portal access (Farmer / Buyer / Kissan / etc.) is deliberately NOT here —
 * it lives in the header's glassmorphic Portal Selector menu.
 */
const TOOLS = [
  {
    title: "Escrow Protected Trade",
    desc: "Funds held in escrow and released only after consignment quality is verified at destination.",
    href: "/escrow",
    icon: ShieldCheck,
    accent: "#4ADE80",
    ring: "hover:border-[#4ADE80]/60",
    glow: "group-hover:shadow-[0_18px_45px_-15px_rgba(74,222,128,0.55)]",
    iconBg: "bg-[#4ADE80]/15 border-[#4ADE80]/40",
    cta: "Open Escrow",
  },
  {
    title: "Live Mandi Rates",
    desc: "Real-time arrivals and daily rates from Sopore, Shopian, Narwal and Azadpur mandis.",
    href: "/mandi-weather",
    icon: TrendingUp,
    accent: "#F4C77B",
    ring: "hover:border-[#F4C77B]/60",
    glow: "group-hover:shadow-[0_18px_45px_-15px_rgba(244,199,123,0.55)]",
    iconBg: "bg-[#F4C77B]/15 border-[#F4C77B]/40",
    cta: "View Rates",
  },
  {
    title: "Price Comparison Engine",
    desc: "Compare inputs, freight and pack material pricing across verified suppliers side by side.",
    href: "/compare-prices",
    icon: PackageSearch,
    accent: "#7DD3FC",
    ring: "hover:border-[#7DD3FC]/60",
    glow: "group-hover:shadow-[0_18px_45px_-15px_rgba(125,211,252,0.55)]",
    iconBg: "bg-[#7DD3FC]/15 border-[#7DD3FC]/40",
    cta: "Compare Prices",
  },
];

export function MainTools() {
  return (
    <section className="relative py-20 md:py-28">
      <div className="container mx-auto px-6 md:px-12 max-w-7xl relative z-10">
        <div className="max-w-3xl mb-12 md:mb-16">
          <p className="text-emerald-700 tracking-[0.3em] text-xs uppercase font-serif font-bold mb-4">
            Three tools. One network.
          </p>
          <h2 className="font-serif text-4xl md:text-5xl font-black text-slate-900 leading-tight">
            Trade with confidence.
          </h2>
          <p className="mt-4 text-lg text-slate-600 max-w-2xl">
            The essentials of Kashmiri agri-trade, engineered into three focused instruments.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TOOLS.map((tool) => (
            <Link
              key={tool.title}
              href={tool.href}
              className={`group relative flex flex-col p-7 md:p-8 rounded-3xl bg-white/75 backdrop-blur-md border border-white shadow-lg ${tool.ring} ${tool.glow} transition-all duration-300 hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4C77B] focus-visible:ring-offset-2 focus-visible:ring-offset-white`}
            >
              <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center mb-6 ${tool.iconBg}`}>
                <tool.icon className="w-7 h-7" style={{ color: tool.accent }} />
              </div>

              <h3 className="font-serif text-2xl font-bold text-slate-900 mb-3 leading-snug">
                {tool.title}
              </h3>
              <p className="text-sm md:text-base text-slate-600 leading-relaxed mb-7 flex-1">
                {tool.desc}
              </p>

              <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: tool.accent }}>
                {tool.cta}
                <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
