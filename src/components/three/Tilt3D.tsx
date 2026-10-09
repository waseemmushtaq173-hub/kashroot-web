'use client';

/**
 * Tilt3D — gives a card real depth: it tilts toward the pointer in 3D with a
 * soft moving glare, and children marked `data-depth` float above the face.
 * Pure CSS transforms driven by CSS variables (no re-renders). Touch devices
 * and prefers-reduced-motion get a flat card.
 */
import { useRef, type ReactNode } from 'react';

export function Tilt3D({ children, className = '', max = 9 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(0.5 - py) * max}deg`);
    el.style.setProperty('--ry', `${(px - 0.5) * max}deg`);
    el.style.setProperty('--gx', `${px * 100}%`);
    el.style.setProperty('--gy', `${py * 100}%`);
    el.style.setProperty('--glare', '1');
  };

  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--glare', '0');
  };

  return (
    <div className="h-full [perspective:1100px]">
      <div
        ref={ref}
        onPointerMove={move}
        onPointerLeave={leave}
        className={`kr-tilt relative h-full [transform-style:preserve-3d] ${className}`}
      >
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-[var(--glare,0)] transition-opacity duration-300 [background:radial-gradient(circle_at_var(--gx,50%)_var(--gy,50%),rgba(255,255,255,0.55),transparent_55%)]"
        />
      </div>
    </div>
  );
}
