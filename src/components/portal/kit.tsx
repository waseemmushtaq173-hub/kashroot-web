'use client';

/**
 * Portal kit — the shared, bright building blocks for every role portal
 * (farmer, buyer, seller, kissan tools, rentals, logistics, dealer, admin,
 * tracking, expert) and the orchard tools.
 *
 * The look carries the valley without naming it: season photographs in each
 * hero, a khatamband (carved-ceiling) lattice woven faintly into the canvas, a
 * chinar leaf as the ornament, and a palette of saffron, chinar amber, lake
 * teal, crocus violet and walnut. Everything sits on frosted white glass with
 * slate-900 text, so contrast holds on every theme.
 *
 * Every class is a complete literal string so Tailwind keeps it.
 */
import Link from 'next/link';

import type { SceneMood } from '@/components/three/ValleyScene';
import { Tilt3D } from '@/components/three/Tilt3D';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { X, type LucideIcon } from 'lucide-react';

import { ChinarLeaf } from '@/components/brand/ChinarLeaf';

// ── Themes ──────────────────────────────────────────────────────────────────

export interface PortalTheme {
  /** 3D valley scene mood for the hero. */
  mood: SceneMood;
  /** Page canvas gradient. */
  canvas: string;
  /** Hero photograph (public/seasons) and its crop focus. */
  photo: string;
  focus: string;
  /** Tint laid over the photo so white hero text stays legible. */
  heroTint: string;
  /** Eyebrow pill on the hero. */
  eyebrow: string;
  /** Icon tile gradient. */
  tile: string;
  /** Solid button. */
  solid: string;
  /** Soft (tinted) button / chip. */
  soft: string;
  /** Accent text. */
  accent: string;
  /** focus-visible outline colour. */
  outline: string;
  /** Chinar ornament colour. */
  leaf: string;
  /** Active tab underline/background. */
  tabActive: string;
}

const T = (t: PortalTheme) => t;

