/**
 * KashRoot Design Tokens
 *
 * Single source of truth for all visual decisions.
 * These values are consumed by:
 *   - tailwind.config.ts (theme extension)
 *   - globals.css (CSS custom properties, light + dark)
 *   - Any component that needs token references in JS (e.g. Recharts, react-spring)
 *
 * PALETTE RATIONALE
 * -----------------
 * Primary   : Saffron Gold   — warmth, harvest, trust (#F5A623 family)
 * Secondary : Walnut Brown   — earth, craft, stability (#8B5E3C family)
 * Success   : Orchard Green  — growth, verified, go (#3A8C52 family)
 * Warning   : Amber          — caution, customs, pending (#D97706 family)
 * Danger    : Terracotta Red — error, dispute, block (#C0392B family)
 * Neutral   : Deep Slate     — text, structure, UI chrome (#4A5568 family)
 *
 * TYPOGRAPHY
 * ----------
 * Display/Headings : Fraunces (serif, evokes craft & tradition)
 * Body             : Inter (sans-serif, highly legible at small sizes)
 * Mono/Code        : JetBrains Mono (data, IDs, amounts)
 *
 * SPACING
 * -------
 * 4px base unit (Tailwind default). Custom named steps added for
 * semantic use (section padding, card gap, etc.).
 */

// ─── COLOR SCALES ────────────────────────────────────────────────────────────
// Each scale: 50 (lightest) → 950 (darkest). CSS var names: --kr-<role>-<step>

export const colors = {
  // Primary: Saffron Gold
  primary: {
    50:  '#FFF8EC',
    100: '#FEECC8',
    200: '#FDD98F',
    300: '#FCC057',
    400: '#FAA825',
    500: '#F5A623', // brand saffron
    600: '#D4831A',
    700: '#A96112',
    800: '#7E440D',
    900: '#542C08',
    950: '#2B1504',
  },

  // Secondary: Walnut Brown
  secondary: {
    50:  '#F8F3EF',
    100: '#EDE0D4',
    200: '#D8BFA8',
    300: '#C09D7B',
    400: '#A47A55',
    500: '#8B5E3C', // brand walnut
    600: '#724B2F',
    700: '#5A3A23',
    800: '#422A19',
    900: '#2B1B0E',
    950: '#150D07',
  },

  // Success: Orchard Green
  success: {
    50:  '#EDFAF3',
    100: '#D0F4E1',
    200: '#A1E9C4',
    300: '#6DD9A4',
    400: '#43C484',
    500: '#3A8C52', // brand orchard
    600: '#2E7041',
    700: '#225531',
    800: '#173B22',
    900: '#0C2113',
    950: '#061009',
  },

  // Warning: Amber
  warning: {
    50:  '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#D97706', // amber 600 shifted
    600: '#B45309',
    700: '#92400E',
    800: '#78350F',
    900: '#451A03',
    950: '#27100A',
  },

  // Danger: Terracotta Red
  danger: {
    50:  '#FDF2F0',
    100: '#FBE0DB',
    200: '#F7BEB6',
    300: '#F19389',
    400: '#E8625A',
    500: '#C0392B', // brand terracotta
    600: '#9E2D22',
    700: '#7C221A',
    800: '#5B1812',
    900: '#3A0E0A',
    950: '#1E0705',
  },

  // Neutral: Deep Slate
  neutral: {
    0:   '#FFFFFF',
    50:  '#F7F8FA',
    100: '#EDEEF2',
    200: '#D6D9E0',
    300: '#B8BCC8',
    400: '#8E94A6',
    500: '#636B80',
    600: '#4A5568', // brand slate
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
    950: '#030712',
    1000: '#000000',
  },
} as const;

// ─── SEMANTIC ALIASES ─────────────────────────────────────────────────────────
// What each token MEANS, not what it looks like. Used in components.

