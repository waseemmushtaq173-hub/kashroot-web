import type { SVGProps } from 'react';

/**
 * Shikara — the KashRoot brand mark.
 *
 * A shikara on Dal Lake with the Zabarwan range behind it. The shikara is the
 * more specific signal of place: the Chinar grows across the Valley and beyond
 * it, but the canopied boat on the Dal is Kashmir in one silhouette, and it
 * carries the lake, the mountains and the trade on the water at the same time.
 *
 * Drawn as line art — four stroked paths, no fill, no gradient:
 *
 *   1. the mountain ridge, two peaks
 *   2. the water: the horizon either side of the hull, and two ripple lines
 *   3. the hull, one continuous stroke from prow tip to stern tip
 *   4. the canopy: two posts and the drooping roof
 *
 * Strokes are `vectorEffect="non-scaling-stroke"`, so the line weight stays
 * constant whether the mark is 20px in the header or 224px in the hero. Without
 * it the lines would scale with the viewBox — hairline in the header, heavy in
 * the hero — and the mark would need two drawings instead of one.
 *
 * Rendered in `currentColor`, so it takes the surrounding text colour and works
 * on the brand saffron, on white, or knocked out of a dark panel.
 *
 * ACCESSIBILITY — the mark is decorative nearly everywhere it appears (it sits
 * beside the wordmark, which already names the brand), so it is `aria-hidden` by
 * default. Pass `title` only when the mark is the sole label for something and
 * needs to be announced; that promotes it to a labelled `img` and drops the
 * `aria-hidden`.
 */
export function Shikara({
  title,
  strokeWidth = 2,
  ...props
}: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg
      viewBox="0 0 120 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...props}
    >
      {title ? <title>{title}</title> : null}

      {/* Zabarwan ridge — two peaks, asymmetric so it reads as land, not a graph. */}
      <path d="M14 54 L38 22 L52 36 L72 12 L96 54" vectorEffect="non-scaling-stroke" />

      {/*
        Water. One path, four subpaths: the horizon runs in from both edges and
        stops short of the hull so the boat sits *on* the lake rather than
        skewered by a line, then two ripples below.
      */}
      <path
        d="M2 58 H28 M92 58 H118 M14 68 H42 M78 68 H106"
        vectorEffect="non-scaling-stroke"
      />

      {/*
        Hull. A single unbroken stroke: up the prow, down onto the gunwale, along
        the shallow crescent of the bottom, and back up to the stern. The raised
        prow and stern are the shikara's own line — a plain rowboat would be just
        the middle curve.
      */}
      <path
        d="M26 51 Q28 56 32 58 Q60 74 88 58 Q92 56 94 51"
        vectorEffect="non-scaling-stroke"
      />

      {/* Canopy — two posts, and the roof drooping past them at both ends. */}
      <path
        d="M48 58 V41 M72 58 V41 M40 47 Q60 28 80 47"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * BrandMark — the mark locked up with the wordmark.
 *
 * The mark sits in a sharp brand rectangle rather than floating loose, so the
 * lockup and the wordmark share a baseline grid. Sized by `size` so the same
 * lockup works in the header, the footer and a hero panel.
 */
export function BrandMark({
  className = '',
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const box = { sm: 'h-8 w-8', md: 'h-9 w-9', lg: 'h-12 w-12' }[size];
  const mark = { sm: 'h-5 w-5', md: 'h-6 w-6', lg: 'h-8 w-8' }[size];
  const word = { sm: 'text-lg', md: 'text-xl', lg: 'text-2xl' }[size];

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`${box} inline-flex shrink-0 items-center justify-center bg-kr-primary-500 text-white`}
      >
        <Shikara className={mark} />
      </span>
      <span
        className={`font-heading font-bold tracking-tight text-kr-text-primary ${word}`}
      >
        KashRoot
      </span>
    </span>
  );
}
