import React from 'react';

import { CHINAR_PATH } from '@/components/brand/Emblem';

/** A small chinar-leaf ornament in one colour (the logo's leaf, without the name). */
export const ChinarLeaf = ({ className = 'w-6 h-6', color = '#D4AF37' }: { className?: string; color?: string }) => (
  <svg viewBox="0 0 120 120" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d={CHINAR_PATH} fill={color} fillOpacity="0.25" stroke={color} strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M60 84 L60 14 M60 74 L98 24 M60 74 L22 24 M60 79 L99 75 M60 79 L21 75 M60 84 L60 112" stroke={color} strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />
  </svg>
);
