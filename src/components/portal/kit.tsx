'use client';

/**
 * Portal kit — the shared, bright building blocks for every role portal
 * (farmer, buyer, kissan tools, cold storage booking, tracking, dealer,
 * expert, mandi helpers, admin) and the orchard tools.
 *
 * The look carries the valley without naming it: season photographs in each
 * hero, a khatamband (carved-ceiling) lattice woven faintly into the canvas, a
 * chinar leaf as the ornament, and every portal in its own season's colours —
 * chinar green, lake teal, harvest amber, glacier blue, Pir Panjal navy, crocus
 * violet. Everything sits on frosted white glass with slate-900 text and
 * saffron-gold hairlines tying the portals together, so contrast holds on
 * every theme.
 *
 * Every class is a complete literal string so Tailwind keeps it.
 */
import Link from 'next/link';

import type { SceneMood } from '@/components/three/ValleyScene';
import { Tilt3D } from '@/components/three/Tilt3D';
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
import { X, type LucideIcon } from 'lucide-react';

import { ChinarLeaf } from '@/components/brand/ChinarLeaf';
import { liftToasts } from '@/lib/client/toastLayer';

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

/**
 * One KashRoot frame for every portal — ivory canvas, saffron-gold hairlines,
 * the copper chinar leaf — and each portal speaks in its own season's colours:
 * the farmer keeps the deep chinar green, the buyer the lake's teal, the cold
 * store its glacier blue, the admin console the Pir Panjal navy.
 */
const BRAND = {
  canvas: 'bg-gradient-to-br from-ivory via-ivory-deep to-[#E3F0E7]',
  heroTint: 'from-[#052E26]/80 via-emerald-950/45 to-transparent',
  eyebrow: 'bg-white/15 text-amber-100 ring-1 ring-amber-200/50',
  tile: 'bg-gradient-to-br from-emerald-700 to-chinar-deep text-emerald-50 shadow-lg shadow-emerald-950/25 ring-1 ring-amber-300/40',
  solid: 'bg-chinar text-white hover:bg-chinar-hover',
  soft: 'bg-chinar-soft text-chinar-hover ring-1 ring-chinar-line hover:bg-emerald-100',
  accent: 'text-emerald-800',
  outline: 'focus-visible:outline-emerald-700',
  leaf: '#B4532A', // copper
  tabActive: 'bg-white text-emerald-900 shadow-sm ring-1 ring-amber-300',
} satisfies Omit<PortalTheme, 'mood' | 'photo' | 'focus'>;

