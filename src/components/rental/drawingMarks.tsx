/**
 * Marks that make a to-scale drawing measurable: a scale bar (a round length
 * in the owner's unit, drawn at the drawing's own pixels per metre) and
 * dimension lines (a line with end ticks and its length on it). Shared by the
 * owner's drawing (owner/StoreDrawing) and the farmer's (three/StoreTopView).
 */
import { FOOT, type SizeUnit } from '@/lib/coldLayout';

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];

/**
 * The scale bar's length: the roundest step (1, 2, 5, 10, 20, 25, 50… in the
 * unit shown) no longer than `most` metres. Returns metres and the words.
 */
export function scaleLength(most: number, unit: SizeUnit): { metres: number; text: string } {
  const per = unit === 'ft' ? FOOT : 1;
  const room = most / per;
  const step = [...STEPS].reverse().find((s) => s <= room) ?? 1;
  return { metres: step * per, text: `${step} ${unit}` };
}

/** A scale bar with its left end at (x, y): black and white halves, ticks at the ends and middle, the length beside it. */
export function ScaleBar({ x, y, k, most, unit, font }: { x: number; y: number; k: number; most: number; unit: SizeUnit; font: number }) {
  const { metres, text } = scaleLength(most, unit);
  const w = metres * k;
  return (
    <g data-scale-bar={text} data-scale-px={w.toFixed(2)} aria-hidden>
      <rect x={x} y={y - 3} width={w / 2} height={6} fill="#0f172a" />
      <rect x={x + w / 2} y={y - 3} width={w / 2} height={6} fill="#ffffff" stroke="#0f172a" strokeWidth={1} />
      {[0, 0.5, 1].map((t) => (
        <line key={t} x1={x + w * t} y1={y - 7} x2={x + w * t} y2={y + 7} stroke="#0f172a" strokeWidth={1.5} />
      ))}
      <text x={x + w + 8} y={y} dominantBaseline="central" fontSize={font} fontWeight={700} fill="#0f172a">
        {text}
      </text>
    </g>
  );
}

/**
 * A dimension line from (x1, y1) to (x2, y2) in drawing pixels, with ticks
 * across each end and `text` in its middle (on a halo, so the line shows
 * through only round the words). Upright lines carry their words turned.
 */
export function DimLine({ x1, y1, x2, y2, text, font, color = '#334155', halo = '#f8fafc', dim }: { x1: number; y1: number; x2: number; y2: number; text: string; font: number; color?: string; halo?: string; dim?: string }) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  // Ticks across the line (a little slanted, as on a builder's drawing).
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  const t = 6;
  const tick = (x: number, y: number) => <line x1={x - nx * t - ny * t * 0.5} y1={y - ny * t + nx * t * 0.5} x2={x + nx * t + ny * t * 0.5} y2={y + ny * t - nx * t * 0.5} stroke={color} strokeWidth={1.5} />;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const upright = Math.abs(x2 - x1) < Math.abs(y2 - y1);
  return (
    <g data-dim={dim} data-dim-px={len.toFixed(2)}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.2} />
      {tick(x1, y1)}
      {tick(x2, y2)}
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={font} fontWeight={700} fill={color} stroke={halo} strokeWidth={5} paintOrder="stroke" transform={upright ? `rotate(-90 ${cx} ${cy})` : undefined}>
        {text}
      </text>
    </g>
  );
}
