'use client';

import { useEffect, useState, useRef } from 'react';
import { CloudRain, Sun, Cloud, Thermometer, Wind, Droplets, CloudSun, MapPin, Loader2, Navigation } from 'lucide-react';

interface WeatherData {
  temp: number;
  min: number;
  max: number;
  precip: number;
  wind: number;
  isRaining: boolean;
  isCloudy: boolean;
}

const PREDEFINED_LOCATIONS = [
  { id: 'srinagar', name: 'Srinagar, J&K', lat: 34.0837, lng: 74.7973 },
  { id: 'shopian', name: 'Shopian, J&K', lat: 33.7223, lng: 74.8341 },
  { id: 'baramulla', name: 'Baramulla, J&K', lat: 34.2000, lng: 74.3400 },
  { id: 'anantnag', name: 'Anantnag, J&K', lat: 33.7311, lng: 75.1487 },
  { id: 'pulwama', name: 'Pulwama, J&K', lat: 33.8716, lng: 74.8946 },
  { id: 'kupwara', name: 'Kupwara, J&K', lat: 34.5262, lng: 74.2546 },
  { id: 'bandipora', name: 'Bandipora, J&K', lat: 34.4225, lng: 74.6542 },
  { id: 'ganderbal', name: 'Ganderbal, J&K', lat: 34.2185, lng: 74.7749 },
  { id: 'kulgam', name: 'Kulgam, J&K', lat: 33.6436, lng: 75.0210 },
  { id: 'budgam', name: 'Budgam, J&K', lat: 34.0263, lng: 74.7176 },
  { id: 'jammu', name: 'Jammu, J&K', lat: 32.7266, lng: 74.8570 },
  { id: 'azadpur', name: 'Delhi (Azadpur)', lat: 28.7373, lng: 77.1726 },
  { id: 'bengaluru', name: 'Bengaluru (APMC)', lat: 12.9716, lng: 77.5946 },
  { id: 'mumbai', name: 'Mumbai (Vashi)', lat: 19.0760, lng: 72.8777 },
];

export function WeatherWidget() {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [locLoading, setLocLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [selectedLoc, setSelectedLoc] = useState(PREDEFINED_LOCATIONS[0]);

  const fetchWeather = async (lat: number, lng: number) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,wind_speed_10m,cloud_cover&daily=temperature_2m_max,temperature_2m_min&timezone=auto`);
      if (res.ok) {
        const json = await res.json();
        setData({
          temp: json.current.temperature_2m,
          precip: json.current.precipitation,
          wind: json.current.wind_speed_10m,
          min: json.daily.temperature_2m_min[0],
          max: json.daily.temperature_2m_max[0],
          isRaining: json.current.precipitation > 0,
          isCloudy: json.current.cloud_cover > 50
        });
      } else {
        setErrorMsg('Failed to fetch weather data.');
      }
    } catch (e) {
      console.error("Weather fetch failed", e);
      setErrorMsg('Network error while fetching weather.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeather(selectedLoc.lat, selectedLoc.lng);
  }, [selectedLoc]);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser');
      return;
    }
    setLocLoading(true);
    setErrorMsg('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocLoading(false);
        const newLoc = {
          id: 'custom-gps',
          name: 'My Current Location',
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setSelectedLoc(newLoc);
      },
      (error) => {
        setLocLoading(false);
        setErrorMsg('Unable to retrieve your location');
      }
    );
  };

  return (
    <div className="kr-card p-0 overflow-hidden border-2 border-kr-border-default kr-glass">
      {/* Header and Controls */}
      <div className="bg-kr-bg-sunken p-4 border-b border-kr-border-default">
        <div className="flex items-center gap-2 mb-4">
          <CloudSun className="w-5 h-5 text-blue-600" />
          <h2 className="font-heading text-h3 text-blue-900">Live Logistics Weather</h2>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-kr-text-secondary" />
            <select
              className="kr-input pl-9 w-full kr-glass text-kr-text-primary"
              value={selectedLoc.id}
              onChange={(e) => {
                const loc = PREDEFINED_LOCATIONS.find(l => l.id === e.target.value);
                if (loc) setSelectedLoc(loc);
              }}
            >
              {selectedLoc.id === 'custom-gps' && (
                <option value="custom-gps">My Current Location</option>
              )}
              <optgroup label="Jammu & Kashmir">
                {PREDEFINED_LOCATIONS.slice(0, 11).map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </optgroup>
              <optgroup label="Major Market Hubs">
                {PREDEFINED_LOCATIONS.slice(11).map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <button
            onClick={handleUseMyLocation}
            disabled={locLoading}
            className="kr-btn-secondary whitespace-nowrap flex items-center gap-2"
          >
            {locLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
            Use My Location
          </button>
        </div>
        {errorMsg && <p className="text-kr-danger-600 text-sm mt-2">{errorMsg}</p>}
      </div>

      {/* Weather Display Panel */}
      <div className="p-6">
        {loading ? (
          <div className="animate-pulse flex flex-col items-center justify-center py-6">
            <div className="h-16 w-32 bg-kr-bg-sunken rounded mb-4" />
            <div className="h-4 w-48 bg-kr-bg-sunken rounded mb-8" />
            <div className="grid grid-cols-3 w-full gap-4">
              <div className="h-16 bg-kr-bg-sunken rounded" />
              <div className="h-16 bg-kr-bg-sunken rounded" />
              <div className="h-16 bg-kr-bg-sunken rounded" />
            </div>
          </div>
        ) : data ? (
          <div className="flex flex-col items-center">
            <div className="flex items-center justify-center gap-4 mb-2">
              {data.isRaining ? <CloudRain className="w-12 h-12 text-blue-500" /> : data.isCloudy ? <Cloud className="w-12 h-12 text-slate-400" /> : <Sun className="w-12 h-12 text-amber-500" />}
              <div className="text-5xl font-heading text-kr-text-primary tracking-tight">
                {data.temp}&deg;C
              </div>
            </div>
            <p className="text-kr-text-secondary font-medium text-lg mb-8 text-center flex items-center gap-1.5">
              <MapPin className="w-4 h-4" /> {selectedLoc.name}
            </p>

            <div className="grid grid-cols-3 w-full gap-2 sm:gap-4">
              <div className="flex flex-col items-center text-center p-3 bg-kr-bg-sunken rounded-xl border border-kr-border-default">
                <Thermometer className="w-5 h-5 mb-2 text-kr-primary-600" />
                <span className="text-xs text-kr-text-secondary mb-1 uppercase tracking-wider font-semibold">Min / Max</span>
                <span className="font-medium text-kr-text-primary">{data.min}&deg; - {data.max}&deg;</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 bg-kr-bg-sunken rounded-xl border border-kr-border-default">
                <Droplets className="w-5 h-5 mb-2 text-blue-500" />
                <span className="text-xs text-kr-text-secondary mb-1 uppercase tracking-wider font-semibold">Precipitation</span>
                <span className="font-medium text-kr-text-primary">{data.precip} mm</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 bg-kr-bg-sunken rounded-xl border border-kr-border-default">
                <Wind className="w-5 h-5 mb-2 text-teal-500" />
                <span className="text-xs text-kr-text-secondary mb-1 uppercase tracking-wider font-semibold">Wind Speed</span>
                <span className="font-medium text-kr-text-primary">{data.wind} km/h</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
