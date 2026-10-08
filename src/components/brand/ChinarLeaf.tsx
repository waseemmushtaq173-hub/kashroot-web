import React from 'react';

export const ChinarLeaf = ({ className = "w-6 h-6", color = "#D4AF37" }: { className?: string; color?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M50 8 C47 22 36 28 28 32 C34 36 33 42 22 46 C32 50 31 60 25 68 C35 66 38 72 35 84 C43 76 47 79 50 92 C53 79 57 76 65 84 C62 72 65 66 75 68 C69 60 68 50 78 46 C67 42 66 36 72 32 C64 28 53 22 50 8 Z" 
      fill={color} 
      fillOpacity="0.25"
      stroke={color} 
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M50 18 L50 84 M50 44 L32 36 M50 48 L68 36 M50 58 L28 52 M50 62 L72 52 M50 72 L36 70 M50 74 L64 70" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
  </svg>
);
