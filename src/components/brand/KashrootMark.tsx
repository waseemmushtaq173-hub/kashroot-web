import React from 'react';

export const KashrootMark = ({ className = "w-8 h-8", color = "#D4AF37" }: { className?: string; color?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M30 20 L30 80 M30 50 L70 20 M30 50 L70 80" stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M70 20 C60 10 40 10 30 20" stroke={color} strokeWidth="4" strokeLinecap="round" opacity="0.6" />
    <path d="M70 80 C80 90 60 95 50 80" stroke={color} strokeWidth="4" strokeLinecap="round" opacity="0.6" />
  </svg>
);
