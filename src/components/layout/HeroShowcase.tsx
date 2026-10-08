"use client";

import React, { useState, useEffect } from 'react';

const IMAGES = [
  { url: 'https://images.unsplash.com/photo-1595815771614-ade9d652a65d?auto=format&fit=crop&q=80', name: 'Spring Blossoms in Pulwama', season: 'Spring' },
  { url: 'https://images.unsplash.com/photo-1566323420067-2713f019f206?auto=format&fit=crop&q=80', name: 'Summer on Dal Lake', season: 'Summer' },
  { url: 'https://images.unsplash.com/photo-1667980816280-928ccf22eb01?auto=format&fit=crop&q=80', name: 'Autumn Chinars of Naseem Bagh', season: 'Autumn' },
  { url: 'https://images.unsplash.com/photo-1606828552391-4e7828ea287e?auto=format&fit=crop&q=80', name: 'Winter Snow in Gulmarg', season: 'Winter' },
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
      <div className="absolute inset-0 bg-black/40 z-10" />

      {/* Hero Content */}
      <div className="relative z-20 flex flex-col items-center justify-center h-full text-center px-4">
        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 drop-shadow-lg">
          The Soul of Kashmir
        </h1>
        <p className="text-xl text-white/90 max-w-2xl mb-8 drop-shadow-md">
          Authentic produce, direct from the valleys. Experience the true essence of Kashmiri agriculture.
        </p>
        <button
          onClick={onEnterPortals}
          className="px-8 py-4 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/40 text-white rounded-full font-semibold text-lg transition-all shadow-lg hover:shadow-xl hover:scale-105"
        >
          Explore Portals
        </button>
      </div>

      {/* Glassmorphic Image Badge */}
      <div className="absolute bottom-6 right-6 z-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-4 rounded-2xl shadow-xl">
          <p className="text-xs font-bold text-white/60 uppercase tracking-wider mb-1">
            {IMAGES[currentIndex].season}
          </p>
          <p className="text-sm font-medium text-white">
            {IMAGES[currentIndex].name}
          </p>
        </div>
      </div>
    </div>
  );
}
