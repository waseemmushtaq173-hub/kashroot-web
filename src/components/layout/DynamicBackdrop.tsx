'use client';

import { useEffect, useState } from 'react';

export function DynamicBackdrop({ children }: { children?: React.ReactNode }) {
  const [timeOfDay, setTimeOfDay] = useState<'morning' | 'noon' | 'evening' | 'night'>('noon');

  useEffect(() => {
    const updateTime = () => {
      const hour = new Date().getHours();
      if (hour >= 5 && hour < 10) setTimeOfDay('morning');
      else if (hour >= 10 && hour < 16) setTimeOfDay('noon');
      else if (hour >= 16 && hour < 19) setTimeOfDay('evening');
      else setTimeOfDay('night');
    };
    
    updateTime();
    const interval = setInterval(updateTime, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const gradients = {
    morning: 'from-[var(--kr-pir-panjal-navy)] via-[var(--kr-orchard-green)] to-[var(--kr-saffron-gold)]', 
    noon: 'from-[var(--kr-dal-teal)] via-[var(--kr-orchard-green)] to-[var(--kr-chinar-amber)]',
    evening: 'from-[var(--kr-apple-crimson)] via-[var(--kr-chinar-amber)] to-[var(--kr-pir-panjal-navy)]',
    night: 'from-[#07120D] via-[var(--kr-pir-panjal-navy)] to-[#040C08]'
  };

  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none bg-[#07120D]">
      {/* Time-based sky gradient */}
      <div 
        className={`absolute inset-0 bg-gradient-to-br ${gradients[timeOfDay]} opacity-60 transition-colors duration-1000`} 
      />
      
      {/* Pir Panjal Layer (Stylized Silhouette) */}
      <div className="absolute bottom-1/4 left-0 right-0 h-96 opacity-40 mix-blend-overlay">
        <svg viewBox="0 0 1000 200" preserveAspectRatio="none" className="w-full h-full fill-current text-[var(--kr-pir-panjal-navy)]">
          <path d="M0,200 L0,150 L100,50 L250,120 L400,20 L600,140 L750,40 L900,100 L1000,60 L1000,200 Z" />
        </svg>
      </div>

      {/* Dal Lake Image Overlay */}
      <div
        className="absolute inset-0 bg-cover bg-bottom opacity-20 mix-blend-luminosity"
        style={{ backgroundImage: `url('https://images.unsplash.com/photo-1715457573748-8e8a70b2c1be?auto=format&fit=crop&w=2400&q=80')` }}
      />
      
      {/* Subtle vignette/texture */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#07120D_100%)] opacity-80" />
      
      {children}
    </div>
  );
}
