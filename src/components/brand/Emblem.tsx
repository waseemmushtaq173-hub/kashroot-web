import { useId, type SVGProps } from 'react';

/** Outline of a chinar leaf: five pointed, toothed lobes (120×120 box). */
export const CHINAR_PATH =
  'M60.0 5.0 L62.5 11.6 L65.5 9.9 L66.5 17.1 L70.5 15.5 L70.0 24.8 L73.5 24.8 L69.5 40.2 L76.5 34.7 L78.0 28.7 L81.5 31.4 L86.0 24.2 L88.0 28.1 L97.0 19.9 L104.0 17.1 L101.5 26.5 L99.5 34.7 L95.0 36.4 L97.5 41.9 L90.5 48.5 L93.5 51.8 L84.0 60.0 L91.0 62.8 L95.0 60.6 L96.0 67.7 L102.5 74.3 L97.0 76.5 L99.0 84.2 L90.0 82.0 L88.0 88.6 L80.0 82.0 L76.5 85.9 L69.0 78.7 L62.5 83.1 L61.5 86.4 L57.5 83.1 L51.0 78.7 L43.5 85.9 L40.0 82.0 L32.0 88.6 L30.0 82.0 L21.0 84.2 L23.0 76.5 L17.5 74.3 L24.0 67.7 L25.0 60.6 L29.0 62.8 L36.0 60.0 L26.5 51.8 L29.5 48.5 L22.5 41.9 L25.0 36.4 L20.5 34.7 L18.5 26.5 L16.0 17.1 L23.0 19.9 L32.0 28.1 L34.0 24.2 L38.5 31.4 L42.0 28.7 L43.5 34.7 L50.5 40.2 L46.5 24.8 L50.0 24.8 L49.5 15.5 L53.5 17.1 L54.5 9.9 L57.5 11.6 L60.0 5.0 Z';

/**
 * The KashRoot emblem: an autumn chinar leaf — the Valley's tree — on a warm
 * walnut tile, with "KashRoot" lightly engraved across the leaf (pressed in,
 * not printed, so it reads as texture first and as a name up close).
 *
 * Gradient ids are made unique per instance, so several emblems can sit on
 * one page. Decorative by default; pass `title` to label it. `tile={false}`
 * draws the leaf alone, for light backgrounds.
 */
export function Emblem({ title, tile = true, ...props }: SVGProps<SVGSVGElement> & { title?: string; tile?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const u = (name: string) => `${name}-${id}`;
  return (
    <svg viewBox="0 0 120 120" width={40} height={40} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title} {...props}>
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={u('wood')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6E3B22" />
          <stop offset="1" stopColor="#3B1D0F" />
        </linearGradient>
        <linearGradient id={u('leaf')} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#FFB560" />
          <stop offset="0.5" stopColor="#F28A2E" />
          <stop offset="1" stopColor="#D5601B" />
        </linearGradient>
        <clipPath id={u('half')}>
          <rect x="60" y="0" width="60" height="120" />
        </clipPath>
      </defs>
      {tile && <rect width="120" height="120" rx="26" fill={`url(#${u('wood')})`} />}
      <path d={CHINAR_PATH} fill={`url(#${u('leaf')})`} stroke="#C4561A" strokeWidth="0.6" strokeLinejoin="round" />
      {/* The far half sits a shade darker, as the leaf turns in the light. */}
      <path d={CHINAR_PATH} fill="#B9521A" opacity="0.14" clipPath={`url(#${u('half')})`} />
      <g fill="none" stroke="#FFD2A1" strokeWidth="0.9" strokeLinecap="round" opacity="0.7">
        <path d="M60 84 L60 12" />
        <path d="M60 74 L100 22" />
        <path d="M60 74 L20 22" />
        <path d="M60 79 L101 75" />
        <path d="M60 79 L19 75" />
      </g>
      {/* Engraved name: a dark cut with a light lower edge. */}
      <g fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="11" textAnchor="middle" letterSpacing="0.4">
        <text x="60.45" y="58.6" fill="#FFE4C2" opacity="0.42">KashRoot</text>
        <text x="60" y="58" fill="#94380C" opacity="0.48">KashRoot</text>
      </g>
      <path d="M60.3 84 C60.6 94 61 104 60.4 114" fill="none" stroke="#C2361F" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** "Kash" in the text colour, "Root" in gold foil, set in a display serif. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight ${className}`}>
      Kash
      <span className="bg-gradient-to-br from-amber-300 via-amber-500 to-amber-800 bg-clip-text text-transparent">Root</span>
    </span>
  );
}