export const PORTAL_THEMES = {
  farmer: T({ ...BRAND, mood: 'spring', photo: '/seasons/spring-meadow.jpg', focus: '50% 30%' }),
  buyer: T({
    ...BRAND,
    mood: 'summer', photo: '/seasons/summer-lake.jpg', focus: '50% 50%',
    canvas: 'bg-gradient-to-br from-ivory via-ivory-deep to-[#E3F1F1]',
    heroTint: 'from-[#04211E]/80 via-teal-900/45 to-transparent',
    eyebrow: 'bg-white/15 text-teal-100 ring-1 ring-teal-200/50',
    tile: 'bg-gradient-to-br from-teal-700 to-teal-900 text-teal-50 shadow-lg shadow-teal-950/25 ring-1 ring-teal-300/40',
    solid: 'bg-teal-800 text-white hover:bg-teal-900',
    soft: 'bg-teal-50 text-teal-800 ring-1 ring-teal-200 hover:bg-teal-100',
    accent: 'text-teal-800',
    outline: 'focus-visible:outline-teal-700',
    tabActive: 'bg-white text-teal-900 shadow-sm ring-1 ring-teal-300',
  }),
  seller: T({
    ...BRAND,
    mood: 'autumn', photo: '/seasons/autumn-garden.jpg', focus: '50% 55%',
    canvas: 'bg-gradient-to-br from-ivory via-ivory-deep to-[#F6ECD9]',
    heroTint: 'from-[#2B1503]/80 via-amber-900/45 to-transparent',
    eyebrow: 'bg-white/15 text-amber-100 ring-1 ring-amber-200/50',
    tile: 'bg-gradient-to-br from-amber-700 to-amber-900 text-amber-50 shadow-lg shadow-amber-950/25 ring-1 ring-amber-300/40',
    solid: 'bg-amber-800 text-white hover:bg-amber-900',
    soft: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100',
    accent: 'text-amber-800',
    outline: 'focus-visible:outline-amber-700',
    tabActive: 'bg-white text-amber-900 shadow-sm ring-1 ring-amber-400',
  }),
  kissan: T({
    ...BRAND,
    mood: 'autumn', photo: '/seasons/autumn-garden.jpg', focus: '50% 40%',
    canvas: 'bg-gradient-to-br from-ivory via-ivory-deep to-[#E9F3E6]',
    heroTint: 'from-[#0B2413]/80 via-green-900/45 to-transparent',
    eyebrow: 'bg-white/15 text-green-100 ring-1 ring-green-200/50',
    tile: 'bg-gradient-to-br from-green-800 to-green-950 text-green-50 shadow-lg shadow-green-950/25 ring-1 ring-green-300/40',
    solid: 'bg-green-800 text-white hover:bg-green-900',
    soft: 'bg-green-50 text-green-800 ring-1 ring-green-200 hover:bg-green-100',
    accent: 'text-green-800',
    outline: 'focus-visible:outline-green-700',
    tabActive: 'bg-white text-green-900 shadow-sm ring-1 ring-green-300',
  }),
  // Cold storage booking: glacier blue — ice chambers under a winter sky, with
  // the saffron hairline kept so it still reads as KashRoot.
  rental: T({
    ...BRAND,
    mood: 'dusk', photo: '/seasons/winter-road.jpg', focus: '50% 20%',
    canvas: 'bg-gradient-to-br from-[#F5FAFD] via-[#EDF5FB] to-[#DDEBF7]',
    heroTint: 'from-[#031E30]/80 via-sky-900/45 to-transparent',
    eyebrow: 'bg-white/15 text-sky-100 ring-1 ring-sky-200/50',
    tile: 'bg-gradient-to-br from-sky-700 to-sky-950 text-sky-50 shadow-lg shadow-sky-950/25 ring-1 ring-sky-300/40',
    solid: 'bg-sky-800 text-white hover:bg-sky-900',
    soft: 'bg-sky-50 text-sky-900 ring-1 ring-sky-200 hover:bg-sky-100',
    accent: 'text-sky-800',
    outline: 'focus-visible:outline-sky-700',
    tabActive: 'bg-white text-sky-900 shadow-sm ring-1 ring-sky-300',
  }),
  provider: T({
    ...BRAND,
    mood: 'winter', photo: '/seasons/winter-lake.jpg', focus: '50% 40%',
    canvas: 'bg-gradient-to-br from-ivory via-ivory-deep to-[#E7EAF8]',
    heroTint: 'from-[#13103A]/80 via-indigo-900/45 to-transparent',
    eyebrow: 'bg-white/15 text-indigo-100 ring-1 ring-indigo-200/50',
    tile: 'bg-gradient-to-br from-indigo-700 to-indigo-950 text-indigo-50 shadow-lg shadow-indigo-950/25 ring-1 ring-indigo-300/40',
    solid: 'bg-indigo-800 text-white hover:bg-indigo-900',
    soft: 'bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200 hover:bg-indigo-100',
    accent: 'text-indigo-800',
    outline: 'focus-visible:outline-indigo-700',
    tabActive: 'bg-white text-indigo-900 shadow-sm ring-1 ring-indigo-300',
  }),
  dealer: T({
    ...BRAND,
    mood: 'autumn', photo: '/seasons/autumn-garden.jpg', focus: '50% 70%',
    canvas: 'bg-gradient-to-br from-ivory via-ivory-deep to-[#F1E9DC]',
    heroTint: 'from-[#221203]/80 via-amber-900/45 to-transparent',
    eyebrow: 'bg-white/15 text-amber-100 ring-1 ring-amber-200/50',
    tile: 'bg-gradient-to-br from-amber-800 to-stone-900 text-amber-50 shadow-lg shadow-stone-950/25 ring-1 ring-amber-300/40',
    solid: 'bg-amber-900 text-white hover:bg-stone-900',
    soft: 'bg-stone-100 text-stone-800 ring-1 ring-stone-300 hover:bg-stone-200',
    accent: 'text-amber-800',
    outline: 'focus-visible:outline-amber-800',
    tabActive: 'bg-white text-stone-900 shadow-sm ring-1 ring-amber-400',
  }),
  admin: T({
    ...BRAND,
    mood: 'dawn', photo: '/seasons/winter-lake.jpg', focus: '50% 30%',
    canvas: 'bg-gradient-to-br from-ivory via-ivory-deep to-[#E3E8F4]',
    heroTint: 'from-[#050E22]/80 via-blue-900/50 to-transparent',
    eyebrow: 'bg-white/15 text-blue-100 ring-1 ring-blue-200/50',
    tile: 'bg-gradient-to-br from-blue-800 to-[#0B1F3A] text-blue-50 shadow-lg shadow-blue-950/25 ring-1 ring-blue-300/40',
    solid: 'bg-blue-900 text-white hover:bg-[#0B1F3A]',
    soft: 'bg-blue-50 text-blue-900 ring-1 ring-blue-200 hover:bg-blue-100',
    accent: 'text-blue-900',
    outline: 'focus-visible:outline-blue-800',
    tabActive: 'bg-white text-blue-900 shadow-sm ring-1 ring-blue-300',
  }),
  tracking: T({
    ...BRAND,
    mood: 'winter', photo: '/seasons/winter-road.jpg', focus: '50% 15%',
    canvas: 'bg-gradient-to-br from-ivory via-ivory-deep to-[#E0EFF9]',
    heroTint: 'from-[#031E30]/80 via-sky-900/45 to-transparent',
    eyebrow: 'bg-white/15 text-sky-100 ring-1 ring-sky-200/50',
    tile: 'bg-gradient-to-br from-sky-700 to-sky-900 text-sky-50 shadow-lg shadow-sky-950/25 ring-1 ring-sky-300/40',
    solid: 'bg-sky-700 text-white hover:bg-sky-800',
    soft: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200 hover:bg-sky-100',
    accent: 'text-sky-800',
    outline: 'focus-visible:outline-sky-700',
    tabActive: 'bg-white text-sky-900 shadow-sm ring-1 ring-sky-300',
  }),
  trader: T({
    ...BRAND,
    mood: 'autumn', photo: '/seasons/autumn-garden.jpg', focus: '50% 45%',
    canvas: 'bg-gradient-to-br from-ivory via-ivory-deep to-[#EFEAF9]',
    heroTint: 'from-[#1E0B33]/80 via-violet-900/45 to-transparent',
    eyebrow: 'bg-white/15 text-violet-100 ring-1 ring-violet-200/50',
    tile: 'bg-gradient-to-br from-violet-700 to-violet-950 text-violet-50 shadow-lg shadow-violet-950/25 ring-1 ring-violet-300/40',
    solid: 'bg-violet-800 text-white hover:bg-violet-900',
    soft: 'bg-violet-50 text-violet-900 ring-1 ring-violet-200 hover:bg-violet-100',
    accent: 'text-violet-800',
    outline: 'focus-visible:outline-violet-700',
    tabActive: 'bg-white text-violet-900 shadow-sm ring-1 ring-violet-300',
  }),
  expert: T({
    ...BRAND,
    mood: 'dusk', photo: '/seasons/summer-lake.jpg', focus: '50% 30%',
    canvas: 'bg-gradient-to-br from-ivory via-ivory-deep to-[#F9EBEF]',
    heroTint: 'from-[#330713]/80 via-rose-900/45 to-transparent',
    eyebrow: 'bg-white/15 text-rose-100 ring-1 ring-rose-200/50',
    tile: 'bg-gradient-to-br from-rose-700 to-rose-950 text-rose-50 shadow-lg shadow-rose-950/25 ring-1 ring-rose-300/40',
    solid: 'bg-rose-700 text-white hover:bg-rose-800',
    soft: 'bg-rose-50 text-rose-900 ring-1 ring-rose-200 hover:bg-rose-100',
    accent: 'text-rose-800',
    outline: 'focus-visible:outline-rose-700',
    tabActive: 'bg-white text-rose-900 shadow-sm ring-1 ring-rose-300',
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

type BtnVariant = 'solid' | 'soft' | 'outline' | 'ghost' | 'danger' | 'white';

/** The look every button shares (also for links and raw buttons styled like one). */
export function btnClass(theme: PortalTheme, variant: BtnVariant, size: 'sm' | 'md') {
  const base = `inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl font-semibold no-underline transition duration-200 hover:no-underline active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0 motion-reduce:transition-none motion-reduce:active:translate-y-0 ${FOCUS} ${theme.outline}`;
  const pad = size === 'sm' ? 'min-h-11 px-3 py-1.5 text-xs' : 'min-h-11 px-4 py-2.5 text-sm';
  const look = {
    solid: `${theme.solid} shadow-sm shadow-slate-900/15`,
    soft: theme.soft,
    outline: `bg-white ${theme.accent} ring-1 ring-[#E8A317]/50 hover:bg-ivory hover:ring-[#E8A317]`,
    ghost: 'text-slate-700 hover:bg-slate-900/5',
    danger: 'bg-white text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50',
    white: 'bg-white/90 text-slate-900 shadow-sm ring-1 ring-white hover:bg-white',
  }[variant];
  return `${base} ${pad} ${look}`;
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Every portal shares one look; kept so older calls still pass it. */
  theme?: PortalTheme;
  variant?: BtnVariant;
  size?: 'sm' | 'md';
  icon?: LucideIcon;
  /** Render as a link instead of a button. */
  href?: string;
}

/**
 * Set by PortalShell around the buttons at the top of a portal page. Those
 * were drawn "white" for the old dark photo hero; on the light title row they
 * take the portal's colours instead: the main one solid, any others soft.
 */
export const TitleAction = createContext<'main' | 'other' | null>(null);

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { theme = PORTAL_THEMES.farmer, variant = 'solid', size = 'md', icon: Icon, href, className = '', children, type = 'button', ...rest },
  ref,
) {
  const title = useContext(TitleAction);
  const look = title && variant === 'white' ? (title === 'main' ? 'solid' : 'soft') : variant;
  const cls = `${btnClass(theme, look, size)} ${title ? 'min-h-11' : ''} ${className}`;
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

// Every card: frosted ivory-white with a saffron-gold hairline.
export const GLASS_CARD =
  'rounded-3xl bg-white/75 backdrop-blur-xl ring-1 ring-[#E8A317]/25 shadow-[0_8px_30px_rgba(15,23,42,0.06)]';

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
    <section id={id} className={`${GLASS_CARD} min-w-0 p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && (
            <h2 className="flex items-center gap-2.5 font-display text-xl font-semibold tracking-tight text-slate-900">
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
  const cls = `group relative flex h-full flex-col items-start gap-3 rounded-2xl bg-white/80 p-4 [transform-style:preserve-3d] text-left no-underline ring-1 ring-[#E8A317]/25 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:ring-[#E8A317]/50 hover:bg-white hover:no-underline hover:shadow-md motion-reduce:hover:translate-y-0 ${FOCUS} ${theme.outline}`;
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
    <div className="relative isolate flex flex-col items-center overflow-hidden rounded-2xl border border-dashed border-[#E8A317]/50 bg-ivory/70 px-6 py-10 text-center">
      <ChinarLeaf className="pointer-events-none absolute -right-5 -top-5 -z-10 h-24 w-24 rotate-12 opacity-[0.12]" color={theme.leaf} />
      <span className={`grid h-14 w-14 place-items-center rounded-2xl ${theme.tile}`}>
        <Icon className="h-7 w-7" aria-hidden />
      </span>
      <h3 className="mt-4 font-display text-xl font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * While a portal waits for its data: grey rows in the shape of the list to come, so nothing jumps
 * when it arrives, with what is loading said in words (and to screen readers). Still for people
 * who turned motion off.
 */
export function Skeleton({ label, rows = 3, height = 'h-14' }: { label: string; rows?: number; height?: 'h-10' | 'h-14' | 'h-24' }) {
  return (
    <div role="status" aria-live="polite" className="space-y-2" data-skeleton>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden className={`${height} animate-pulse rounded-2xl bg-gradient-to-r from-slate-200/70 via-[#FBF8F0] to-slate-200/70 ring-1 ring-[#E8A317]/15 motion-reduce:animate-none`} />
      ))}
    </div>
  );
}

// ── Forms ───────────────────────────────────────────────────────────────────

export const INPUT =
  'block min-h-11 w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 shadow-sm ring-1 ring-inset ring-slate-300 transition duration-200 hover:ring-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:bg-slate-50 disabled:text-slate-500 motion-reduce:transition-none';

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
    if (open && !dialog.open) {
      dialog.showModal();
      liftToasts();
    } else if (!open && dialog.open) dialog.close();
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
      className={`kr-sheet m-auto max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] overflow-hidden rounded-3xl bg-white/95 p-0 text-slate-900 shadow-[0_30px_90px_rgba(15,23,42,0.3)] ring-1 ring-[#E8A317]/25 backdrop-blur-2xl backdrop:bg-slate-900/30 backdrop:backdrop-blur-sm max-sm:mb-0 max-sm:max-h-[92svh] max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none ${wide ? 'max-w-3xl' : 'max-w-lg'}[will-change:transform,opacity][transform:translate3d(0,0,0)]`}
    >
      <div className="flex max-h-[calc(100svh-2rem)] flex-col max-sm:max-h-[92svh]">
        <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-300 sm:hidden" />
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-900/5 px-6 py-4">
          <h2 id={titleId} className="flex items-center gap-2 font-display text-xl font-semibold text-slate-900">
            <ChinarLeaf className="h-5 w-5" color="#B45309" />
            {title}
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className={`grid h-11 w-11 cursor-pointer place-items-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 ${FOCUS} focus-visible:outline-slate-700`}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-900/5 bg-ivory/80 px-6 py-4">{footer}</footer>}
      </div>
    </dialog>
  );
}