export const PORTAL_THEMES = {
  farmer: T({
    mood: 'spring',
    canvas: 'bg-gradient-to-br from-emerald-50 via-lime-50 to-amber-50',
    photo: '/seasons/spring-meadow.jpg', focus: '50% 30%',
    heroTint: 'from-emerald-950/70 via-emerald-900/40 to-transparent',
    eyebrow: 'bg-white/20 text-white ring-1 ring-white/40',
    tile: 'bg-gradient-to-br from-emerald-400 to-green-700 text-white shadow-lg shadow-emerald-700/25',
    solid: 'bg-emerald-700 text-white hover:bg-emerald-800',
    soft: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100',
    accent: 'text-emerald-700', outline: 'focus-visible:outline-emerald-700', leaf: '#B45309',
    tabActive: 'bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-200',
  }),
  buyer: T({
    mood: 'summer',
    canvas: 'bg-gradient-to-br from-sky-50 via-white to-indigo-50',
    photo: '/seasons/summer-lake.jpg', focus: '50% 50%',
    heroTint: 'from-sky-950/70 via-sky-900/35 to-transparent',
    eyebrow: 'bg-white/20 text-white ring-1 ring-white/40',
    tile: 'bg-gradient-to-br from-sky-400 to-indigo-600 text-white shadow-lg shadow-indigo-600/25',
    solid: 'bg-sky-700 text-white hover:bg-sky-800',
    soft: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200 hover:bg-sky-100',
    accent: 'text-sky-700', outline: 'focus-visible:outline-sky-700', leaf: '#0369A1',
    tabActive: 'bg-white text-sky-800 shadow-sm ring-1 ring-sky-200',
  }),
  seller: T({
    mood: 'autumn',
    canvas: 'bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50',
    photo: '/seasons/autumn-garden.jpg', focus: '50% 55%',
    heroTint: 'from-amber-950/75 via-orange-900/40 to-transparent',
    eyebrow: 'bg-white/20 text-white ring-1 ring-white/40',
    tile: 'bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-lg shadow-orange-600/25',
    solid: 'bg-amber-700 text-white hover:bg-amber-800',
    soft: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100',
    accent: 'text-amber-800', outline: 'focus-visible:outline-amber-700', leaf: '#C2410C',
    tabActive: 'bg-white text-amber-900 shadow-sm ring-1 ring-amber-200',
  }),
  kissan: T({
    mood: 'autumn',
    canvas: 'bg-gradient-to-br from-orange-50 via-amber-50 to-stone-100',
    photo: '/seasons/autumn-garden.jpg', focus: '50% 40%',
    heroTint: 'from-stone-950/75 via-orange-950/40 to-transparent',
    eyebrow: 'bg-white/20 text-white ring-1 ring-white/40',
    tile: 'bg-gradient-to-br from-orange-500 to-amber-800 text-white shadow-lg shadow-orange-800/25',
    solid: 'bg-orange-700 text-white hover:bg-orange-800',
    soft: 'bg-orange-50 text-orange-900 ring-1 ring-orange-200 hover:bg-orange-100',
    accent: 'text-orange-800', outline: 'focus-visible:outline-orange-700', leaf: '#9A3412',
    tabActive: 'bg-white text-orange-900 shadow-sm ring-1 ring-orange-200',
  }),
  rental: T({
    mood: 'dusk',
    canvas: 'bg-gradient-to-br from-violet-50 via-white to-fuchsia-50',
    photo: '/seasons/winter-road.jpg', focus: '50% 20%',
    heroTint: 'from-violet-950/70 via-violet-900/35 to-transparent',
    eyebrow: 'bg-white/20 text-white ring-1 ring-white/40',
    tile: 'bg-gradient-to-br from-violet-400 to-purple-700 text-white shadow-lg shadow-purple-700/25',
    solid: 'bg-violet-700 text-white hover:bg-violet-800',
    soft: 'bg-violet-50 text-violet-800 ring-1 ring-violet-200 hover:bg-violet-100',
    accent: 'text-violet-700', outline: 'focus-visible:outline-violet-700', leaf: '#7C3AED',
    tabActive: 'bg-white text-violet-800 shadow-sm ring-1 ring-violet-200',
  }),
  provider: T({
    mood: 'winter',
    canvas: 'bg-gradient-to-br from-teal-50 via-cyan-50 to-white',
    photo: '/seasons/winter-lake.jpg', focus: '50% 40%',
    heroTint: 'from-teal-950/70 via-teal-900/35 to-transparent',
    eyebrow: 'bg-white/20 text-white ring-1 ring-white/40',
    tile: 'bg-gradient-to-br from-teal-400 to-cyan-700 text-white shadow-lg shadow-cyan-700/25',
    solid: 'bg-teal-700 text-white hover:bg-teal-800',
    soft: 'bg-teal-50 text-teal-800 ring-1 ring-teal-200 hover:bg-teal-100',
    accent: 'text-teal-700', outline: 'focus-visible:outline-teal-700', leaf: '#0F766E',
    tabActive: 'bg-white text-teal-800 shadow-sm ring-1 ring-teal-200',
  }),
  dealer: T({
    mood: 'autumn',
    canvas: 'bg-gradient-to-br from-rose-50 via-orange-50 to-amber-50',
    photo: '/seasons/autumn-garden.jpg', focus: '50% 70%',
    heroTint: 'from-rose-950/70 via-rose-900/35 to-transparent',
    eyebrow: 'bg-white/20 text-white ring-1 ring-white/40',
    tile: 'bg-gradient-to-br from-rose-400 to-red-700 text-white shadow-lg shadow-red-700/25',
    solid: 'bg-rose-700 text-white hover:bg-rose-800',
    soft: 'bg-rose-50 text-rose-800 ring-1 ring-rose-200 hover:bg-rose-100',
    accent: 'text-rose-700', outline: 'focus-visible:outline-rose-700', leaf: '#BE123C',
    tabActive: 'bg-white text-rose-800 shadow-sm ring-1 ring-rose-200',
  }),
  admin: T({
    mood: 'dawn',
    canvas: 'bg-gradient-to-br from-slate-50 via-indigo-50 to-white',
    photo: '/seasons/winter-lake.jpg', focus: '50% 30%',
    heroTint: 'from-indigo-950/75 via-indigo-900/40 to-transparent',
    eyebrow: 'bg-white/20 text-white ring-1 ring-white/40',
    tile: 'bg-gradient-to-br from-indigo-400 to-slate-700 text-white shadow-lg shadow-indigo-700/25',
    solid: 'bg-indigo-700 text-white hover:bg-indigo-800',
    soft: 'bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200 hover:bg-indigo-100',
    accent: 'text-indigo-700', outline: 'focus-visible:outline-indigo-700', leaf: '#4338CA',
    tabActive: 'bg-white text-indigo-800 shadow-sm ring-1 ring-indigo-200',
  }),
  tracking: T({
    mood: 'winter',
    canvas: 'bg-gradient-to-br from-cyan-50 via-white to-sky-50',
    photo: '/seasons/winter-road.jpg', focus: '50% 15%',
    heroTint: 'from-cyan-950/70 via-cyan-900/35 to-transparent',
    eyebrow: 'bg-white/20 text-white ring-1 ring-white/40',
    tile: 'bg-gradient-to-br from-cyan-400 to-sky-700 text-white shadow-lg shadow-sky-700/25',
    solid: 'bg-cyan-700 text-white hover:bg-cyan-800',
    soft: 'bg-cyan-50 text-cyan-800 ring-1 ring-cyan-200 hover:bg-cyan-100',
    accent: 'text-cyan-700', outline: 'focus-visible:outline-cyan-700', leaf: '#0E7490',
    tabActive: 'bg-white text-cyan-800 shadow-sm ring-1 ring-cyan-200',
  }),
  expert: T({
    mood: 'dusk',
    canvas: 'bg-gradient-to-br from-purple-50 via-white to-amber-50',
    photo: '/seasons/summer-lake.jpg', focus: '50% 30%',
    heroTint: 'from-purple-950/70 via-purple-900/35 to-transparent',
    eyebrow: 'bg-white/20 text-white ring-1 ring-white/40',
    tile: 'bg-gradient-to-br from-purple-400 to-fuchsia-700 text-white shadow-lg shadow-fuchsia-700/25',
    solid: 'bg-purple-700 text-white hover:bg-purple-800',
    soft: 'bg-purple-50 text-purple-800 ring-1 ring-purple-200 hover:bg-purple-100',
    accent: 'text-purple-700', outline: 'focus-visible:outline-purple-700', leaf: '#7E22CE',
    tabActive: 'bg-white text-purple-800 shadow-sm ring-1 ring-purple-200',
  }),
} satisfies Record<string, PortalTheme>;

