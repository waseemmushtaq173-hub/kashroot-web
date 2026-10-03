import type { SVGProps } from 'react';

/**
 * ChinarLeaf — the KashRoot brand mark.
 *
 * The Chinar (Platanus orientalis) is the tree of Kashmir: planted along the
 * Mughal gardens and the Dal, and a far stronger signal of place than the word
 * "Kashmir" set in large type. So this carries the identity and the wordmark
 * stays quiet next to it.
 *
 * Drawn as five leaflets fanned from a single point on a stem — the palmately
 * lobed silhouette of a plane-tree leaf, reduced to its geometry. No outline,
 * no gradient, no detail that would dissolve at 16px; the outer pair is shorter
 * than the centre so the silhouette reads as a leaf rather than a star.
 *
 * Rendered in `currentColor`, so it takes the surrounding text colour and works
 * on the brand saffron, on white, or knocked out of a dark panel.
 *
 * ACCESSIBILITY — the leaf is decorative nearly everywhere it appears (it sits
 * beside the wordmark, which already names the brand), so it is `aria-hidden` by
 * default. Pass `title` only when the mark is the sole label for something and
 * needs to be announced; that promotes it to a labelled `img` and drops the
 * `aria-hidden`.
 */
export function ChinarLeaf({
  title,
  ...props
}: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg
      viewBox="0 0 100 110"
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...props}
    >
      {title ? <title>{title}</title> : null}

      {/* Stem — squared off at the base, matching the rectangular geometry. */}
      <path d="M50 108V64" stroke="currentColor" strokeWidth="3.5" />

      {/* Leaflets, fanned about the stem head at (50, 66). */}
      <g fill="currentColor">
        {/* Centre lobe — longest, sits straight up the axis. */}
        <path d="M50 66C39 44.2 39 25.4 50 14C61 25.4 61 44.2 50 66Z" />

        {/* Inner pair. */}
        <path
          d="M50 66C40.5 47.5 40.5 31.7 50 22C59.5 31.7 59.5 47.5 50 66Z"
          transform="rotate(36 50 66)"
        />
        <path
          d="M50 66C40.5 47.5 40.5 31.7 50 22C59.5 31.7 59.5 47.5 50 66Z"
          transform="rotate(-36 50 66)"
        />

        {/* Outer pair — shorter and laid out flatter, widening the silhouette. */}
        <path
          d="M50 66C42.5 52.4 42.5 40.6 50 30C57.5 40.6 57.5 52.4 50 66Z"
          transform="rotate(72 50 66)"
        />
        <path
          d="M50 66C42.5 52.4 42.5 40.6 50 30C57.5 40.6 57.5 52.4 50 66Z"
          transform="rotate(-72 50 66)"
        />
      </g>
    </svg>
  );
}

/**
 * BrandMark — the leaf locked up with the wordmark.
 *
 * The leaf sits in a sharp brand square rather than floating loose, so the mark
 * and the wordmark share a baseline grid. Sized by `size` so the same lockup
 * works in the header, the footer and a hero panel.
 */
export function BrandMark({
  className = '',
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const box = { sm: 'h-8 w-8', md: 'h-9 w-9', lg: 'h-12 w-12' }[size];
  const leaf = { sm: 'h-5 w-5', md: 'h-6 w-6', lg: 'h-8 w-8' }[size];
  const word = { sm: 'text-lg', md: 'text-xl', lg: 'text-2xl' }[size];

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`${box} inline-flex shrink-0 items-center justify-center bg-kr-primary-500 text-white`}
      >
        <ChinarLeaf className={leaf} />
      </span>
      <span
        className={`font-heading font-bold tracking-tight text-kr-text-primary ${word}`}
      >
        KashRoot
      </span>
    </span>
  );
}
