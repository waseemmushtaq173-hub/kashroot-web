import React from "react";
import Link from "next/link";
import { Bell, Globe, Moon, Home, Settings, LayoutDashboard, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KPI {
  label: string;
  value: string;
  trend?: string;
}

export interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  active?: boolean;
}

export interface PortalShellProps {
  title: string;
  description: string;
  theme: string;
  kpis?: KPI[];
  navItems?: NavItem[];
  bgImage?: string;
  children: React.ReactNode;
}

export function PortalShell({ 
  title, 
  description, 
  theme, 
  kpis = [], 
  navItems = [],
  bgImage = "https://images.unsplash.com/photo-1715457573748-8e8a70b2c1be?auto=format&fit=crop&w=2400&q=80",
  children 
}: PortalShellProps) {
  return (
    <div className="min-h-screen flex bg-[var(--surface-base)] text-white" data-theme={theme}>
      {/* Blurred Background Overlay */}
      <div 
        className="fixed inset-0 z-0 opacity-10 bg-cover bg-center blur-3xl saturate-150"
        style={{ backgroundImage: `url(${bgImage})` }}
      />

      {/* Desktop Left Rail */}
      <aside className="hidden md:flex flex-col w-24 border-r border-white/10 bg-black/40 backdrop-blur-xl relative z-20 items-center py-6 gap-8">
        <Link href="/" className="w-12 h-12 rounded-xl bg-gradient-to-br from-white/10 to-transparent flex items-center justify-center border border-white/20">
          <Globe className="w-6 h-6 text-[#D4AF37]" />
        </Link>
        <nav className="flex flex-col gap-4">
          {navItems.map((item, i) => (
            <Link 
              key={i} 
              href={item.href}
              className={cn(
                "w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-300",
                item.active 
                  ? "bg-[var(--primary)] shadow-[0_0_20px_var(--primary)] text-white" 
                  : "text-white/50 hover:bg-white/10 hover:text-white"
              )}
            >
              <item.icon className="w-6 h-6" />
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col relative z-10 w-full overflow-x-hidden">
        {/* Top Bar */}
        <header className="h-16 border-b border-white/10 bg-black/20 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-40">
          <div className="font-serif font-bold tracking-widest text-[var(--primary)] uppercase text-sm">
            {theme} Portal
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors"><Globe className="w-5 h-5 text-white/70" /></button>
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors"><Moon className="w-5 h-5 text-white/70" /></button>
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors relative">
              <Bell className="w-5 h-5 text-white/70" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
          </div>
        </header>

        {/* Hero Banner with Overlapping KPIs */}
        <div className="relative pt-12 pb-24 px-6 md:px-12">
          <div className="absolute inset-0 z-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(${bgImage})` }} />
          <div className="absolute inset-0 z-0 bg-gradient-to-b from-transparent to-[var(--surface-base)]" />
          
          <div className="relative z-10 max-w-5xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-black font-serif mb-4 drop-shadow-xl">{title}</h1>
            <p className="text-lg text-white/80 max-w-2xl font-light">{description}</p>
          </div>
        </div>

        {/* KPI Row (Overlaps the banner) */}
        {kpis.length > 0 && (
          <div className="px-6 md:px-12 relative z-20 -mt-16 mb-12">
            <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
              {kpis.map((kpi, i) => (
                <div key={i} className="bg-black/50 backdrop-blur-xl border border-[var(--primary)]/30 rounded-2xl p-5 shadow-2xl relative overflow-hidden group hover:-translate-y-1 transition-transform">
                  <div className="absolute -top-6 -right-6 w-16 h-16 bg-[var(--primary)]/10 rounded-full blur-2xl group-hover:bg-[var(--primary)]/20 transition-colors" />
                  <p className="text-sm text-white/60 mb-1">{kpi.label}</p>
                  <p className="text-2xl font-bold text-white">{kpi.value}</p>
                  {kpi.trend && <p className="text-xs text-[var(--primary)] mt-1 font-medium">{kpi.trend}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="px-6 md:px-12 pb-24 flex-1">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-black/80 backdrop-blur-xl border-t border-white/10 z-50 flex items-center justify-around px-2">
        <Link href="/" className="p-3 text-white/50"><Home className="w-6 h-6" /></Link>
        <Link href="#" className="p-3 text-[var(--primary)]"><LayoutDashboard className="w-6 h-6" /></Link>
        
        {/* Floating Action Center Button */}
        <div className="relative -top-6">
          <button className="w-14 h-14 rounded-full bg-gradient-to-tr from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center shadow-[0_4px_20px_var(--primary)] border-4 border-black text-white hover:scale-105 transition-transform">
            <Plus className="w-7 h-7" />
          </button>
        </div>
        
        <Link href="#" className="p-3 text-white/50"><Bell className="w-6 h-6" /></Link>
        <Link href="#" className="p-3 text-white/50"><Settings className="w-6 h-6" /></Link>
      </nav>
    </div>
  );
}