export const semanticTokens = {
  light: {
    // Backgrounds
    'bg-page':        colors.neutral[50],
    'bg-surface':     colors.neutral[0],
    'bg-sunken':      colors.neutral[100],
    'bg-overlay':     colors.neutral[0],

    // Text
    'text-primary':   colors.neutral[900],
    'text-secondary': colors.neutral[600],
    'text-disabled':  colors.neutral[400],
    'text-inverse':   colors.neutral[0],
    'text-brand':     colors.primary[600],
    'text-success':   colors.success[700],
    'text-warning':   colors.warning[700],
    'text-danger':    colors.danger[600],

    // Borders
    'border-default': colors.neutral[200],
    'border-strong':  colors.neutral[400],
    'border-brand':   colors.primary[400],
    'border-focus':   colors.primary[500],
    'border-danger':  colors.danger[400],

    // Brand fills
    'fill-brand':          colors.primary[500],
    'fill-brand-hover':    colors.primary[600],
    'fill-brand-active':   colors.primary[700],
    'fill-brand-subtle':   colors.primary[50],
    'fill-secondary':      colors.secondary[500],
    'fill-secondary-hover': colors.secondary[600],
    'fill-success':        colors.success[500],
    'fill-warning':        colors.warning[500],
    'fill-danger':         colors.danger[500],
    'fill-danger-hover':   colors.danger[600],

    // Status badges
    'badge-draft-bg':      colors.neutral[100],
    'badge-draft-text':    colors.neutral[600],
    'badge-published-bg':  colors.success[50],
    'badge-published-text': colors.success[700],
    'badge-pending-bg':    colors.warning[50],
    'badge-pending-text':  colors.warning[700],
    'badge-rejected-bg':   colors.danger[50],
    'badge-rejected-text': colors.danger[700],
  },
  dark: {
    'bg-page':        colors.neutral[950],
    'bg-surface':     colors.neutral[900],
    'bg-sunken':      colors.neutral[800],
    'bg-overlay':     colors.neutral[800],

    'text-primary':   colors.neutral[50],
    'text-secondary': colors.neutral[400],
    'text-disabled':  colors.neutral[600],
    'text-inverse':   colors.neutral[900],
    'text-brand':     colors.primary[300],
    'text-success':   colors.success[300],
    'text-warning':   colors.warning[300],
    'text-danger':    colors.danger[300],

    'border-default': colors.neutral[700],
    'border-strong':  colors.neutral[500],
    'border-brand':   colors.primary[500],
    'border-focus':   colors.primary[400],
    'border-danger':  colors.danger[500],

    'fill-brand':          colors.primary[500],
    'fill-brand-hover':    colors.primary[400],
    'fill-brand-active':   colors.primary[300],
    'fill-brand-subtle':   colors.primary[950],
    'fill-secondary':      colors.secondary[400],
    'fill-secondary-hover': colors.secondary[300],
    'fill-success':        colors.success[500],
    'fill-warning':        colors.warning[500],
    'fill-danger':         colors.danger[500],
    'fill-danger-hover':   colors.danger[400],

    'badge-draft-bg':      colors.neutral[800],
    'badge-draft-text':    colors.neutral[300],
    'badge-published-bg':  colors.success[950],
    'badge-published-text': colors.success[300],
    'badge-pending-bg':    colors.warning[950],
    'badge-pending-text':  colors.warning[300],
    'badge-rejected-bg':   colors.danger[950],
    'badge-rejected-text': colors.danger[300],
  },
} as const;

// ─── TYPOGRAPHY ───────────────────────────────────────────────────────────────

export const typography = {
  fontFamily: {
    display:  ['Fraunces', 'Georgia', 'serif'],
    heading:  ['Fraunces', 'Georgia', 'serif'],
    body:     ['Inter', 'system-ui', 'sans-serif'],
    mono:     ['JetBrains Mono', 'Menlo', 'monospace'],
  },
  fontSize: {
    'display-2xl': ['4.5rem',   { lineHeight: '1.1',  letterSpacing: '-0.02em', fontWeight: '700' }],
    'display-xl':  ['3.75rem',  { lineHeight: '1.1',  letterSpacing: '-0.02em', fontWeight: '700' }],
    'display-lg':  ['3rem',     { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '700' }],
    'h1':          ['2.25rem',  { lineHeight: '1.2',  letterSpacing: '-0.01em', fontWeight: '700' }],
    'h2':          ['1.875rem', { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '600' }],
    'h3':          ['1.5rem',   { lineHeight: '1.3',  letterSpacing: '0',       fontWeight: '600' }],
    'h4':          ['1.25rem',  { lineHeight: '1.4',  letterSpacing: '0',       fontWeight: '600' }],
    'body-lg':     ['1.125rem', { lineHeight: '1.6',  letterSpacing: '0',       fontWeight: '400' }],
    'body':        ['1rem',     { lineHeight: '1.6',  letterSpacing: '0',       fontWeight: '400' }],
    'body-sm':     ['0.875rem', { lineHeight: '1.5',  letterSpacing: '0',       fontWeight: '400' }],
    'caption':     ['0.75rem',  { lineHeight: '1.4',  letterSpacing: '0.01em',  fontWeight: '400' }],
    'overline':    ['0.75rem',  { lineHeight: '1.4',  letterSpacing: '0.08em',  fontWeight: '600' }],
    'label':       ['0.875rem', { lineHeight: '1.4',  letterSpacing: '0',       fontWeight: '500' }],
    'mono':        ['0.875rem', { lineHeight: '1.5',  letterSpacing: '0',       fontWeight: '400' }],
  },
} as const;

