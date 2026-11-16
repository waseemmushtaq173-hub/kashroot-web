'use client';

/**
 * Portal kit — the shared, bright building blocks for every role portal
 * (farmer, buyer, kissan tools, cold storage booking, tracking, dealer,
 * expert, mandi helpers, admin) and the orchard tools.
 *
 * One cohesive KashRoot identity: a mist page, white tactile cards (.kr-card
 * look) with soft #E2EAE5 borders, forest green buttons and icon tiles on soft
 * green, champagne gold hairlines and badges, a khatamband (carved-ceiling)
 * lattice woven faintly into the canvas and the chinar leaf as the ornament.
 * Text is ink on white, so contrast holds on every portal; a portal's own
 * identity is only its icon, its badge and its 3D valley scene.
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
 * One KashRoot frame for every portal: a cool mist page (#F4F7F8), forest green (#3730A3 / #1E1B4B)
 * headers, sidebars and primary actions, soft green (#EEF0FF) panels, champagne gold (#C6A45B)
 * accents, ink text (#25332F) and #E2EAE5 borders. A portal keeps a subtle identity of its own
 * through its icon, its badge word and the season of its 3D valley scene (`mood`), nothing louder.
 * Gold is for lines and badges; text on gold-tinted surfaces is champagne-deep (6.3:1).
 */
