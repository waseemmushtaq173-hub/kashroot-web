'use client';

/**
 * Portal kit — the shared, bright building blocks for every role portal
 * (farmer, buyer, kissan tools, cold storage booking, tracking, dealer,
 * expert, mandi helpers, admin) and the orchard tools.
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
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
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
 * One KashRoot look for every portal: deep chinar-green and saffron gold on
 * ivory, with the copper chinar leaf. Portals differ only by their season
 * photograph and the valley's mood, so the whole app reads as one.
 */
const BRAND = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#EAF3EE]',
  heroTint: 'from-[#052E26]/80 via-emerald-950/45 to-transparent',
  eyebrow: 'bg-white/15 text-amber-100 ring-1 ring-amber-200/50',
  tile: 'bg-gradient-to-br from-emerald-700 to-[#052E26] text-amber-200 shadow-lg shadow-emerald-950/25 ring-1 ring-amber-300/40',
  solid: 'bg-emerald-800 text-white hover:bg-emerald-900',
  soft: 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100',
  accent: 'text-emerald-800',
  outline: 'focus-visible:outline-emerald-700',
  leaf: '#B4532A',
  tabActive: 'bg-white text-emerald-900 shadow-sm ring-1 ring-amber-300',
} satisfies Omit<PortalTheme, 'mood' | 'photo' | 'focus'>;

export const PORTAL_THEMES = {
  farmer: T({ ...BRAND, mood: 'spring', photo: '/seasons/spring-meadow.jpg', focus: '50% 30%' }),
  buyer: T({ ...BRAND, mood: 'summer', photo: '/seasons/summer-lake.jpg', focus: '50% 50%' }),
  seller: T({ ...BRAND, mood: 'autumn', photo: '/seasons/autumn-garden.jpg', focus: '50% 55%' }),
  kissan: T({ ...BRAND, mood: 'autumn', photo: '/seasons/autumn-garden.jpg', focus: '50% 40%' }),
  rental: T({ ...BRAND, mood: 'dusk', photo: '/seasons/winter-road.jpg', focus: '50% 20%' }),
  provider: T({ ...BRAND, mood: 'winter', photo: '/seasons/winter-lake.jpg', focus: '50% 40%' }),
  dealer: T({ ...BRAND, mood: 'autumn', photo: '/seasons/autumn-garden.jpg', focus: '50% 70%' }),
  admin: T({ ...BRAND, mood: 'dawn', photo: '/seasons/winter-lake.jpg', focus: '50% 30%' }),
  tracking: T({ ...BRAND, mood: 'winter', photo: '/seasons/winter-road.jpg', focus: '50% 15%' }),
  trader: T({ ...BRAND, mood: 'autumn', photo: '/seasons/autumn-garden.jpg', focus: '50% 45%' }),
  expert: T({ ...BRAND, mood: 'dusk', photo: '/seasons/summer-lake.jpg', focus: '50% 30%' }),
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

/**
 * Set by PortalShell around the buttons at the top of a portal page. Those
 * were drawn "white" for the old dark photo hero; on the light title row they
 * take the portal's colours instead: the main one solid, any others soft.
 */
export const TitleAction = createContext<'main' | 'other' | null>(null);

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { theme, variant = 'solid', size = 'md', icon: Icon, href, className = '', children, type = 'button', ...rest },
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
    <section id={id} className={`${GLASS_CARD} min-w-0 p-5 sm:p-6 ${className}`}>
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