// ── Page header ─────────────────────────────────────────────────────────────

/** A page's title row: a small eyebrow, the title in the display serif, one line of description, its main buttons. */
export function PageHeader({
  theme = PORTAL_THEMES.farmer,
  eyebrow,
  title,
  description,
  actions,
  actionsRef,
}: {
  theme?: PortalTheme;
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  actionsRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${theme.soft}`}>{eyebrow}</p>}
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-slate-900 [text-wrap:balance] sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-600">{description}</p>}
        <span aria-hidden className="mt-4 block h-px w-24 bg-gradient-to-r from-[#E8A317] to-transparent" />
      </div>
      {actions && (
        <div ref={actionsRef} data-kr-title-actions className="flex shrink-0 flex-wrap gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

// ── Numbers ─────────────────────────────────────────────────────────────────

/** One number on a card: its name, the value (tabular figures), one line of context. */
export function KpiTile({ label, value, hint, icon: Icon, theme = PORTAL_THEMES.farmer }: { label: string; value: ReactNode; hint?: string; icon?: LucideIcon; theme?: PortalTheme }) {
  return (
    <div className="relative rounded-2xl bg-white/85 p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)] ring-1 ring-[#E8A317]/25 backdrop-blur sm:p-5">
      <p className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-600">
        {label}
        {Icon && (
          <span className={`grid h-8 w-8 place-items-center rounded-lg ${theme.tile}`}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
      </p>
      <p className="mt-2 text-3xl font-bold leading-tight tracking-tight text-slate-900 tabular-nums">{value}</p>
      {hint && <p className={`mt-1.5 text-xs font-medium ${theme.accent}`}>{hint}</p>}
    </div>
  );
}

// ── Tables ──────────────────────────────────────────────────────────────────

/** Tables: a framed, sideways-scrolling box; an ivory heading row; tabular figures; a soft row hover. */
export const TABLE = {
  wrap: 'overflow-x-auto rounded-2xl bg-white/85 ring-1 ring-[#E8A317]/25',
  table: 'w-full text-left text-sm tabular-nums',
  head: 'bg-ivory text-xs font-semibold uppercase tracking-wider text-slate-600',
  th: 'px-4 py-3',
  body: 'divide-y divide-slate-900/5',
  row: 'transition-colors hover:bg-ivory/60',
  td: 'px-4 py-3 text-slate-800',
} as const;

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
