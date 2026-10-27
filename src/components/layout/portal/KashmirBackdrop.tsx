/**
 * KashmirBackdrop — the valley drawn faintly behind every portal page:
 * chinar leaves drifting from the top corner, the Zabarwan ridge over the
 * Pir Panjal, and a shikara on Dal Lake with its reflection.
 *
 * Inline SVG at very low contrast, in the portal's own colours (`ink` for the
 * land and water, `leaf` for the chinar). No images, no script, no animation.
 * It covers the frame it sits in and stays in view while the page scrolls
 * (a sticky screen-tall layer: clipped to the frame, so it never paints over
 * a banner above it). Decorative only: hidden from screen readers and taps.
 */
import { CHINAR_PATH } from '@/components/brand/Emblem';

const VEINS = 'M60 84 L60 14 M60 74 L98 24 M60 74 L22 24 M60 79 L99 75 M60 79 L21 75 M60 84 L60 112';

/** Leaves: position (% of the screen), size (px), turn (deg), strength. */
const LEAVES: { x: string; y: string; size: number; turn: number; o: number }[] = [
  { x: '78%', y: '-5%', size: 340, turn: 18, o: 0.8 },
  { x: '-5%', y: '36%', size: 190, turn: -28, o: 0.8 },
  { x: '63%', y: '17%', size: 64, turn: 42, o: 0.9 },
  { x: '44%', y: '6%', size: 44, turn: -16, o: 0.8 },
  { x: '91%', y: '44%', size: 58, turn: 66, o: 0.8 },
  { x: '27%', y: '58%', size: 48, turn: 128, o: 0.6 },
];

// The ridges are drawn across a 1600 × 340 band stretched to the screen width.
const FAR_RANGE =
  'M0 196 C80 180 130 150 210 158 S330 186 400 160 S520 120 600 138 S720 176 800 150 S930 112 1010 128 S1130 170 1220 148 S1360 118 1440 136 S1560 162 1600 150 V340 H0 Z';
const ZABARWAN_LINE =
  'M0 250 C90 238 160 214 240 222 C310 229 350 206 420 186 L470 168 C490 162 505 170 520 178 L560 196 C590 206 620 190 660 170 L720 132 C735 124 748 126 760 134 L820 176 C860 202 910 214 980 206 C1060 196 1110 178 1180 186 C1250 194 1300 214 1380 210 C1460 206 1530 222 1600 230';
const RIPPLES = 'M120 292 H260 M340 306 H420 M600 322 H700 M980 298 H1140 M1240 314 H1330 M1420 290 H1520 M40 326 H110';

/** A shikara: crescent hull, curved canopy on three posts, the boatman and his heart-shaped paddle. */
function ShikaraArt({ ink, canopy, className }: { ink: string; canopy: string; className: string }) {
  const hull = 'M6 40 Q14 54 40 60 L160 60 Q186 54 194 40 Q184 70 100 72 Q16 70 6 40 Z';
  return (
    <svg viewBox="0 0 200 100" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M54 40 Q100 20 146 40 L140 43 Q100 27 60 43 Z" fill={canopy} fillOpacity="0.16" stroke={ink} strokeOpacity="0.24" strokeWidth="1.4" />
      <path d="M64 42 V60 M100 33 V60 M136 42 V60" stroke={ink} strokeOpacity="0.24" strokeWidth="1.4" />
      <path d={hull} fill={ink} fillOpacity="0.1" stroke={ink} strokeOpacity="0.26" strokeWidth="1.5" />
      <circle cx="177" cy="29" r="4" fill={ink} fillOpacity="0.22" />
      <path d="M177 34 L173 52 M186 20 L162 70" stroke={ink} strokeOpacity="0.24" strokeWidth="1.4" />
      <path d="M162 70 C155 70 155 79 161 81 C167 79 168 72 162 70 Z" fill={ink} fillOpacity="0.16" />
      {/* Its reflection on the still water. */}
      <g transform="translate(0 144) scale(1 -1)" opacity="0.4">
        <path d={hull} fill={ink} fillOpacity="0.08" />
      </g>
      <path d="M0 74 H58 M142 74 H200 M30 84 H84 M118 88 H170" stroke={ink} strokeOpacity="0.14" strokeWidth="1.2" />
    </svg>
  );
}

export function KashmirBackdrop({ ink, leaf }: { ink: string; leaf: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 select-none overflow-clip print:hidden">
      <div className="sticky top-0 h-svh w-full">
        {/* Chinar leaves */}
        <svg className="absolute inset-0 h-full w-full" fill="none">
          <defs>
            <symbol id="kr-backdrop-leaf" viewBox="0 0 120 120">
              <path d={CHINAR_PATH} strokeWidth="1.4" strokeLinejoin="round" />
              <path d={VEINS} fill="none" strokeWidth="1.1" strokeLinecap="round" />
            </symbol>
          </defs>
          {LEAVES.map((l) => (
            <svg key={`${l.x}${l.y}`} x={l.x} y={l.y} width={l.size} height={l.size} overflow="visible">
              <g transform={`rotate(${l.turn} ${l.size / 2} ${l.size / 2})`} opacity={l.o}>
                <use href="#kr-backdrop-leaf" width={l.size} height={l.size} fill={leaf} fillOpacity="0.075" stroke={leaf} strokeOpacity="0.16" />
              </g>
            </svg>
          ))}
        </svg>

        {/* Pir Panjal far off, the Zabarwan ridge, and Dal Lake at its foot */}
        <div className="absolute inset-x-0 bottom-0 h-[clamp(170px,34vh,340px)]">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1600 340" preserveAspectRatio="none">
            <path d={FAR_RANGE} fill={ink} fillOpacity="0.035" />
            <path d={`${ZABARWAN_LINE} V340 H0 Z`} fill={ink} fillOpacity="0.05" />
            <path d={ZABARWAN_LINE} fill="none" stroke={ink} strokeOpacity="0.16" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            <rect x="0" y="268" width="1600" height="72" fill={ink} fillOpacity="0.035" />
            <g transform="translate(0 536) scale(1 -1)">
              <path d={`${ZABARWAN_LINE} V340 H0 Z`} fill={ink} fillOpacity="0.025" />
            </g>
            <path d="M0 268 H1600" stroke={ink} strokeOpacity="0.12" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <path d={RIPPLES} stroke={ink} strokeOpacity="0.12" strokeWidth="1.2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <ShikaraArt ink={ink} canopy={leaf} className="absolute bottom-[2%] left-[54%] w-[clamp(150px,16vw,260px)]" />
          <ShikaraArt ink={ink} canopy={leaf} className="absolute bottom-[13%] left-[16%] w-[clamp(64px,6vw,104px)] opacity-60" />
        </div>
      </div>
    </div>
  );
}
