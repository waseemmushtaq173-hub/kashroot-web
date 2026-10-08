import React from 'react';

export const PaisleyPattern = ({ className = "w-10 h-10", color = "#D9622B" }: { className?: string; color?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M50 90 C20 90 10 65 10 45 C10 20 40 10 50 5 C60 10 90 20 90 45 C90 65 80 90 50 90 Z" 
      stroke={color} 
      strokeWidth="2"
      fill={color}
      fillOpacity="0.1"
    />
    <path 
      d="M50 5 C40 15 30 30 30 45 C30 60 40 75 50 80 C60 75 70 60 70 45 C70 30 60 15 50 5 Z" 
      stroke={color} 
      strokeWidth="1.5"
    />
    <circle cx="50" cy="55" r="5" fill={color} opacity="0.6" />
    <path d="M50 5 C45 0 55 0 50 5" fill={color} />
  </svg>
);