export type PortalThemeId = keyof typeof PORTAL_THEMES;

/** Older pages pass names that predate this palette; map them over. */
export function resolveTheme(theme: string): PortalTheme {
  if (theme in PORTAL_THEMES) return PORTAL_THEMES[theme as PortalThemeId];
  return PORTAL_THEMES.farmer;
}

export { LATTICE_BG } from './lattice';

export const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

// ── Buttons ─────────────────────────────────────────────────────────────────

type BtnVariant = 'solid' | 'soft' | 'ghost' | 'danger' | 'white';

function btnClass(theme: PortalTheme, variant: BtnVariant, size: 'sm' | 'md') {
  const base = `inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl font-semibold no-underline transition hover:no-underline disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS} ${theme.outline}`;
  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm';
  const look = {
    solid: `${theme.solid} shadow-sm`,
    soft: theme.soft,
    ghost: 'text-slate-700 hover:bg-slate-900/5',
    danger: 'bg-white text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50',
    white: 'bg-white/90 text-slate-900 shadow-sm ring-1 ring-white hover:bg-white',
  }[variant];
  return `${base} ${pad} ${look}`;
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  theme: PortalTheme;
  variant?: BtnVariant;
  size?: 'sm' | 'md';
  icon?: LucideIcon;
  /** Render as a link instead of a button. */
  href?: string;
}

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { theme, variant = 'solid', size = 'md', icon: Icon, href, className = '', children, type = 'button', ...rest },
  ref,
) {
  const cls = `${btnClass(theme, variant, size)} ${className}`;
  const content = (
    <>
      {Icon && <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={cls} {...rest}>
      {content}
    </button>
  );
});

// ── Surfaces ────────────────────────────────────────────────────────────────

export const GLASS_CARD =
  'rounded-3xl bg-white/75 backdrop-blur-xl ring-1 ring-slate-900/5 shadow-[0_8px_30px_rgba(15,23,42,0.06)]';