const BRAND = {
  canvas: 'bg-mist',
  heroTint: 'from-forest-deep/80 via-forest/45 to-transparent',
  eyebrow: 'bg-forest-soft text-forest ring-1 ring-champagne/60',
  // The forest and gold icon badge on its own ledge (globals.css .kr-icon-badge).
  tile: 'kr-icon-badge',
  // A flat-fronted, bevelled green for chips and tabs; buttons (Btn) use the full tactile .kr-btn-primary.
  solid: 'bg-gradient-to-b from-forest-mid to-forest text-white ring-1 ring-forest-deep shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_2px_0_#1E1B4B] hover:from-[#2F7A60] hover:to-[#1B5A47]',
  soft: 'bg-forest-soft text-forest ring-1 ring-forest-line hover:bg-[#DDEBE3]',
  accent: 'text-forest',
  outline: 'focus-visible:outline-forest',
  leaf: '#C6A45B', // champagne gold
  tabActive: 'bg-forest text-white ring-1 ring-forest-deep shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_3px_0_#C6A45B]',
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

type BtnVariant = 'solid' | 'soft' | 'outline' | 'ghost' | 'danger' | 'white';

/** The look every button shares (also for links and raw buttons styled like one). */
export function btnClass(theme: PortalTheme, variant: BtnVariant, size: 'sm' | 'md') {
  // solid is the tactile .kr-btn-primary, soft and outline the tactile .kr-btn-secondary (globals.css): bevel, lift on hover, sink on press.
  const shape = variant === 'solid' ? 'kr-btn-primary' : variant === 'outline' || variant === 'soft' ? 'kr-btn-secondary' : 'rounded-xl font-semibold transition duration-200 active:translate-y-px';
  const base = `${shape} inline-flex cursor-pointer items-center justify-center gap-2 no-underline hover:no-underline disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:translate-y-0 ${FOCUS} ${theme.outline}`;
  const pad = size === 'sm' ? 'min-h-11 px-3 py-1.5 text-xs' : 'min-h-11 px-4 py-2.5 text-sm';
  const look = {
    solid: '',
    soft: '',
    outline: '',
    ghost: 'text-ink-soft hover:bg-forest-soft hover:text-ink',
    danger: 'bg-white text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50',
    white: 'bg-white/10 text-white shadow-sm ring-1 ring-white/40 hover:bg-white/20',
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
  // On the forest hero banner: the main button is the light sage one (it stands out on green); a solid green one would vanish.
  const look = title && (variant === 'white' || variant === 'solid') ? (title === 'main' ? 'soft' : 'white') : variant;
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

// Every card: white, a soft #E2EAE5 border and the layered card shadow (globals.css .kr-card), not lifted by hover.
export const GLASS_CARD = 'kr-card kr-card-flat rounded-3xl';

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
            <h2 className="flex items-center gap-2.5 font-display text-xl font-semibold tracking-tight text-ink">
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
  const cls = `kr-card kr-card-interactive group relative flex h-full flex-col items-start gap-3 rounded-2xl p-4 [transform-style:preserve-3d] text-left no-underline hover:no-underline ${FOCUS} ${theme.outline}`;
  const body = (
    <>
      <span data-depth className={`grid h-11 w-11 place-items-center rounded-xl ${theme.tile}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span>
        <span className="block font-semibold text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-ink-soft">{hint}</span>}
      </span>
      {badge && (
        <span className="absolute right-3 top-3 rounded-full border border-champagne/60 bg-champagne-soft px-2 py-0.5 text-[11px] font-semibold text-champagne-deep">{badge}</span>
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
  // green = KashRoot forest, violet (ownership, staff) = champagne gold; amber, red and blue keep their plain meaning.
  const tones = {
    slate: 'bg-[#F1F5F3] text-ink-soft ring-forest-line',
    green: 'bg-forest-soft text-forest ring-forest-line',
    amber: 'bg-amber-50 text-amber-900 ring-amber-200',
    red: 'bg-rose-50 text-rose-800 ring-rose-200',
    blue: 'bg-forest-soft text-forest ring-forest-line',
    violet: 'bg-champagne-soft text-champagne-deep ring-champagne/60',
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
    <div className="relative isolate flex flex-col items-center overflow-hidden rounded-2xl border border-dashed border-champagne/70 bg-forest-soft/60 px-6 py-10 text-center">
      <ChinarLeaf className="pointer-events-none absolute -right-5 -top-5 -z-10 h-24 w-24 rotate-12 opacity-[0.16]" color={theme.leaf} />
      <span className={`grid h-14 w-14 place-items-center rounded-2xl ${theme.tile}`}>
        <Icon className="h-7 w-7" aria-hidden />
      </span>
      <h3 className="mt-4 font-display text-xl font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-soft">{text}</p>
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
        <div key={i} aria-hidden className={`${height} animate-pulse rounded-2xl bg-gradient-to-r from-forest-soft via-white to-forest-soft ring-1 ring-forest-line motion-reduce:animate-none`} />
      ))}
    </div>
  );
}

// ── Forms ───────────────────────────────────────────────────────────────────

export const INPUT =
  'block min-h-11 w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-500 shadow-sm ring-1 ring-inset ring-slate-300 transition duration-200 hover:ring-slate-400 focus:outline-none focus:ring-2 focus:ring-forest disabled:bg-slate-50 disabled:text-slate-500 motion-reduce:transition-none';

/** Label wrapping its control, so the association needs no ids. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink">{label}</span>
      <span className="mt-1.5 block">{children}</span>
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
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
      className={`kr-sheet m-auto max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] overflow-hidden rounded-3xl border border-forest-line bg-white p-0 text-ink shadow-[inset_0_1px_0_#fff,0_30px_90px_rgba(30, 27, 75,0.3)] backdrop:bg-forest-deep/40 backdrop:backdrop-blur-sm max-sm:mb-0 max-sm:max-h-[92svh] max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none ${wide ? 'max-w-3xl' : 'max-w-lg'}[will-change:transform,opacity][transform:translate3d(0,0,0)]`}
    >
      <div className="flex max-h-[calc(100svh-2rem)] flex-col max-sm:max-h-[92svh]">
        <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-300 sm:hidden" />
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-forest-line px-6 py-4">
          <h2 id={titleId} className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
            <ChinarLeaf className="h-5 w-5" color="#C6A45B" />
            {title}
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className={`grid h-11 w-11 cursor-pointer place-items-center rounded-full text-ink-soft transition hover:bg-forest-soft hover:text-ink ${FOCUS} focus-visible:outline-forest`}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-forest-line bg-mist px-6 py-4">{footer}</footer>}
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
    // The forest hero banner every portal page opens with (globals.css .kr-hero): white title, gold line under it.
    <div className="kr-hero relative isolate flex flex-col gap-5 overflow-hidden rounded-3xl p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
      <ChinarLeaf className="pointer-events-none absolute -right-6 -top-8 -z-10 h-40 w-40 rotate-12 opacity-[0.14]" color={theme.leaf} />
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className="inline-flex items-center rounded-full bg-forest-soft px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-forest ring-1 ring-[#C6A45B]">{eyebrow}</p>}
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white [text-wrap:balance] sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-base leading-relaxed text-[#D9E8E0]">{description}</p>}
        <span aria-hidden className="mt-4 block h-0.5 w-24 rounded-full bg-gradient-to-r from-champagne to-transparent" />
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
    // In a row these alternate forest green and soft sage (globals.css .kr-kpi), each on its own ledge.
    <div className="kr-kpi relative rounded-2xl p-4 sm:p-5">
      <p className="kr-kpi-label flex items-center justify-between gap-2 text-sm font-semibold">
        {label}
        {Icon && (
          <span className={`grid h-8 w-8 place-items-center rounded-lg ${theme.tile}`}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
      </p>
      <p className="kr-kpi-value mt-2 text-3xl font-bold leading-tight tracking-tight tabular-nums">{value}</p>
      {hint && <p className="kr-kpi-hint mt-1.5 text-xs font-medium">{hint}</p>}
    </div>
  );
}

// ── Tables ──────────────────────────────────────────────────────────────────

/** Tables: a framed, sideways-scrolling box; a soft-green heading row; tabular figures; a soft row hover. */
export const TABLE = {
  wrap: 'overflow-x-auto rounded-2xl border border-forest-line bg-white [box-shadow:var(--kr-card-shadow)]',
  table: 'w-full text-left text-sm tabular-nums',
  head: 'bg-forest-soft text-xs font-semibold uppercase tracking-wider text-forest',
  th: 'px-4 py-3',
  body: 'divide-y divide-forest-line',
  row: 'transition-colors hover:bg-forest-soft/50',
  td: 'px-4 py-3 text-ink',
} as const;

// ── Misc ────────────────────────────────────────────────────────────────────

export const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export function Divider({ theme }: { theme: PortalTheme }) {
  return (
    <div className="my-8 flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-champagne to-transparent" />
      <ChinarLeaf className="h-5 w-5" color={theme.leaf} />
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-champagne to-transparent" />
    </div>
  );
}