// ─── SPACING ──────────────────────────────────────────────────────────────────
// Named semantic steps on top of Tailwind's default 4px-base scale.

export const spacing = {
  // Layout
  'section-y':  '5rem',    // 80px — vertical section padding
  'section-x':  '1.5rem',  // 24px — horizontal page padding (mobile)
  'section-x-md': '2rem',  // 32px — horizontal page padding (tablet)
  'section-x-lg': '4rem',  // 64px — horizontal page padding (desktop)
  'container':  '80rem',   // 1280px max-width

  // Cards & panels
  'card-p':     '1.5rem',  // 24px card padding
  'card-p-sm':  '1rem',    // 16px compact card padding
  'card-gap':   '1rem',    // 16px gap between cards
  'card-gap-lg': '1.5rem', // 24px gap between cards (wider)

  // Form
  'input-h':    '2.75rem', // 44px — meets WCAG touch target
  'input-h-sm': '2.25rem', // 36px compact
  'input-px':   '0.875rem',

  // Component
  'btn-px':     '1.25rem',
  'btn-py':     '0.625rem',
  'icon-sm':    '1rem',
  'icon-md':    '1.25rem',
  'icon-lg':    '1.5rem',
} as const;

// ─── BORDER RADIUS ────────────────────────────────────────────────────────────

/*
 * Rectangular geometry — a deliberate design decision, not an oversight.
 *
 * The interface uses strictly sharp rectangles: no rounded bubbles anywhere in
 * the structural furniture (cards, panels, buttons, inputs, badges, modals).
 * The only element allowed to be round is `full`, which exists for genuinely
 * circular things — avatars, status dots, spinners.
 *
 * Every step maps to 0 rather than deleting the scale, so existing `rounded-*`
 * call sites keep compiling and simply render square.
 */
export const borderRadius = {
  sm:   '0px',  // tags, badges
  DEFAULT: '0px', // inputs, buttons
  md:   '0px',  // cards
  lg:   '0px',  // panels
  xl:   '0px',  // modals
  full: '9999px', // the one exception — circles only
} as const;

// ─── SHADOWS ──────────────────────────────────────────────────────────────────

export const boxShadow = {
  'card':     '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06)',
  'card-md':  '0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.06)',
  'card-lg':  '0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.06)',
  'overlay':  '0 20px 25px -5px rgba(0,0,0,0.12), 0 8px 10px -6px rgba(0,0,0,0.08)',
  'brand':    '0 0 0 3px rgba(245,166,35,0.3)',  // focus ring — saffron glow
  'danger':   '0 0 0 3px rgba(192,57,43,0.25)', // focus ring — danger
} as const;

// ─── ANIMATION ────────────────────────────────────────────────────────────────

export const animation = {
  duration: {
    instant:  '50ms',
    fast:     '150ms',
    default:  '200ms',
    slow:     '300ms',
    slower:   '500ms',
  },
  easing: {
    default:  'cubic-bezier(0.4, 0, 0.2, 1)',
    in:       'cubic-bezier(0.4, 0, 1, 1)',
    out:      'cubic-bezier(0, 0, 0.2, 1)',
    spring:   'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
} as const;

// ─── BREAKPOINTS ──────────────────────────────────────────────────────────────
// Matches Tailwind's default but named semantically for documentation clarity.

export const breakpoints = {
  sm:  '640px',   // large phones
  md:  '768px',   // tablets
  lg:  '1024px',  // laptops
  xl:  '1280px',  // desktops
  '2xl': '1536px', // wide
} as const;

// ─── Z-INDEX ──────────────────────────────────────────────────────────────────

export const zIndex = {
  base:    0,
  raised:  10,
  dropdown: 100,
  sticky:  200,
  overlay: 300,
  modal:   400,
  toast:   500,
  tooltip: 600,
} as const;
