'use client';

import { useEffect, useState } from 'react';
import { CloudRain, Sun, Cloud, Thermometer, Wind, Droplets, CloudSun } from 'lucide-react';

interface WeatherData {
  temp: number;
  min: number;
  max: number;
  precip: number;
  wind: number;
  isRaining: boolean;
  isCloudy: boolean;
}

export function WeatherWidget() {
  const [data, setData] = useState<Record<string, WeatherData>>({});
  const [loading, setLoading] = useState(true);

  // Define hubs with approximate lat/lng
  const hubs = [
    { id: 'srinagar', name: 'Srinagar / Shopian', lat: 34.0837, lng: 74.7973 },
    { id: 'azadpur', name: 'Delhi (Azadpur)', lat: 28.7373, lng: 77.1726 },
  ];

  useEffect(() => {
    async function fetchWeather() {
      try {
        const results: Record<string, WeatherData> = {};
        for (const hub of hubs) {
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${hub.lat}&longitude=${hub.lng}&current=temperature_2m,precipitation,wind_speed_10m,cloud_cover&daily=temperature_2m_max,temperature_2m_min&timezone=auto`);
          if (res.ok) {
            const json = await res.json();
            results[hub.id] = {
              temp: json.current.temperature_2m,
              precip: json.current.precipitation,
              wind: json.current.wind_speed_10m,
              min: json.daily.temperature_2m_min[0],
              max: json.daily.temperature_2m_max[0],
              isRaining: json.current.precipitation > 0,
              isCloudy: json.current.cloud_cover > 50
            };
          }
        }
        setData(results);
      } catch (e) {
        console.error("Weather fetch failed", e);
      } finally {
        setLoading(false);
      }
    }
    fetchWeather();
  }, []);

  if (loading) {
    return (
      <div className="kr-card p-6 animate-pulse bg-slate-50">
        <div className="h-6 w-48 bg-slate-200 rounded mb-4" />
        <div className="h-20 w-full bg-slate-200 rounded" />
      </div>
    );
  }

  return (
    <div className="kr-card p-0 overflow-hidden border-2 border-blue-100">
      <div className="bg-blue-50/50 p-4 border-b border-blue-100 flex items-center gap-2">
        <CloudSun className="w-5 h-5 text-blue-600" />
        <h2 className="font-heading text-h3 text-blue-900">Live Logistics Weather</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-kr-border-default">
        {hubs.map(hub => {
          const w = data[hub.id];
          if (!w) return null;
          return (
            <div key={hub.id} className="p-4 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium text-kr-text-primary">{hub.name}</span>
                {w.isRaining ? <CloudRain className="w-6 h-6 text-blue-500" /> : w.isCloudy ? <Cloud className="w-6 h-6 text-slate-400" /> : <Sun className="w-6 h-6 text-amber-500" />}
              </div>
              <div className="text-3xl font-heading text-kr-text-primary mb-3">
                {w.temp}°C
              </div>
              <div className="grid grid-cols-3 gap-2 text-caption text-kr-text-secondary bg-kr-bg-sunken p-2 rounded">
                <div className="flex flex-col items-center" title="Min/Max">
                  <Thermometer className="w-4 h-4 mb-1" />
                  <span>{w.min}° - {w.max}°</span>
                </div>
                <div className="flex flex-col items-center border-l border-r border-kr-border-default" title="Precipitation">
                  <Droplets className="w-4 h-4 mb-1" />
                  <span>{w.precip}mm</span>
                </div>
                <div className="flex flex-col items-center" title="Wind Speed">
                  <Wind className="w-4 h-4 mb-1" />
                  <span>{w.wind}km/h</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
