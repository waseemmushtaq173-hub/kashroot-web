"use client";

import { useEffect, useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/layout/SiteHeader";
import { Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw } from "lucide-react";

export default function StatusPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health");
      const json = await res.json();
      setData(json);
    } catch (e) {
      setData({ status: "down", services: { web: "down", db: "down" } });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const getIcon = (status: string) => {
    if (status === "ok" || status === "configured") return <CheckCircle className="w-6 h-6 text-green-500" />;
    if (status === "degraded") return <AlertTriangle className="w-6 h-6 text-yellow-500" />;
    return <XCircle className="w-6 h-6 text-red-500" />;
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#07120D] text-white">
      <SiteHeader hideSignIn={false} />
      <main className="container mx-auto px-4 py-20 flex-1 max-w-3xl">
        <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-6">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Activity className="w-8 h-8 text-[#D4AF37]" /> Kashroot System Status
          </h1>
          <button 
            onClick={fetchStatus} 
            className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
            disabled={loading}
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loading && !data ? (
          <div className="animate-pulse space-y-4">
            <div className="h-16 bg-white/5 rounded-xl"></div>
            <div className="h-16 bg-white/5 rounded-xl"></div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-6 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">Overall Status</h3>
                <p className="text-sm text-white/50">{data?.timestamp ? new Date(data.timestamp).toLocaleString() : "Unknown"}</p>
              </div>
              <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
                {getIcon(data?.status)} {data?.status}
              </div>
            </div>

            <h2 className="text-xl font-bold mt-8 mb-4">Core Services</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 bg-black/40 border border-white/5 rounded-xl flex items-center justify-between">
                <span className="font-medium">Web Frontend</span>
                {getIcon(data?.services?.web)}
              </div>
              <div className="p-5 bg-black/40 border border-white/5 rounded-xl flex items-center justify-between">
                <span className="font-medium">Database (Prisma)</span>
                {getIcon(data?.services?.db)}
              </div>
              <div className="p-5 bg-black/40 border border-white/5 rounded-xl flex items-center justify-between">
                <span className="font-medium">API Host Config</span>
                {getIcon(data?.services?.api_host)}
              </div>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

