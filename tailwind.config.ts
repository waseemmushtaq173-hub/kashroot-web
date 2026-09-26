import type { Config } from 'tailwindcss';
import { colors, typography, spacing, borderRadius, boxShadow, zIndex } from './src/styles/design-tokens';

/**
 * KashRoot Tailwind Config
 *
 * Extends (does NOT replace) Tailwind defaults so we retain utility classes
 * like `p-4`, `m-2`, etc. alongside our semantic token classes.
 *
 * THEME CONVENTION
 * ----------------
 * Colors:     kr-{role}-{step}      e.g. bg-kr-primary-500
 * Semantic:   kr-{purpose}          e.g. bg-kr-fill-brand, text-kr-text-secondary
 * Spacing:    kr-{name}             e.g. p-kr-card-p, px-kr-section-x
 * Shadows:    kr-{name}             e.g. shadow-kr-card
 *
 * DARK MODE
 * ---------
 * strategy: 'class' — toggled by adding/removing the `dark` class on <html>.
 * All semantic color tokens have dark variants defined in globals.css via
 * CSS custom properties. Use `dark:` prefix in Tailwind utilities.
 *
 * COMPONENT STATES (defined as reusable layer classes in globals.css)
 * -----------------
 * .kr-btn-primary   — hover / focus-visible / active / disabled / loading
 * .kr-input         — default / focus / error / disabled
 * .kr-card          — default / hover / active
 * .kr-badge-*       — draft / published / pending / rejected
 *
 * Do NOT define one-off state styles per page. Always use these shared classes.
 */

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],

  theme: {
    extend: {
      // ── COLORS ───────────────────────────────────────────────────────────
      colors: {
        // Raw palette scales (accessible as bg-kr-primary-500, etc.)
        'kr-primary':   colors.primary,
        'kr-secondary': colors.secondary,
        'kr-success':   colors.success,
        'kr-warning':   colors.warning,
        'kr-danger':    colors.danger,
        'kr-neutral':   colors.neutral,

        // Semantic tokens via CSS variables — auto-switch light/dark
        // Usage: bg-kr-bg-page, text-kr-text-primary, border-kr-border-brand
        kr: {
          // Backgrounds
          'bg-page':          'var(--kr-bg-page)',
          'bg-surface':       'var(--kr-bg-surface)',
          'bg-sunken':        'var(--kr-bg-sunken)',
          'bg-overlay':       'var(--kr-bg-overlay)',
          // Text
          'text-primary':     'var(--kr-text-primary)',
          'text-secondary':   'var(--kr-text-secondary)',
          'text-disabled':    'var(--kr-text-disabled)',
          'text-inverse':     'var(--kr-text-inverse)',
          'text-brand':       'var(--kr-text-brand)',
          'text-success':     'var(--kr-text-success)',
          'text-warning':     'var(--kr-text-warning)',
          'text-danger':      'var(--kr-text-danger)',
          // Borders
          'border-default':   'var(--kr-border-default)',
          'border-strong':    'var(--kr-border-strong)',
          'border-brand':     'var(--kr-border-brand)',
          'border-focus':     'var(--kr-border-focus)',
          'border-danger':    'var(--kr-border-danger)',
          // Fills
          'fill-brand':       'var(--kr-fill-brand)',
          'fill-brand-hover': 'var(--kr-fill-brand-hover)',
          'fill-brand-active':'var(--kr-fill-brand-active)',
          'fill-brand-subtle':'var(--kr-fill-brand-subtle)',
          'fill-secondary':   'var(--kr-fill-secondary)',
          'fill-success':     'var(--kr-fill-success)',
          'fill-warning':     'var(--kr-fill-warning)',
          'fill-danger':      'var(--kr-fill-danger)',
          'fill-danger-hover':'var(--kr-fill-danger-hover)',
          // Badges
          'badge-draft-bg':        'var(--kr-badge-draft-bg)',
          'badge-draft-text':      'var(--kr-badge-draft-text)',
          'badge-published-bg':    'var(--kr-badge-published-bg)',
          'badge-published-text':  'var(--kr-badge-published-text)',
          'badge-pending-bg':      'var(--kr-badge-pending-bg)',
          'badge-pending-text':    'var(--kr-badge-pending-text)',
          'badge-rejected-bg':     'var(--kr-badge-rejected-bg)',
          'badge-rejected-text':   'var(--kr-badge-rejected-text)',
        },
      },

      // ── TYPOGRAPHY ───────────────────────────────────────────────────────
      fontFamily: {
        display: typography.fontFamily.display,
        heading:  typography.fontFamily.heading,
        sans:     typography.fontFamily.body,
        body:     typography.fontFamily.body,
        mono:     typography.fontFamily.mono,
      },
      fontSize: typography.fontSize as any,

      // ── SPACING ────────────────────────────────────────────────────────────
      spacing: {
        // Named semantic steps (kr-* prefix to avoid collisions)
        'kr-section-y':    spacing['section-y'],
        'kr-section-x':    spacing['section-x'],
        'kr-section-x-md': spacing['section-x-md'],
        'kr-section-x-lg': spacing['section-x-lg'],
        'kr-card-p':       spacing['card-p'],
        'kr-card-p-sm':    spacing['card-p-sm'],
        'kr-card-gap':     spacing['card-gap'],
        'kr-card-gap-lg':  spacing['card-gap-lg'],
        'kr-input-h':      spacing['input-h'],
        'kr-input-h-sm':   spacing['input-h-sm'],
        'kr-input-px':     spacing['input-px'],
        'kr-btn-px':       spacing['btn-px'],
        'kr-btn-py':       spacing['btn-py'],
        'kr-icon-sm':      spacing['icon-sm'],
        'kr-icon-md':      spacing['icon-md'],
        'kr-icon-lg':      spacing['icon-lg'],
      },

      maxWidth: {
        'kr-container': spacing['container'],
      },

      // ── BORDER RADIUS ────────────────────────────────────────────────────
      borderRadius,

      // ── BOX SHADOW ─────────────────────────────────────────────────────────
      boxShadow: {
        'kr-card':    boxShadow['card'],
        'kr-card-md': boxShadow['card-md'],
        'kr-card-lg': boxShadow['card-lg'],
        'kr-overlay': boxShadow['overlay'],
        'kr-brand':   boxShadow['brand'],
        'kr-danger':  boxShadow['danger'],
      },

      // ── Z-INDEX ────────────────────────────────────────────────────────────
      zIndex: {
        'kr-base':     String(zIndex.base),
        'kr-raised':   String(zIndex.raised),
        'kr-dropdown': String(zIndex.dropdown),
        'kr-sticky':   String(zIndex.sticky),
        'kr-overlay':  String(zIndex.overlay),
        'kr-modal':    String(zIndex.modal),
        'kr-toast':    String(zIndex.toast),
        'kr-tooltip':  String(zIndex.tooltip),
      },

      // ── TRANSITIONS ────────────────────────────────────────────────────────
      transitionDuration: {
        'kr-fast':    '150ms',
        'kr-default': '200ms',
        'kr-slow':    '300ms',
      },
      transitionTimingFunction: {
        'kr-default': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'kr-spring':  'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },

  plugins: [
    // @tailwindcss/forms — reset browser form styling to be customizable
    require('@tailwindcss/forms'),
    // @tailwindcss/typography — prose classes for article/documentation content
    require('@tailwindcss/typography'),
    // Custom component layer plugin — shared states: buttons, inputs, cards, badges
    componentStatesPlugin(),
  ],
};

/**
 * componentStatesPlugin
 *
 * Defines reusable Tailwind component classes in the @layer components layer.
 * This is the ONE place where hover/focus-visible/active/disabled/loading/error
 * states are defined. No per-page ad hoc state styles.
 *
 * Classes defined:
 *   .kr-btn-primary    .kr-btn-secondary    .kr-btn-ghost    .kr-btn-danger
 *   .kr-btn-loading    .kr-btn-sm           .kr-btn-lg
 *   .kr-input          .kr-input-error
 *   .kr-label          .kr-hint             .kr-error-msg
 *   .kr-card           .kr-card-interactive
 *   .kr-badge-draft    .kr-badge-published  .kr-badge-pending  .kr-badge-rejected
 *   .kr-badge-customs  .kr-badge-cross-border
 *   .kr-focus-ring
 */
function componentStatesPlugin() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const plugin = require('tailwindcss/plugin');
  return plugin(({ addComponents, theme }: any) => {
    addComponents({
      // ── Focus ring (shared, WCAG focus-visible) ───────────────────────────
      '.kr-focus-ring': {
        '&:focus-visible': {
          outline: 'none',
          boxShadow: '0 0 0 3px var(--kr-border-focus)',
        },
      },

      // ── Buttons ───────────────────────────────────────────────────────────
      '.kr-btn-base': {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        paddingLeft: spacing['btn-px'],
        paddingRight: spacing['btn-px'],
        paddingTop: spacing['btn-py'],
        paddingBottom: spacing['btn-py'],
        borderRadius: borderRadius.DEFAULT,
        fontFamily: typography.fontFamily.body.join(', '),
        fontSize: '0.875rem',
        fontWeight: '500',
        lineHeight: '1.25rem',
        transition: 'background-color 150ms ease, box-shadow 150ms ease, opacity 150ms ease',
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        '&:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px var(--kr-border-focus)' },
        '&:disabled, &[aria-disabled="true"]': {
          opacity: '0.45',
          cursor: 'not-allowed',
          pointerEvents: 'none',
        },
        // Loading state — used by aria-busy or .is-loading class
        '&[aria-busy="true"], &.is-loading': {
          opacity: '0.7',
          cursor: 'wait',
          pointerEvents: 'none',
        },
      },
      '.kr-btn-primary': {
        '@apply kr-btn-base': {},
        backgroundColor: 'var(--kr-fill-brand)',
        color: '#FFFFFF',
        border: '1px solid transparent',
        '&:hover:not(:disabled)': { backgroundColor: 'var(--kr-fill-brand-hover)' },
        '&:active:not(:disabled)': { backgroundColor: 'var(--kr-fill-brand-active)' },
      },
      '.kr-btn-secondary': {
        '@apply kr-btn-base': {},
        backgroundColor: 'transparent',
        color: 'var(--kr-fill-brand)',
        border: '1px solid var(--kr-border-brand)',
        '&:hover:not(:disabled)': { backgroundColor: 'var(--kr-fill-brand-subtle)' },
        '&:active:not(:disabled)': { opacity: '0.85' },
      },
      '.kr-btn-ghost': {
        '@apply kr-btn-base': {},
        backgroundColor: 'transparent',
        color: 'var(--kr-text-secondary)',
        border: '1px solid transparent',
        '&:hover:not(:disabled)': { backgroundColor: 'var(--kr-bg-sunken)' },
        '&:active:not(:disabled)': { opacity: '0.75' },
      },
      '.kr-btn-danger': {
        '@apply kr-btn-base': {},
        backgroundColor: 'var(--kr-fill-danger)',
        color: '#FFFFFF',
        border: '1px solid transparent',
        '&:hover:not(:disabled)': { backgroundColor: 'var(--kr-fill-danger-hover)' },
        '&:active:not(:disabled)': { opacity: '0.85' },
        '&:focus-visible': { boxShadow: '0 0 0 3px var(--kr-border-danger)' },
      },
      '.kr-btn-sm': { padding: '0.375rem 0.75rem', fontSize: '0.8125rem' },
      '.kr-btn-lg': { padding: '0.75rem 1.5rem', fontSize: '1rem' },

      // ── Inputs ────────────────────────────────────────────────────────────
      '.kr-input': {
        display: 'block',
        width: '100%',
        height: spacing['input-h'],
        paddingLeft: spacing['input-px'],
        paddingRight: spacing['input-px'],
        backgroundColor: 'var(--kr-bg-surface)',
        color: 'var(--kr-text-primary)',
        border: '1px solid var(--kr-border-default)',
        borderRadius: borderRadius.DEFAULT,
        fontSize: '0.875rem',
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
        '&::placeholder': { color: 'var(--kr-text-disabled)' },
        '&:hover:not(:disabled):not(:focus)': { borderColor: 'var(--kr-border-strong)' },
        '&:focus': {
          outline: 'none',
          borderColor: 'var(--kr-border-focus)',
          boxShadow: '0 0 0 3px rgba(245,166,35,0.2)',
        },
        '&:disabled': {
          opacity: '0.5',
          cursor: 'not-allowed',
          backgroundColor: 'var(--kr-bg-sunken)',
        },
      },
      '.kr-input-error': {
        borderColor: 'var(--kr-border-danger)',
        '&:focus': {
          borderColor: 'var(--kr-border-danger)',
          boxShadow: '0 0 0 3px rgba(192,57,43,0.2)',
        },
      },

      // ── Form labels & hints ────────────────────────────────────────────────
      '.kr-label': {
        display: 'block',
        fontSize: '0.875rem',
        fontWeight: '500',
        color: 'var(--kr-text-primary)',
        marginBottom: '0.375rem',
      },
      '.kr-hint': {
        fontSize: '0.75rem',
        color: 'var(--kr-text-secondary)',
        marginTop: '0.25rem',
      },
      '.kr-error-msg': {
        fontSize: '0.75rem',
        color: 'var(--kr-text-danger)',
        marginTop: '0.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem',
      },

      // ── Cards ──────────────────────────────────────────────────────────────
      '.kr-card': {
        backgroundColor: 'var(--kr-bg-surface)',
        border: '1px solid var(--kr-border-default)',
        borderRadius: borderRadius.md,
        padding: spacing['card-p'],
        boxShadow: boxShadow.card,
      },
      '.kr-card-interactive': {
        '@apply kr-card': {},
        cursor: 'pointer',
        transition: 'box-shadow 150ms ease, border-color 150ms ease',
        '&:hover': {
          borderColor: 'var(--kr-border-brand)',
          boxShadow: boxShadow['card-md'],
        },
        '&:active': { boxShadow: boxShadow.card },
        '&:focus-visible': {
          outline: 'none',
          boxShadow: '0 0 0 3px var(--kr-border-focus)',
        },
      },

      // ── Badges ─────────────────────────────────────────────────────────────
      '.kr-badge': {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        paddingLeft: '0.5rem',
        paddingRight: '0.5rem',
        paddingTop: '0.125rem',
        paddingBottom: '0.125rem',
        borderRadius: borderRadius.full,
        fontSize: '0.75rem',
        fontWeight: '500',
        lineHeight: '1.25rem',
        whiteSpace: 'nowrap',
      },
      '.kr-badge-draft':       { '@apply kr-badge': {}, backgroundColor: 'var(--kr-badge-draft-bg)',      color: 'var(--kr-badge-draft-text)' },
      '.kr-badge-published':   { '@apply kr-badge': {}, backgroundColor: 'var(--kr-badge-published-bg)',  color: 'var(--kr-badge-published-text)' },
      '.kr-badge-pending':     { '@apply kr-badge': {}, backgroundColor: 'var(--kr-badge-pending-bg)',    color: 'var(--kr-badge-pending-text)' },
      '.kr-badge-rejected':    { '@apply kr-badge': {}, backgroundColor: 'var(--kr-badge-rejected-bg)',   color: 'var(--kr-badge-rejected-text)' },
      // Domain-specific
      '.kr-badge-customs':     { '@apply kr-badge kr-badge-pending': {} },
      '.kr-badge-cross-border':{ '@apply kr-badge': {}, backgroundColor: 'var(--kr-fill-brand-subtle)', color: 'var(--kr-text-brand)' },
      '.kr-badge-verified':    { '@apply kr-badge kr-badge-published': {} },
      '.kr-badge-kyc-pending': { '@apply kr-badge kr-badge-pending': {} },
      '.kr-badge-kyc-rejected':{ '@apply kr-badge kr-badge-rejected': {} },
    });
  });
}

export default config;
