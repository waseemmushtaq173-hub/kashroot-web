import { useId, type SVGProps } from 'react';

/**
 * The KashRoot emblem: a chinar leaf in gold foil growing from its roots,
 * on a deep emerald tile with a fine gold rim. The chinar is the Valley's
 * tree; the roots are the "Root" in the name — growers and the land they
 * trade from.
 *
 * Gradient ids are made unique per instance, so several emblems can sit on
 * one page. Decorative by default; pass `title` to label it.
 */
export function Emblem({ title, ...props }: SVGProps<SVGSVGElement> & { title?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const u = (name: string) => `${name}-${id}`;
  const leaf =
    'M60 13 C65.5 21 70 29 70.5 38.5 C76 33 82 30 90 28.5 C88.5 37 86 44.5 82.5 51 C88.5 52 94 54 100 57.5 C93.5 64.5 85 70 76.5 72 C72 75.5 66.5 77.5 60 78.5 C53.5 77.5 48 75.5 43.5 72 C35 70 26.5 64.5 20 57.5 C26 54 31.5 52 37.5 51 C34 44.5 31.5 37 30 28.5 C38 30 44 33 49.5 38.5 C50 29 54.5 21 60 13 Z';
  return (
    <svg viewBox="0 0 120 120" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title} {...props}>
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={u('bg')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0E5A45" />
          <stop offset="0.55" stopColor="#063D30" />
          <stop offset="1" stopColor="#02221B" />
        </linearGradient>
        <radialGradient id={u('glow')} cx="0.3" cy="0.22" r="0.75">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.22" />
          <stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={u('gold')} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#FFF1C1" />
          <stop offset="0.35" stopColor="#F1C76A" />
          <stop offset="0.7" stopColor="#C8902F" />
          <stop offset="1" stopColor="#8E5E17" />
        </linearGradient>
        <linearGradient id={u('rim')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F7DC97" />
          <stop offset="0.5" stopColor="#B9842C" />
          <stop offset="1" stopColor="#F3D388" />
        </linearGradient>
        <clipPath id={u('half')}>
          <rect x="60" y="0" width="60" height="120" />
        </clipPath>
      </defs>
      <rect width="120" height="120" rx="28" fill={`url(#${u('bg')})`} />
      <rect width="120" height="120" rx="28" fill={`url(#${u('glow')})`} />
      <rect x="5" y="5" width="110" height="110" rx="23.5" fill="none" stroke={`url(#${u('rim')})`} strokeWidth="1.6" opacity="0.9" />
      <path d={leaf} fill={`url(#${u('gold')})`} />
      {/* The far half sits in shade, like folded foil. */}
      <path d={leaf} fill="#7A4E12" opacity="0.28" clipPath={`url(#${u('half')})`} />
      <g fill="none" stroke="#063D30" strokeWidth="1.3" strokeLinecap="round" opacity="0.8">
        <path d="M60 76 L60 22" />
        <path d="M60 66 L84 35" />
        <path d="M60 66 L36 35" />
        <path d="M60 71 L93 58" />
        <path d="M60 71 L27 58" />
      </g>
      <g fill="none" stroke={`url(#${u('gold')})`} strokeLinecap="round">
        <path d="M60 78 L60 106" strokeWidth="2.6" />
        <path d="M60 87 C58.5 95 52 99 44 103" strokeWidth="2.1" />
        <path d="M60 87 C61.5 95 68 99 76 103" strokeWidth="2.1" />
        <path d="M55 97 C52.5 100 51 103.5 50.5 108" strokeWidth="1.5" />
        <path d="M65 97 C67.5 100 69 103.5 69.5 108" strokeWidth="1.5" />
      </g>
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
