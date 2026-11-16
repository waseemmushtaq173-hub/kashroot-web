/**
 * How a lot of apples is packed, as a farmer states it: the grade (A or B) and the box layers. There are mainly two kinds
 * of box, 4 layer (larger fruit, fewer in a box) and 5 layer (the standard), and a lot may have only 4, only 5, or both.
 * Kept as plain words in market_listings.grade and market_listings.packing_layers, so older listings read as they were saved.
 */
export const GRADE_CHOICES = ['A', 'B'] as const;

export interface LayerChoice {
  /** What is saved in market_listings.packing_layers. */
  value: string;
  label: string;
  note: string;
  /** Saved in market_listings.apples_per_box: the usual count in a box of this kind. */
  apples: string;
}
export const LAYER_CHOICES: LayerChoice[] = [
  { value: '4 Layer', label: '4 layer', note: 'Large / Extra Fancy', apples: '~80–100 apples' },
  { value: '5 Layer', label: '5 layer', note: 'Medium / Standard', apples: '~125–150 apples' },
  { value: '4 Layer + 5 Layer', label: 'Both 4 and 5 layer', note: 'This lot has both kinds of box', apples: '~80–100 apples (4 layer) · ~125–150 apples (5 layer)' },
];

/** The usual apple count for a packing choice; null for anything else (an older listing's own words are left alone). */
export const applesFor = (packing: string | null | undefined): string | null => LAYER_CHOICES.find((c) => c.value === packing)?.apples ?? null;

/** The layer count when a packing names exactly one ("4 Layer", "2 Layer (Half Box)"): only that can be drawn as one box. */
export function singleLayerCount(packing: string | null | undefined): number | null {
  const text = (packing ?? '').trim();
  if (/[+&]|\band\b/i.test(text)) return null;
  const m = /^(\d)\s*layer\b/i.exec(text);
  return m ? Number(m[1]) : null;
}