export function Panel({
  title,
  icon: Icon,
  theme,
  action,
  children,
  className = '',
  id,
}: {
  title?: string;
  icon?: LucideIcon;
  theme: PortalTheme;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`${GLASS_CARD} p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && (
            <h2 className="flex items-center gap-2.5 font-sans text-lg font-semibold tracking-tight text-slate-900">
              {Icon && (
                <span className={`grid h-9 w-9 place-items-center rounded-xl ${theme.tile}`}>
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
              )}
              {title}
            </h2>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** Big clickable tile — a link when given `href`, else a button. */
export function Tile({
  theme,
  icon: Icon,
  label,
  hint,
  href,
  onClick,
  badge,
}: {
  theme: PortalTheme;
  icon: LucideIcon;
  label: string;
  hint?: string;
  href?: string;
  onClick?: () => void;
  badge?: string;
}) {
  const cls = `group relative flex h-full flex-col items-start gap-3 rounded-2xl bg-white/80 p-4 [transform-style:preserve-3d] text-left no-underline ring-1 ring-slate-900/5 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:bg-white hover:no-underline hover:shadow-md motion-reduce:hover:translate-y-0 ${FOCUS} ${theme.outline}`;
  const body = (
    <>
      <span data-depth className={`grid h-11 w-11 place-items-center rounded-xl ${theme.tile}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span>
        <span className="block font-semibold text-slate-900">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-slate-600">{hint}</span>}
      </span>
      {badge && (
        <span className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-semibold ${theme.soft}`}>{badge}</span>
      )}
    </>
  );
  return (
    <Tilt3D className="rounded-2xl">
      {href ? (
        <Link href={href} className={cls}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={`${cls} w-full cursor-pointer`}>
          {body}
        </button>
      )}
    </Tilt3D>
  );
}

export function Badge({ tone = 'slate', children }: { tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'violet'; children: ReactNode }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-900 ring-amber-200',
    red: 'bg-rose-50 text-rose-800 ring-rose-200',
    blue: 'bg-sky-50 text-sky-800 ring-sky-200',
    violet: 'bg-violet-50 text-violet-800 ring-violet-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({
  theme,
  icon: Icon,
  title,
  text,
  action,
}: {
  theme: PortalTheme;
  icon: LucideIcon;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/50 px-6 py-10 text-center">
      <ChinarLeaf className="mb-2 h-8 w-8 opacity-60" color={theme.leaf} />
      <Icon className={`h-8 w-8 ${theme.accent}`} aria-hidden />
      <h3 className="mt-3 font-sans text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-600">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ── Forms ───────────────────────────────────────────────────────────────────

export const INPUT =
  'block w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm ring-1 ring-inset ring-slate-200 transition focus:outline-none focus:ring-2 focus:ring-slate-500';

/** Label wrapping its control, so the association needs no ids. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      <span className="mt-1.5 block">{children}</span>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────

/** Native <dialog> modal: focus trap, Escape and inert background for free. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close();
      }}
      className={`m-auto max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] overflow-hidden rounded-3xl bg-white/95 p-0 text-slate-900 shadow-[0_30px_90px_rgba(15,23,42,0.3)] ring-1 ring-slate-900/5 backdrop-blur-2xl backdrop:bg-white/40 backdrop:backdrop-blur-md ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
    >
      <div className="flex max-h-[calc(100svh-2rem)] flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-900/5 px-6 py-4">
          <h2 id={titleId} className="flex items-center gap-2 font-sans text-lg font-semibold text-slate-900">
            <ChinarLeaf className="h-5 w-5" color="#B45309" />
            {title}
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className={`grid h-9 w-9 cursor-pointer place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 ${FOCUS} focus-visible:outline-slate-700`}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-900/5 bg-slate-50/80 px-6 py-4">{footer}</footer>}
      </div>
    </dialog>
  );
}

// ── Misc ────────────────────────────────────────────────────────────────────

export const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export function Divider({ theme }: { theme: PortalTheme }) {
  return (
    <div className="my-8 flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-300 to-transparent" />
      <ChinarLeaf className="h-5 w-5" color={theme.leaf} />
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-300 to-transparent" />
    </div>
  );
}
