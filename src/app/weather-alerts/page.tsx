'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { CloudRain, Snowflake, Thermometer, Wind, AlertTriangle, CloudLightning, ShieldAlert, CheckCircle } from 'lucide-react';

// Mock DEMO DATA
const FORECAST = [
  { day: 'Today', tempDay: '14°C', tempNight: '4°C', condition: 'Rain', icon: CloudRain, risk: 'Medium' },
  { day: 'Tomorrow', tempDay: '12°C', tempNight: '1°C', condition: 'Frost Warning', icon: Snowflake, risk: 'High' },
  { day: 'Wed', tempDay: '15°C', tempNight: '6°C', condition: 'Clear', icon: Wind, risk: 'Low' },
  { day: 'Thu', tempDay: '16°C', tempNight: '7°C', condition: 'Cloudy', icon: CloudLightning, risk: 'Low' },
];

const ACTION_CARDS = [
  { id: 1, title: 'Cover Blossoms Tonight', desc: 'Temperatures dropping to 1°C in Sopore. Cover tender apple blossoms to prevent frost damage.', type: 'critical', icon: Snowflake },
  { id: 2, title: 'Delay Spraying', desc: 'Heavy rain expected tomorrow afternoon. Fungicide sprays will be washed away. Wait until Wednesday.', type: 'warning', icon: CloudRain },
];

export default function WeatherAlertsPage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Pir Panjal Navy to Teal */}
          <div className="bg-gradient-to-r from-[var(--kr-pir-panjal-navy,#0B1F3A)] to-[var(--kr-dal-teal,#0E7C86)] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <CloudRain className="w-8 h-8 text-white" /> Weather & Disaster Alert Room
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Hyper-local forecasts for your village. Get early warnings for frost, hail, and snow to protect your crop.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <CloudRain className="w-64 h-64 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Alerts & Actions */}
            <div className="lg:col-span-1 space-y-6">
              
              {/* Live Location Widget */}
              <div className="bg-black/40 backdrop-blur-md border border-white/20 p-6 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-xs text-white/60 mb-1">Current Location (Auto-detected)</div>
                  <div className="text-xl font-bold flex items-center gap-2 text-[var(--kr-dal-teal,#0E7C86)]">
                    Sopore, Baramulla
                  </div>
                </div>
                <Thermometer className="w-8 h-8 text-white/50" />
              </div>

              {/* Action Cards */}
              <h2 className="text-xl font-bold flex items-center gap-2 mt-4">
                <ShieldAlert className="w-5 h-5 text-amber-400" /> Recommended Actions
              </h2>
              
              <div className="space-y-4">
                {ACTION_CARDS.map(action => {
                  const Icon = action.icon;
                  const isCritical = action.type === 'critical';
                  return (
                    <div key={action.id} className={`p-5 rounded-2xl border backdrop-blur-md relative overflow-hidden ${isCritical ? 'bg-red-500/20 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-amber-500/20 border-amber-500/50'}`}>
                      <div className="flex gap-4">
                        <div className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center ${isCritical ? 'bg-red-500 text-white' : 'bg-amber-500 text-black'}`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className={`font-bold text-lg mb-1 ${isCritical ? 'text-red-400' : 'text-amber-400'}`}>
                            {action.title}
                          </h3>
                          <p className="text-sm text-white/80 leading-relaxed">{action.desc}</p>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-white/10 flex justify-end gap-3">
                        <button className="text-xs bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg font-medium transition-colors hidden">Dismiss</button>
                        <button className={`text-xs px-4 py-2 rounded-lg font-bold transition-colors text-black ${isCritical ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'} hidden`}>
                          Mark as Done
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

            {/* Right Column: Forecast UI */}
            <div className="lg:col-span-2">
              <div className="bg-black/30 backdrop-blur-md border border-[var(--kr-pir-panjal-navy,#0B1F3A)]/50 p-6 rounded-2xl h-full shadow-[0_0_30px_rgba(11,31,58,0.3)]">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <CloudRain className="w-6 h-6 text-[var(--kr-dal-teal,#0E7C86)]" /> 4-Day Micro-Forecast
                  </h2>
                  <span className="bg-green-500/20 text-green-400 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 border border-green-500/30">
                    <CheckCircle className="w-3 h-3" /> Syncing Live
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {FORECAST.map((day, i) => {
                    const Icon = day.icon;
                    const isHighRisk = day.risk === 'High';
                    return (
                      <div key={i} className={`p-4 rounded-xl border flex flex-col items-center text-center transition-transform hover:scale-105 ${isHighRisk ? 'bg-red-500/10 border-red-500/30' : 'bg-white/5 border-white/10'}`}>
                        <h3 className="font-bold text-lg mb-4">{day.day}</h3>
                        
                        <Icon className={`w-12 h-12 mb-4 ${isHighRisk ? 'text-red-400' : 'text-[var(--kr-dal-teal,#0E7C86)]'}`} />
                        
                        <div className="text-2xl font-bold mb-1">{day.tempDay}</div>
                        <div className="text-sm text-white/50 mb-4">Night: {day.tempNight}</div>
                        
                        <div className={`text-xs font-bold px-2 py-1 rounded-md w-full ${isHighRisk ? 'bg-red-500/30 text-red-300' : 'bg-white/10 text-white/70'}`}>
                          {day.condition}
                        </div>
                        {isHighRisk && (
                          <div className="mt-2 text-[10px] text-red-400 flex items-center justify-center gap-1 w-full">
                            <AlertTriangle className="w-3 h-3" /> High Risk
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {/* Weather Radar Placeholder */}
                <div className="mt-8 rounded-xl overflow-hidden border border-white/10 relative h-64 bg-[#0a1526]">
                  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%230e7c86\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}></div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
                    <CloudRain className="w-10 h-10 text-white/30 mb-2" />
                    <span className="text-white/50 text-sm font-medium">Live Precipitation Radar (Premium Feature)</span>
                  </div>
                </div>

              </div>
            </div>

          </div>

        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
