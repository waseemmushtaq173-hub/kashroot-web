"use client";

import React, { useState, useEffect } from 'react';

const IMAGES = [
  { url: '/seasons/spring.svg', name: 'Spring Blossoms in Pulwama', season: 'Spring' },
  { url: '/seasons/summer.svg', name: 'Summer on Dal Lake', season: 'Summer' },
  { url: '/seasons/autumn.svg', name: 'Autumn Chinars of Naseem Bagh', season: 'Autumn' },
  { url: '/seasons/winter.svg', name: 'Winter Snow in Gulmarg', season: 'Winter' },
];

export function HeroShowcase({ onEnterPortals }: { onEnterPortals?: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % IMAGES.length);
    }, 5000); // 5 seconds crossfade
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative w-full h-[80vh] min-h-[600px] overflow-hidden">
      {/* Background Images Crossfade */}
      {IMAGES.map((img, index) => (
        <div
          key={img.url}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out"
          style={{
            backgroundImage: `url('${img.url}')`,
            opacity: index === currentIndex ? 1 : 0,
            zIndex: index === currentIndex ? 1 : 0
          }}
        />
      ))}

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-white/35 z-10" />

      {/* Hero Content */}
      <div className="relative z-20 flex flex-col items-center justify-center h-full text-center px-4">
        <h1 className="text-5xl md:text-7xl font-bold text-emerald-950 mb-6 drop-shadow-sm">
          The Soul of Kashmir
        </h1>
        <p className="text-xl text-emerald-950/85 max-w-2xl mb-8">
          Authentic produce, direct from the valleys. Experience the true essence of Kashmiri agriculture.
        </p>
        <button
          onClick={onEnterPortals}
          className="px-8 py-4 bg-white/75 hover:bg-white/95 backdrop-blur-md border border-white text-emerald-900 rounded-full font-semibold text-lg transition-all shadow-lg hover:shadow-xl hover:scale-105"
        >
          Explore Portals
        </button>
      </div>

      {/* Glassmorphic Image Badge */}
      <div className="absolute bottom-6 right-6 z-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-4 rounded-2xl shadow-xl">
          <p className="text-xs font-bold text-emerald-900/60 uppercase tracking-wider mb-1">
            {IMAGES[currentIndex].season}
          </p>
          <p className="text-sm font-medium text-emerald-950">
            {IMAGES[currentIndex].name}
          </p>
        </div>
      </div>
    </div>
  );
}
