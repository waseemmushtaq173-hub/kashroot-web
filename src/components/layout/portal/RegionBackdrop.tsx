'use client';

/**
 * The region skin behind a portal page (lib/regionSkins): the person's
 * state's photograph as a soft band at the top of the page, washed with the
 * KashRoot ivory so the words in front stay easy to read, and fading into
 * the page. It is the first thing painted at the top of a portal page (its
 * largest paint), so it loads at once and first, as AVIF (WebP where AVIF is
 * not taken): computers get the copy their screen needs (1280 / 1920 px); phones
 * the 640 px one — at a third of full strength under the ivory wash, a softer
 * copy looks the same and arrives four times sooner. If it
 * does not load, the drawn backdrop alone shows (KashmirBackdrop). Decorative:
 * hidden from screen readers.
 */
import { useState } from 'react';

import { useRegion } from '@/lib/region';
import { skinFor } from '@/lib/regionSkins';

/** Phones (pages laid out under 1024 px): the 640 px copy; computers: as wide as the screen. */
const SIZES = '(max-width: 1023px) 360px, 100vw';

export function RegionBackdrop() {
  const { region } = useRegion();
  const skin = skinFor(region?.state);
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === skin.folder) return null;
  const base = `/regions/${skin.folder}`;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 -z-20 h-[clamp(260px,42vh,420px)] select-none overflow-hidden print:hidden" data-region-skin={skin.folder}>
      <picture>
        <source type="image/avif" srcSet={`${base}/hero-640.avif 640w, ${base}/hero-1280.avif 1280w, ${base}/hero-1920.avif 1920w`} sizes={SIZES} />
        <source type="image/webp" srcSet={`${base}/hero-640.webp 640w, ${base}/hero-1280.webp 1280w, ${base}/hero-1920.webp 1920w`} sizes={SIZES} />
        <img
          src={`${base}/hero-1280.webp`}
          alt=""
          aria-hidden
          loading="eager"
          decoding="async"
          fetchPriority="high"
          onError={() => setFailed(skin.folder)}
          style={{ objectPosition: skin.focus }}
          className="absolute inset-0 h-full w-full object-cover opacity-[0.32] saturate-[0.85]"
        />
      </picture>
      {/* The KashRoot ivory over it, and a fade into the page below. */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#fbf8f1]/50 via-[#fbf8f1]/70 to-[#fbf8f1]" />
    </div>
  );
}
